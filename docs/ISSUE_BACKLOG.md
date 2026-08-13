# Issue backlog

Scoped, contributor-friendly issues for `smart-contract-escrow`. Each entry is
ready to paste into a GitHub issue (use the `bug_report` / `feature_request`
templates) and tag with the `complexity: trivial|medium|high` label.

Complexity legend:

- **Trivial** — small, well-contained change (docs, typos, a single test).
- **Medium** — a focused feature, refactor, or test suite addition.
- **High** — larger or security-sensitive work, often spanning contracts + tests + docs.

---

## Bug fixes

### ESC-01 · Extend storage TTL on state-changing calls ✅

- **Type:** bug
- **Complexity:** High
- **Status:** done — every state-changing call now bump-extends the instance/code
  TTL (see `contracts/escrow/src/lib.rs` and `contracts/factory/src/lib.rs`).

Instance storage (`state`, `deadline`, `delivered`) is never bump-extended, so a
long-lived escrow's storage can expire and wipe its state while funds are still
locked.

**Acceptance criteria**

- [ ] Every state-changing call extends the instance storage TTL (and any
      persistent storage introduced later).
- [ ] A `soroban_sdk` test drives the ledger past the default TTL and asserts
      state is still readable after a mutation.
- [ ] `docs/SECURITY.md` "Known limitations" entry is removed or updated.

### ESC-02 · Guard against non-token `token` addresses

- **Type:** bug
- **Complexity:** Medium

`create_escrow`/`__constructor` accept any `token` address. A non-token
contract (or a token with clawback) can strand funds or misbehave. At minimum,
fail fast and document; ideally add an optional allow-list on the factory.

**Acceptance criteria**

- [ ] The factory rejects a `token` that does not implement the Stellar token
      interface (e.g. by probing `decimals`/`symbol`, or via an allow-list).
- [ ] Tests cover a non-token address being rejected.
- [ ] Docs state the trust assumption for the remaining token risk (clawback).

### ESC-03 · Dispute without an arbiter can strand funds

- **Type:** bug
- **Complexity:** Medium

If an escrow is created without an arbiter and the buyer disputes, `resolve`
returns `NoArbiter` and funds are stuck in `Disputed` forever.

**Acceptance criteria**

- [ ] Decide and implement one recovery path (e.g. warn at creation, require an
      arbiter for dispute-able escrows, or add a mutually-agreed cancellation).
- [ ] Tests cover the no-arbiter dispute path end-to-end.
- [ ] `README.md` and `docs/ARCHITECTURE.md` document the behavior.

---

## Test coverage gaps

### ESC-10 · Auth coverage for `refund` and `release`

- **Type:** test
- **Complexity:** Trivial

`refund` (seller-only) and `release` (permissionless) are covered functionally
but not for their authorization semantics.

**Acceptance criteria**

- [ ] Assert via `env.auths()` that `refund` requires the seller.
- [ ] Assert `release` requires no authorization (any caller can trigger it).
- [ ] Add a negative test: a non-seller cannot `refund`.

### ESC-11 · `NoArbiter` error path test

- **Type:** test
- **Complexity:** Trivial

**Acceptance criteria**

- [ ] Create an escrow with `arbiter = None`, deposit, dispute, then assert
      `try_resolve(true)` returns `EscrowError::NoArbiter` and the state stays
      `Disputed`.

### ESC-12 · Insufficient-balance deposit test

- **Type:** test
- **Complexity:** Medium

**Acceptance criteria**

- [ ] A buyer with a balance below `amount` cannot `deposit`; the call reverts
      and the escrow remains in `AwaitingPayment`.

### ESC-13 · Event emission assertions

- **Type:** test
- **Complexity:** Medium

Events are emitted but not asserted.

**Acceptance criteria**

- [ ] Assert `env.events().all()` contains each typed event
      (`Deposited`, `Delivered`, `Completed`, `Released`, `Disputed`,
      `Resolved`, `Refunded`, `EscrowCreated`) with the right topic/data.
- [ ] Assert the exact `EscrowCreated` topic id in the factory test.

### ESC-14 · Contract-account (C-account) role test

- **Type:** test
- **Complexity:** High

Roles are only tested as generated Ed25519 accounts.

**Acceptance criteria**

- [ ] Add a mock custom-account contract and authorize a role (e.g. buyer)
      through its `__check_auth`.
- [ ] Cover both an authorized and a rejected `__check_auth` path.

---

## Documentation

### ESC-20 · Mermaid sequence diagram in ARCHITECTURE.md

- **Type:** docs
- **Complexity:** Trivial

**Acceptance criteria**

- [ ] Add a Mermaid sequence diagram for the happy path and the dispute path.

### ESC-21 · Token units & decimals guide

- **Type:** docs
- **Complexity:** Trivial

**Acceptance criteria**

- [ ] Document how to compute raw `amount` units (e.g. USDC has 7 decimals) in
      `README.md` and the frontend.

### ESC-22 · Deployment runbook

- **Type:** docs
- **Complexity:** Medium

**Acceptance criteria**

- [ ] Add `docs/DEPLOYMENT.md` covering identity setup, funding, deploy, and
      verification steps for testnet and mainnet.

### ESC-23 · Logo PNG + favicon exports

- **Type:** docs
- **Complexity:** Trivial

**Acceptance criteria**

- [ ] Add `assets/logo-512.png` and `assets/favicon-32.png`, referenced from
      `README.md` and `frontend/index.html`.

---

## Small features

### ESC-30 · Native XLM deposits

- **Type:** feature
- **Complexity:** High

**Acceptance criteria**

- [ ] Support funding an escrow with native XLM in addition to SAC tokens.
- [ ] Track the native balance safely across deposit/release/refund.
- [ ] Tests cover native deposit, release, and refund paths.
- [ ] Update the roadmap (`v0.4`) and docs.

### ESC-31 · Token allow-list on the factory

- **Type:** feature
- **Complexity:** Medium

**Acceptance criteria**

- [ ] Add owner-gated `add_token`/`remove_token` to `EscrowFactory`.
- [ ] `create_escrow` rejects non-whitelisted tokens when the list is non-empty.
- [ ] Tests + docs.

### ESC-32 · Optional platform fee to a treasury

- **Type:** feature
- **Complexity:** Medium

**Acceptance criteria**

- [ ] A configurable fee (bps) is deducted from releases to a treasury.
- [ ] Only a manager role can set the fee/treasury.
- [ ] Tests for fee math and access control; docs update.

### ESC-33 · Frontend: token metadata & role-aware actions

- **Type:** feature
- **Complexity:** Medium

**Acceptance criteria**

- [ ] Fetch token `symbol`/`decimals` and display amounts in human units.
- [ ] Only show actions valid for the connected address's role and the escrow
      state.
- [ ] Refresh escrow state after each action and surface events/errors clearly.

### ESC-34 · Frontend: escrow event feed

- **Type:** feature
- **Complexity:** Medium

**Acceptance criteria**

- [ ] Stream the factory's `EscrowCreated` events (and per-escrow transitions)
      into the UI so new escrows appear without a manual refresh.
