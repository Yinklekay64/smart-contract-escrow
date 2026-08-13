use soroban_sdk::contracterror;

/// Errors returned by the Escrow contract. Each variant maps to a stable,
/// machine-readable error code so off-chain clients can react to specific
/// failure modes.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    /// A caller other than the role required for the operation attempted it.
    Unauthorized = 1,
    /// The operation is not valid for the escrow's current state.
    InvalidState = 2,
    /// The escrow amount must be strictly positive.
    ZeroAmount = 3,
    /// The timeout window must be strictly positive.
    ZeroTimeout = 4,
    /// The buyer and seller must be distinct addresses.
    SameParties = 5,
    /// The arbiter must be distinct from both the buyer and the seller.
    InvalidArbiter = 6,
    /// The seller already marked the escrow as delivered.
    AlreadyDelivered = 7,
    /// The seller has not yet marked the escrow as delivered.
    NotDelivered = 8,
    /// The auto-release timeout has not been reached yet.
    TimeoutNotReached = 9,
    /// The buyer's confirmation/dispute window has already expired.
    WindowExpired = 10,
    /// No arbiter was configured, so the dispute cannot be resolved.
    NoArbiter = 11,
}
