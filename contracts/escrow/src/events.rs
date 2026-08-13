use soroban_sdk::{contractevent, Address, Env};

/// Emitted when the buyer funds the escrow.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposited {
    #[topic]
    pub buyer: Address,
    pub amount: i128,
}

/// Emitted when the seller marks delivery, opening the buyer's window.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Delivered {
    #[topic]
    pub seller: Address,
}

/// Emitted when the buyer confirms receipt and funds go to the seller.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Completed {
    #[topic]
    pub seller: Address,
    pub amount: i128,
}

/// Emitted when funds auto-release to the seller after the window expires.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Released {
    #[topic]
    pub seller: Address,
    pub amount: i128,
}

/// Emitted when the buyer raises a dispute.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Disputed {
    #[topic]
    pub buyer: Address,
}

/// Emitted when the arbiter settles a dispute.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Resolved {
    #[topic]
    pub arbiter: Address,
    pub release_to_seller: bool,
}

/// Emitted when funds are returned to the buyer.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub buyer: Address,
    pub amount: i128,
}

pub fn deposited(env: &Env, buyer: &Address, amount: i128) {
    env.events().publish_event(&Deposited {
        buyer: buyer.clone(),
        amount,
    });
}

pub fn delivered(env: &Env, seller: &Address) {
    env.events().publish_event(&Delivered {
        seller: seller.clone(),
    });
}

pub fn completed(env: &Env, seller: &Address, amount: i128) {
    env.events().publish_event(&Completed {
        seller: seller.clone(),
        amount,
    });
}

pub fn released(env: &Env, seller: &Address, amount: i128) {
    env.events().publish_event(&Released {
        seller: seller.clone(),
        amount,
    });
}

pub fn disputed(env: &Env, buyer: &Address) {
    env.events().publish_event(&Disputed {
        buyer: buyer.clone(),
    });
}

pub fn resolved(env: &Env, arbiter: &Address, release_to_seller: bool) {
    env.events().publish_event(&Resolved {
        arbiter: arbiter.clone(),
        release_to_seller,
    });
}

pub fn refunded(env: &Env, buyer: &Address, amount: i128) {
    env.events().publish_event(&Refunded {
        buyer: buyer.clone(),
        amount,
    });
}
