# Security

## Threat model

The escrow holds real value, so the primary threats are:

- **Unauthorized fund movement** — a party other than the intended recipient
  draining the escrow. Mitigated by role-based `require_auth` checks on every
  state-changing function and by transferring funds only to the address stored
  at construction time.
- **Invalid state transitions** — e.g. double-confirming, refunding after
  delivery, or resolving without a dispute. Mitigated by a strict state check at
  the top of every mutating function.
- **Double-spend / replay** — releasing the same funds twice. The state machine
  is a single-writer: funds are moved exactly once, atomically with the state
  transition, and every path reaches a terminal state that rejects further
  mutation.
- **Reentrancy-equivalent issues** — Soroban contracts are not directly
  susceptible to EVM-style reentrancy (there is no shared mutable external
  call/fallback pattern), but the contract follows a check-effects-interactions
  ordering: validate, then update state and move funds, and never re-enter
  external contracts between a balance check and a transfer. Transfers happen
  through the standard Stellar Asset Contract interface only.
- **Emergency stop / pause** — the factory owner can pause the creation of new
  escrows, limiting exposure to a newly discovered bug. Pausing never affects
  existing escrows, so funds already locked are not stranded by a pause.
- **Stuck funds / griefing** — a buyer who deposits then disappears. Resolved
  by the auto-release path (`release`) after the seller marks delivery and the
  window expires, and by the seller `refund` path before delivery.
- **Malicious arbiter** — an arbiter who colludes with one party. This is an
  inherent trust assumption: choose a neutral arbiter. The arbiter can only
  choose between seller and buyer; it can never withdraw funds to itself.
- **Token risk** — the escrow holds whatever SAC token it is configured with.
  A malicious or non-standard token could misbehave (e.g. clawback). The
  contract does not whitelist tokens; integrators should only create escrows
  with trusted assets. Native XLM is supported through the native asset SAC;
  when the escrow holds XLM, its balance is tracked by the native SAC's own
  contract storage rather than a classic account balance.

## Design invariants

- The escrow only ever holds at most `amount` of `token` and only ever transfers
  exactly `amount` to either the seller or the buyer.
- `buyer != seller` and the arbiter (if set) differs from both.
- `amount > 0` and `timeout > 0` are enforced at construction.
- `mark_delivered` is idempotence-guarded; the deadline is set exactly once.
- After `mark_delivered`, the `confirm`/`dispute` window is bounded by
  `deadline`; past it, only `release` (auto-release to seller) is valid.
  `dispute` may be raised by either the buyer or the seller.
- Every state-changing call extends the contract instance/code TTL (up to a
  ~150-day ceiling, refreshed only below a ~7-day threshold), so long-lived
  escrows do not lose their state to ledger expiry.

## Known limitations

- **Single asset per escrow** — multi-asset escrows are a roadmap item.
- **No token whitelist** — the factory trusts the token address passed by the
  buyer.
- **Arbiter is optional but recommended** — without an arbiter, a dispute can
  never be resolved (funds would be stuck in `Disputed`).

## Audit status

**Unaudited.** The contracts have a passing unit + integration test suite and
CI (clippy + fmt), but have not been professionally audited. Do not deploy to
mainnet with significant value until an audit is completed.
