//! End-to-end integration tests: deploy the factory, create escrows through it,
//! and drive each lifecycle path across the contract boundary.

#![cfg(test)]

mod escrow_contract {
    soroban_sdk::contractimport!(file = "../target/wasm32v1-none/release/escrow.wasm");
}

mod factory_contract {
    soroban_sdk::contractimport!(file = "../target/wasm32v1-none/release/escrow_factory.wasm");
}

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::token::{StellarAssetClient, TokenClient};
use soroban_sdk::{Address, BytesN, Env, Val, Vec};

const AMOUNT: i128 = 1_000;
const TIMEOUT: u64 = 3_600;

struct Fixture {
    env: Env,
    buyer: Address,
    seller: Address,
    arbiter: Address,
    token: Address,
    factory_id: Address,
}

impl Fixture {
    fn factory(&self) -> factory_contract::Client<'_> {
        factory_contract::Client::new(&self.env, &self.factory_id)
    }

    fn escrow(&self, id: &Address) -> escrow_contract::Client<'_> {
        escrow_contract::Client::new(&self.env, id)
    }

    fn token_client(&self) -> TokenClient<'_> {
        TokenClient::new(&self.env, &self.token)
    }

    /// Create an escrow through the factory and return its address.
    fn create_escrow(&self) -> Address {
        let factory = self.factory();
        let arbiter = Some(self.arbiter.clone());
        let id = factory.create_escrow(
            &self.buyer,
            &self.seller,
            &arbiter,
            &self.token,
            &AMOUNT,
            &TIMEOUT,
        );
        assert_eq!(id, 0);
        factory.get_escrow(&id).unwrap()
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

    let token_admin = StellarAssetClient::new(&env, &token);
    env.mock_all_auths();
    token_admin.mint(&buyer, &AMOUNT);

    // Deploy the factory, running its constructor (which uploads the escrow Wasm).
    let deployer = Address::generate(&env);
    let factory_wasm_hash = env.deployer().upload_contract_wasm(factory_contract::WASM);
    let salt = BytesN::from_array(&env, &[0u8; 32]);
    let args = Vec::<Val>::new(&env);
    let factory_id = env
        .deployer()
        .with_address(deployer, salt)
        .deploy_v2(factory_wasm_hash, args);

    Fixture {
        env,
        buyer,
        seller,
        arbiter,
        token,
        factory_id,
    }
}

#[test]
fn full_lifecycle_confirm_releases_to_seller() {
    let f = setup();
    let escrow_id = f.create_escrow();
    let escrow = f.escrow(&escrow_id);

    f.env.mock_all_auths();
    escrow.deposit();
    escrow.mark_delivered();
    escrow.confirm();

    assert_eq!(f.token_client().balance(&f.seller), AMOUNT);
    assert_eq!(f.token_client().balance(&escrow_id), 0);
}

#[test]
fn full_lifecycle_dispute_resolve_refunds_buyer() {
    let f = setup();
    let escrow_id = f.create_escrow();
    let escrow = f.escrow(&escrow_id);

    f.env.mock_all_auths();
    escrow.deposit();
    escrow.mark_delivered();
    escrow.dispute();
    escrow.resolve(&false);

    assert_eq!(f.token_client().balance(&f.buyer), AMOUNT);
}

#[test]
fn full_lifecycle_timeout_auto_releases() {
    let f = setup();
    let escrow_id = f.create_escrow();
    let escrow = f.escrow(&escrow_id);

    f.env.mock_all_auths();
    escrow.deposit();
    escrow.mark_delivered();

    f.env.ledger().set_timestamp(TIMEOUT + 1);
    escrow.release();

    assert_eq!(f.token_client().balance(&f.seller), AMOUNT);
}

#[test]
fn multiple_concurrent_escrows_are_independent() {
    let f = setup();

    // A second buyer/seller pair sharing the same factory.
    let buyer2 = Address::generate(&f.env);
    let seller2 = Address::generate(&f.env);
    let token_admin = StellarAssetClient::new(&f.env, &f.token);
    f.env.mock_all_auths();
    token_admin.mint(&buyer2, &AMOUNT);

    let factory = f.factory();
    let arbiter_opt = Some(f.arbiter.clone());
    let id0 = factory.create_escrow(
        &f.buyer,
        &f.seller,
        &arbiter_opt,
        &f.token,
        &AMOUNT,
        &TIMEOUT,
    );
    let id1 = factory.create_escrow(&buyer2, &seller2, &arbiter_opt, &f.token, &AMOUNT, &TIMEOUT);
    assert_eq!((id0, id1), (0, 1));

    let escrow0 = f.escrow(&factory.get_escrow(&id0).unwrap());
    let escrow1_id = factory.get_escrow(&id1).unwrap();

    // Complete only the first escrow.
    escrow0.deposit();
    escrow0.mark_delivered();
    escrow0.confirm();

    // The first seller is paid, while the second pair is untouched.
    assert_eq!(f.token_client().balance(&f.seller), AMOUNT);
    assert_eq!(f.token_client().balance(&seller2), 0);
    assert_eq!(f.token_client().balance(&escrow1_id), 0);
}
