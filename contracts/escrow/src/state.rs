use soroban_sdk::contracttype;

/// Lifecycle states of an escrow.
///
/// ```text
/// AwaitingPayment ── deposit ──▶ AwaitingDelivery
/// AwaitingDelivery ── confirm / release ──▶ Complete
/// AwaitingDelivery ── dispute ──▶ Disputed
/// AwaitingDelivery ── refund ──▶ Refunded
/// Disputed ── resolve(release) ──▶ Resolved
/// Disputed ── resolve(refund) ──▶ Refunded
/// ```
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum State {
    /// Created but not yet funded.
    AwaitingPayment,
    /// Funded and waiting for delivery / buyer response.
    AwaitingDelivery,
    /// Funds released to the seller.
    Complete,
    /// Buyer raised a dispute, awaiting the arbiter.
    Disputed,
    /// Arbiter resolved the dispute in the seller's favour.
    Resolved,
    /// Funds returned to the buyer.
    Refunded,
}

/// Instance storage keys.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StorageKey {
    Buyer,
    Seller,
    Arbiter,
    Token,
    Amount,
    Timeout,
    State,
    Deadline,
    Delivered,
}
