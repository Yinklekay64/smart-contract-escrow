#![no_std]

// The Escrow Wasm is embedded at compile time so the factory can deploy child
// instances. The file must be built first: `stellar contract build` from the
// workspace root (or `make build` inside contracts/escrow).
mod escrow_contract {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/escrow.wasm");
}

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    IntoVal, Map, Val, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum FactoryError {
    ZeroAmount = 1,
    ZeroTimeout = 2,
    SameParties = 3,
    InvalidArbiter = 4,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FactoryKey {
    WasmHash,
    Count,
    Escrows,
    UserEscrows,
}

/// Instance/code TTL policy for the long-lived factory index. Ledgers are ~5s
/// apart, so `TTL_THRESHOLD` is ~7 days and `TTL_EXTEND_TO` is ~150 days.
const TTL_THRESHOLD: u32 = 120_960;
const TTL_EXTEND_TO: u32 = 2_592_000;

/// Emitted when the factory deploys a new escrow.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowCreated {
    #[topic]
    pub id: u32,
    pub escrow: Address,
    pub buyer: Address,
    pub seller: Address,
}

/// Deploys and indexes [`Escrow`] instances so a single contract address can
/// manage many concurrent escrows.
#[contract]
pub struct EscrowFactory;

/// Append `id` to the reverse index of escrows a participant is involved in.
fn push_to_user_index(env: &Env, user: &Address, id: u32) {
    let mut index: Map<Address, Vec<u32>> = env
        .storage()
        .instance()
        .get(&FactoryKey::UserEscrows)
        .unwrap();
    let mut ids = index.get(user.clone()).unwrap_or_else(|| Vec::new(env));
    ids.push_back(id);
    index.set(user.clone(), ids);
    env.storage()
        .instance()
        .set(&FactoryKey::UserEscrows, &index);
}

#[contractimpl]
impl EscrowFactory {
    /// Upload the embedded Escrow Wasm once and initialize the index.
    pub fn __constructor(env: Env) {
        let wasm_hash = env.deployer().upload_contract_wasm(escrow_contract::WASM);
        env.storage()
            .instance()
            .set(&FactoryKey::WasmHash, &wasm_hash);
        env.storage().instance().set(&FactoryKey::Count, &0u32);
        env.storage()
            .instance()
            .set(&FactoryKey::Escrows, &Map::<u32, Address>::new(&env));
        env.storage().instance().set(
            &FactoryKey::UserEscrows,
            &Map::<Address, Vec<u32>>::new(&env),
        );
    }

    /// Deploy a new escrow and return its id.
    ///
    /// The buyer authorizes creation; deployment itself happens on behalf of
    /// the factory contract, so the escrow address is deterministic.
    pub fn create_escrow(
        env: Env,
        buyer: Address,
        seller: Address,
        arbiter: Option<Address>,
        token: Address,
        amount: i128,
        timeout: u64,
    ) -> Result<u32, FactoryError> {
        // Keep the factory's index alive; a revert rolls this back.
        let max = env.storage().max_ttl();
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD.min(max), TTL_EXTEND_TO.min(max));

        buyer.require_auth();

        if amount <= 0 {
            return Err(FactoryError::ZeroAmount);
        }
        if timeout == 0 {
            return Err(FactoryError::ZeroTimeout);
        }
        if buyer == seller {
            return Err(FactoryError::SameParties);
        }
        if let Some(a) = &arbiter {
            if *a == buyer || *a == seller {
                return Err(FactoryError::InvalidArbiter);
            }
        }

        let id: u32 = env.storage().instance().get(&FactoryKey::Count).unwrap();
        let wasm_hash: BytesN<32> = env.storage().instance().get(&FactoryKey::WasmHash).unwrap();

        // Deterministic, collision-free salt derived from the escrow id.
        let mut salt = [0u8; 32];
        salt[28..32].copy_from_slice(&id.to_be_bytes());
        let salt = BytesN::from_array(&env, &salt);

        let constructor_args: Vec<Val> = (
            buyer.clone(),
            seller.clone(),
            arbiter.clone(),
            token.clone(),
            amount,
            timeout,
        )
            .into_val(&env);

        let escrow_address = env
            .deployer()
            .with_current_contract(salt)
            .deploy_v2(wasm_hash, constructor_args);

        let mut escrows: Map<u32, Address> =
            env.storage().instance().get(&FactoryKey::Escrows).unwrap();
        escrows.set(id, escrow_address.clone());
        env.storage().instance().set(&FactoryKey::Escrows, &escrows);
        env.storage().instance().set(&FactoryKey::Count, &(id + 1));

        push_to_user_index(&env, &buyer, id);
        push_to_user_index(&env, &seller, id);
        if let Some(a) = &arbiter {
            push_to_user_index(&env, a, id);
        }

        env.events().publish_event(&EscrowCreated {
            id,
            escrow: escrow_address.clone(),
            buyer: buyer.clone(),
            seller: seller.clone(),
        });

        Ok(id)
    }

    /// Total number of escrows created by this factory.
    pub fn escrow_count(env: Env) -> u32 {
        env.storage().instance().get(&FactoryKey::Count).unwrap()
    }

    /// Address of the escrow with the given id, if it exists.
    pub fn get_escrow(env: Env, id: u32) -> Option<Address> {
        let escrows: Map<u32, Address> =
            env.storage().instance().get(&FactoryKey::Escrows).unwrap();
        escrows.get(id)
    }

    /// Ids of every escrow the given address participates in as buyer, seller,
    /// or arbiter, in creation order.
    pub fn list_escrows_by_user(env: Env, user: Address) -> Vec<u32> {
        let index: Map<Address, Vec<u32>> = env
            .storage()
            .instance()
            .get(&FactoryKey::UserEscrows)
            .unwrap();
        index.get(user).unwrap_or_else(|| Vec::new(&env))
    }
}

#[cfg(test)]
mod test;
