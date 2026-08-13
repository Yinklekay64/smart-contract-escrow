#![cfg(test)]

use super::Escrow;
use super::EscrowClient;
use crate::errors::EscrowError;
use crate::state::State;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::token::{StellarAssetClient, TokenClient};
use soroban_sdk::{Address, Env};

const AMOUNT: i128 = 1_000;
const TIMEOUT: u64 = 3_600;

struct Fixture {
    env: Env,
    buyer: Address,
    seller: Address,
    arbiter: Address,
    token: Address,
    escrow_id: Address,
}

impl Fixture {
    fn client(&self) -> EscrowClient<'_> {
        EscrowClient::new(&self.env, &self.escrow_id)
    }

    fn token_client(&self) -> TokenClient<'_> {
        TokenClient::new(&self.env, &self.token)
    }
}

fn setup() -> Fixture {
    let env = Env::default();
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let admin = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = sac.address();

    // Fund the buyer so it can cover the escrow deposit.
    let token_admin = StellarAssetClient::new(&env, &token);
    env.mock_all_auths();
    token_admin.mint(&buyer, &AMOUNT);

    let escrow_id = env.register(
        Escrow,
        (
            buyer.clone(),
            seller.clone(),
            Some(arbiter.clone()),
            token.clone(),
            AMOUNT,
            TIMEOUT,
        ),
    );

    Fixture {
        env,
        buyer,
        seller,
        arbiter,
        token,
        escrow_id,
    }
}

#[test]
fn deposit_locks_funds_and_transitions_state() {
    let f = setup();
    let c = f.client();
    assert_eq!(c.state(), State::AwaitingPayment);

    f.env.mock_all_auths();
    c.deposit();

    assert_eq!(c.state(), State::AwaitingDelivery);
    assert_eq!(f.token_client().balance(&f.escrow_id), AMOUNT);
    assert_eq!(f.token_client().balance(&f.buyer), 0);
}

#[test]
fn deposit_authorizes_buyer() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();

    // The contract must have required the buyer's authorization.
    let auths = f.env.auths();
    assert!(auths.iter().any(|(addr, _)| *addr == f.buyer));
}

#[test]
fn deposit_without_authorization_fails() {
    // A dedicated env with no mocked authorization, so `require_auth` fails.
    let env = Env::default();
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    let escrow_id = env.register(
        Escrow,
        (buyer.clone(), seller, Some(arbiter), token, AMOUNT, TIMEOUT),
    );
    let c = EscrowClient::new(&env, &escrow_id);

    assert!(c.try_deposit().is_err());
    assert_eq!(c.state(), State::AwaitingPayment);
}

#[test]
fn deposit_twice_fails() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    assert!(c.try_deposit().is_err());
}

#[test]
fn mark_delivered_sets_deadline() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.mark_delivered();

    assert!(c.delivered());
    assert_eq!(c.deadline(), TIMEOUT); // timestamp 0 + TIMEOUT
    assert_eq!(c.state(), State::AwaitingDelivery);
}

#[test]
fn mark_delivered_authorizes_seller() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.mark_delivered();

    let auths = f.env.auths();
    assert!(auths.iter().any(|(addr, _)| *addr == f.seller));
}

#[test]
fn mark_delivered_twice_fails() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.mark_delivered();
    assert!(c.try_mark_delivered().is_err());
}

#[test]
fn confirm_releases_funds_to_seller() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.mark_delivered();
    c.confirm();

    assert_eq!(c.state(), State::Complete);
    assert_eq!(f.token_client().balance(&f.escrow_id), 0);
    assert_eq!(f.token_client().balance(&f.seller), AMOUNT);
}

#[test]
fn confirm_before_delivery_fails() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    // Seller has not marked delivery yet.
    assert!(c.try_confirm().is_err());
    assert_eq!(c.state(), State::AwaitingDelivery);
}

#[test]
fn confirm_after_window_expired_fails() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.mark_delivered(); // deadline = TIMEOUT

    f.env.ledger().set_timestamp(TIMEOUT + 1);
    assert!(c.try_confirm().is_err());
    assert_eq!(c.state(), State::AwaitingDelivery);
}

#[test]
fn dispute_moves_to_disputed() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.mark_delivered();
    c.dispute();

    assert_eq!(c.state(), State::Disputed);
}

#[test]
fn dispute_after_window_expired_fails() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.mark_delivered();

    f.env.ledger().set_timestamp(TIMEOUT + 1);
    assert!(c.try_dispute().is_err());
    assert_eq!(c.state(), State::AwaitingDelivery);
}

#[test]
fn resolve_releases_to_seller() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.mark_delivered();
    c.dispute();
    c.resolve(&true);

    assert_eq!(c.state(), State::Resolved);
    assert_eq!(f.token_client().balance(&f.seller), AMOUNT);
}

#[test]
fn resolve_refunds_buyer() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.mark_delivered();
    c.dispute();
    c.resolve(&false);

    assert_eq!(c.state(), State::Refunded);
    assert_eq!(f.token_client().balance(&f.buyer), AMOUNT);
}

#[test]
fn resolve_authorizes_arbiter() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.mark_delivered();
    c.dispute();
    c.resolve(&true);

    let auths = f.env.auths();
    assert!(auths.iter().any(|(addr, _)| *addr == f.arbiter));
}

#[test]
fn refund_before_delivery_returns_funds() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.refund();

    assert_eq!(c.state(), State::Refunded);
    assert_eq!(f.token_client().balance(&f.buyer), AMOUNT);
}

#[test]
fn refund_after_delivery_fails() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.mark_delivered();
    assert!(c.try_refund().is_err());
    assert_eq!(c.state(), State::AwaitingDelivery);
}

#[test]
fn release_after_timeout_pays_seller() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.mark_delivered();

    f.env.ledger().set_timestamp(TIMEOUT + 1);
    c.release();

    assert_eq!(c.state(), State::Complete);
    assert_eq!(f.token_client().balance(&f.seller), AMOUNT);
}

#[test]
fn release_before_timeout_fails() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    c.mark_delivered();

    f.env.ledger().set_timestamp(TIMEOUT);
    assert!(c.try_release().is_err());
    assert_eq!(c.state(), State::AwaitingDelivery);
}

#[test]
fn release_before_delivery_fails() {
    let f = setup();
    let c = f.client();
    f.env.mock_all_auths();
    c.deposit();
    // No mark_delivered yet, so there is no deadline to enforce.
    assert!(c.try_release().is_err());
    assert_eq!(c.state(), State::AwaitingDelivery);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn constructor_rejects_zero_amount() {
    let env = Env::default();
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    env.register(
        Escrow,
        (buyer, seller, Some(arbiter), token, 0i128, TIMEOUT),
    );
}

#[test]
#[should_panic(expected = "buyer and seller must differ")]
fn constructor_rejects_same_parties() {
    let env = Env::default();
    let party = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    env.register(
        Escrow,
        (
            party.clone(),
            party,
            None::<Address>,
            token,
            AMOUNT,
            TIMEOUT,
        ),
    );
}

#[test]
#[should_panic(expected = "timeout must be positive")]
fn constructor_rejects_zero_timeout() {
    let env = Env::default();
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    env.register(
        Escrow,
        (buyer, seller, None::<Address>, token, AMOUNT, 0u64),
    );
}

// A tiny guard against an unused-error-code regression: keep the mapping in
// sync with errors.rs by exercising the concrete discriminants.
#[test]
fn error_codes_are_stable() {
    assert_eq!(EscrowError::Unauthorized as u32, 1);
    assert_eq!(EscrowError::InvalidState as u32, 2);
    assert_eq!(EscrowError::WindowExpired as u32, 10);
    assert_eq!(EscrowError::NoArbiter as u32, 11);
}
