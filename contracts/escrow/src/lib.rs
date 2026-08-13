#![no_std]

mod errors;
mod events;
mod state;

use soroban_sdk::{contract, contractimpl, token::TokenClient, Address, Env, MuxedAddress};

use errors::EscrowError;
use state::{State, StorageKey};

/// A single-deal escrow.
///
/// Three roles — `buyer`, `seller`, and an optional `arbiter` — interact over
/// a locked amount of a Stellar asset (`token`). The buyer funds the escrow,
/// the seller marks delivery, and the buyer confirms receipt or disputes it
/// within a timeout window. If the buyer does nothing after delivery, the
/// escrow auto-releases to the seller. Disputes are settled by the arbiter.
///
/// Instances are deployed by the `EscrowFactory` contract, but any caller may
/// interact with an instance directly once it knows its address.
#[contract]
pub struct Escrow;

impl Escrow {
    fn get_state(env: &Env) -> State {
        env.storage().instance().get(&StorageKey::State).unwrap()
    }

    fn set_state(env: &Env, state: State) {
        env.storage().instance().set(&StorageKey::State, &state);
    }

    fn expect_state(env: &Env, expected: State) -> Result<(), EscrowError> {
        let current = Self::get_state(env);
        if current != expected {
            return Err(EscrowError::InvalidState);
        }
        Ok(())
    }

    /// Move `amount` of `token` from this escrow to `recipient`.
    ///
    /// The token's `transfer` requires authorization from `from` — which is the
    /// escrow contract itself here — so the call is implicitly authorized.
    fn release_funds(env: &Env, recipient: &Address) {
        let token: Address = env.storage().instance().get(&StorageKey::Token).unwrap();
        let amount: i128 = env.storage().instance().get(&StorageKey::Amount).unwrap();
        let escrow = env.current_contract_address();
        let to = MuxedAddress::from(recipient);
        TokenClient::new(env, &token).transfer(&escrow, &to, &amount);
    }
}

#[contractimpl]
impl Escrow {
    /// Initialize the escrow. Runs once at deployment time.
    pub fn __constructor(
        env: Env,
        buyer: Address,
        seller: Address,
        arbiter: Option<Address>,
        token: Address,
        amount: i128,
        timeout: u64,
    ) {
        if amount <= 0 {
            panic!("escrow: amount must be positive");
        }
        if timeout == 0 {
            panic!("escrow: timeout must be positive");
        }
        if buyer == seller {
            panic!("escrow: buyer and seller must differ");
        }
        if let Some(a) = &arbiter {
            if *a == buyer || *a == seller {
                panic!("escrow: arbiter must differ from buyer and seller");
            }
        }

        env.storage().instance().set(&StorageKey::Buyer, &buyer);
        env.storage().instance().set(&StorageKey::Seller, &seller);
        env.storage().instance().set(&StorageKey::Arbiter, &arbiter);
        env.storage().instance().set(&StorageKey::Token, &token);
        env.storage().instance().set(&StorageKey::Amount, &amount);
        env.storage().instance().set(&StorageKey::Timeout, &timeout);
        env.storage()
            .instance()
            .set(&StorageKey::State, &State::AwaitingPayment);
        env.storage().instance().set(&StorageKey::Deadline, &0u64);
        env.storage().instance().set(&StorageKey::Delivered, &false);
    }

    /// The buyer locks `amount` of `token` into the escrow.
    ///
    /// Transitions `AwaitingPayment → AwaitingDelivery`. The transfer reverts
    /// atomically if the buyer has insufficient balance or authorization.
    pub fn deposit(env: Env) -> Result<(), EscrowError> {
        let buyer: Address = env.storage().instance().get(&StorageKey::Buyer).unwrap();
        buyer.require_auth();

        Self::expect_state(&env, State::AwaitingPayment)?;

        let token: Address = env.storage().instance().get(&StorageKey::Token).unwrap();
        let amount: i128 = env.storage().instance().get(&StorageKey::Amount).unwrap();
        let escrow = env.current_contract_address();
        let to = MuxedAddress::from(&escrow);
        TokenClient::new(&env, &token).transfer(&buyer, &to, &amount);

        Self::set_state(&env, State::AwaitingDelivery);
        events::deposited(&env, &buyer, amount);
        Ok(())
    }

    /// The seller marks the goods/services as delivered, opening the buyer's
    /// response window (deadline = now + timeout).
    pub fn mark_delivered(env: Env) -> Result<(), EscrowError> {
        let seller: Address = env.storage().instance().get(&StorageKey::Seller).unwrap();
        seller.require_auth();

        Self::expect_state(&env, State::AwaitingDelivery)?;

        let delivered: bool = env
            .storage()
            .instance()
            .get(&StorageKey::Delivered)
            .unwrap();
        if delivered {
            return Err(EscrowError::AlreadyDelivered);
        }

        let timeout: u64 = env.storage().instance().get(&StorageKey::Timeout).unwrap();
        let deadline = env.ledger().timestamp().saturating_add(timeout);

        env.storage().instance().set(&StorageKey::Delivered, &true);
        env.storage()
            .instance()
            .set(&StorageKey::Deadline, &deadline);

        events::delivered(&env, &seller);
        Ok(())
    }

    /// The buyer confirms receipt, releasing the funds to the seller.
    ///
    /// Only valid within the response window after delivery.
    pub fn confirm(env: Env) -> Result<(), EscrowError> {
        let buyer: Address = env.storage().instance().get(&StorageKey::Buyer).unwrap();
        buyer.require_auth();

        Self::expect_state(&env, State::AwaitingDelivery)?;

        let delivered: bool = env
            .storage()
            .instance()
            .get(&StorageKey::Delivered)
            .unwrap();
        let deadline: u64 = env.storage().instance().get(&StorageKey::Deadline).unwrap();
        if !delivered {
            return Err(EscrowError::NotDelivered);
        }
        if env.ledger().timestamp() > deadline {
            return Err(EscrowError::WindowExpired);
        }

        let seller: Address = env.storage().instance().get(&StorageKey::Seller).unwrap();
        let amount: i128 = env.storage().instance().get(&StorageKey::Amount).unwrap();
        Self::release_funds(&env, &seller);

        Self::set_state(&env, State::Complete);
        events::completed(&env, &seller, amount);
        Ok(())
    }

    /// The buyer raises a dispute, pausing the escrow for the arbiter.
    pub fn dispute(env: Env) -> Result<(), EscrowError> {
        let buyer: Address = env.storage().instance().get(&StorageKey::Buyer).unwrap();
        buyer.require_auth();

        Self::expect_state(&env, State::AwaitingDelivery)?;

        let delivered: bool = env
            .storage()
            .instance()
            .get(&StorageKey::Delivered)
            .unwrap();
        let deadline: u64 = env.storage().instance().get(&StorageKey::Deadline).unwrap();
        if delivered && env.ledger().timestamp() > deadline {
            return Err(EscrowError::WindowExpired);
        }

        Self::set_state(&env, State::Disputed);
        events::disputed(&env, &buyer);
        Ok(())
    }

    /// Auto-release funds to the seller once the buyer's response window has
    /// expired without a confirmation or dispute. Callable by anyone.
    pub fn release(env: Env) -> Result<(), EscrowError> {
        Self::expect_state(&env, State::AwaitingDelivery)?;

        let delivered: bool = env
            .storage()
            .instance()
            .get(&StorageKey::Delivered)
            .unwrap();
        let deadline: u64 = env.storage().instance().get(&StorageKey::Deadline).unwrap();
        if !delivered {
            return Err(EscrowError::NotDelivered);
        }
        if env.ledger().timestamp() <= deadline {
            return Err(EscrowError::TimeoutNotReached);
        }

        let seller: Address = env.storage().instance().get(&StorageKey::Seller).unwrap();
        let amount: i128 = env.storage().instance().get(&StorageKey::Amount).unwrap();
        Self::release_funds(&env, &seller);

        Self::set_state(&env, State::Complete);
        events::released(&env, &seller, amount);
        Ok(())
    }

    /// The arbiter settles a dispute: release to the seller (`true`) or refund
    /// the buyer (`false`).
    pub fn resolve(env: Env, release_to_seller: bool) -> Result<(), EscrowError> {
        Self::expect_state(&env, State::Disputed)?;

        let arbiter: Option<Address> = env.storage().instance().get(&StorageKey::Arbiter).unwrap();
        let arbiter = match arbiter {
            Some(a) => a,
            None => return Err(EscrowError::NoArbiter),
        };
        arbiter.require_auth();

        if release_to_seller {
            let seller: Address = env.storage().instance().get(&StorageKey::Seller).unwrap();
            Self::release_funds(&env, &seller);
            Self::set_state(&env, State::Resolved);
        } else {
            let buyer: Address = env.storage().instance().get(&StorageKey::Buyer).unwrap();
            Self::release_funds(&env, &buyer);
            Self::set_state(&env, State::Refunded);
        }

        events::resolved(&env, &arbiter, release_to_seller);
        Ok(())
    }

    /// The seller cancels before delivering and refunds the buyer.
    pub fn refund(env: Env) -> Result<(), EscrowError> {
        let seller: Address = env.storage().instance().get(&StorageKey::Seller).unwrap();
        seller.require_auth();

        Self::expect_state(&env, State::AwaitingDelivery)?;

        let delivered: bool = env
            .storage()
            .instance()
            .get(&StorageKey::Delivered)
            .unwrap();
        if delivered {
            return Err(EscrowError::AlreadyDelivered);
        }

        let buyer: Address = env.storage().instance().get(&StorageKey::Buyer).unwrap();
        let amount: i128 = env.storage().instance().get(&StorageKey::Amount).unwrap();
        Self::release_funds(&env, &buyer);

        Self::set_state(&env, State::Refunded);
        events::refunded(&env, &buyer, amount);
        Ok(())
    }

    // ---- Getters -----------------------------------------------------------

    pub fn state(env: Env) -> State {
        Self::get_state(&env)
    }

    pub fn buyer(env: Env) -> Address {
        env.storage().instance().get(&StorageKey::Buyer).unwrap()
    }

    pub fn seller(env: Env) -> Address {
        env.storage().instance().get(&StorageKey::Seller).unwrap()
    }

    pub fn arbiter(env: Env) -> Option<Address> {
        env.storage().instance().get(&StorageKey::Arbiter).unwrap()
    }

    pub fn token(env: Env) -> Address {
        env.storage().instance().get(&StorageKey::Token).unwrap()
    }

    pub fn amount(env: Env) -> i128 {
        env.storage().instance().get(&StorageKey::Amount).unwrap()
    }

    pub fn timeout(env: Env) -> u64 {
        env.storage().instance().get(&StorageKey::Timeout).unwrap()
    }

    pub fn deadline(env: Env) -> u64 {
        env.storage().instance().get(&StorageKey::Deadline).unwrap()
    }

    pub fn delivered(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&StorageKey::Delivered)
            .unwrap()
    }
}

#[cfg(test)]
mod test;
