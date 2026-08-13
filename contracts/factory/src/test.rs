#![cfg(test)]

use super::{EscrowFactory, EscrowFactoryClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env};

struct Fixture {
    env: Env,
    buyer: Address,
    seller: Address,
    arbiter: Address,
    token: Address,
    factory_id: Address,
}

impl Fixture {
    fn factory(&self) -> EscrowFactoryClient<'_> {
        EscrowFactoryClient::new(&self.env, &self.factory_id)
    }
}

fn setup() -> Fixture {
    let env = Env::default();
    let factory_id = env.register(EscrowFactory, ());

    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();

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
fn create_escrow_increments_and_indexes() {
    let f = setup();
    let factory = f.factory();
    let amount = 100i128;
    let timeout = 3600u64;
    let arbiter_opt = Some(f.arbiter.clone());

    f.env.mock_all_auths();
    let id0 = factory.create_escrow(
        &f.buyer,
        &f.seller,
        &arbiter_opt,
        &f.token,
        &amount,
        &timeout,
    );
    let id1 = factory.create_escrow(
        &f.buyer,
        &f.seller,
        &arbiter_opt,
        &f.token,
        &amount,
        &timeout,
    );

    assert_eq!(id0, 0);
    assert_eq!(id1, 1);
    assert_eq!(factory.escrow_count(), 2);

    assert!(factory.get_escrow(&0u32).is_some());
    assert!(factory.get_escrow(&1u32).is_some());
    assert!(factory.get_escrow(&2u32).is_none());
}

#[test]
fn create_escrow_rejects_invalid_parameters() {
    let f = setup();
    let factory = f.factory();
    let amount = 100i128;
    let timeout = 3600u64;
    let arbiter_opt = Some(f.arbiter.clone());
    let none_arbiter = None::<Address>;

    f.env.mock_all_auths();

    // Zero amount.
    let zero_amount = 0i128;
    assert!(factory
        .try_create_escrow(
            &f.buyer,
            &f.seller,
            &arbiter_opt,
            &f.token,
            &zero_amount,
            &timeout
        )
        .is_err());

    // Zero timeout.
    let zero_timeout = 0u64;
    assert!(factory
        .try_create_escrow(
            &f.buyer,
            &f.seller,
            &arbiter_opt,
            &f.token,
            &amount,
            &zero_timeout
        )
        .is_err());

    // Buyer and seller are the same address.
    assert!(factory
        .try_create_escrow(
            &f.buyer,
            &f.buyer,
            &none_arbiter,
            &f.token,
            &amount,
            &timeout
        )
        .is_err());

    // Arbiter matches the buyer.
    let arbiter_is_buyer = Some(f.buyer.clone());
    assert!(factory
        .try_create_escrow(
            &f.buyer,
            &f.seller,
            &arbiter_is_buyer,
            &f.token,
            &amount,
            &timeout
        )
        .is_err());

    // Nothing was created.
    assert_eq!(factory.escrow_count(), 0);
}
