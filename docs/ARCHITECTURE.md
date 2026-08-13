# Architecture

## Overview

`smart-contract-escrow` is a two-contract system deployed on Stellar via Soroban:

1. **`Escrow`** — one instance per deal. Holds a single Stellar asset in escrow
   and enforces the lifecycle between a buyer, a seller, and an optional
   arbiter.
2. **`EscrowFactory`** — deploys `Escrow` instances on demand and keeps an
   id → address index, so one factory address manages many concurrent escrows.
   The factory records an `owner` who can `pause`/`unpause` the deployment of
   new escrows (emergency stop); existing escrows and their funds are untouched.

The factory embeds the compiled `Escrow` Wasm (`contractimport!`) and uploads it
on-chain once during its own constructor, storing the Wasm hash. Each
`create_escrow` call then deploys a child instance with a deterministic address
derived from the factory address and an id-based salt.

## State machine

```
                    ┌────────────────────────────────────────────┐
                    │                                            │
                    ▼                                            │
            AwaitingPayment                                      │
                 │ deposit() (buyer)                             │
                 ▼                                               │
            AwaitingDelivery ──────── refund() (seller) ────────▶ Refunded
                 │ mark_delivered() (seller)                     ▲
                 │  └─ sets deadline = now + timeout             │
                 │                                               │
        ┌────────┴───────────────┐                               │
        │                        │                               │
   confirm() (buyer)       dispute() (buyer)                     │
   release() (after        (within window)                       │
   deadline) (anyone)           │                                │
        │                        ▼                                │
        ▼                     Disputed ── resolve(false) ─────────┘
     Complete ◀──── resolve(true) ──┘
```

### Terminal states

| State        | Meaning                                        |
| ------------ | ---------------------------------------------- |
| `Complete`   | Funds released to the seller.                  |
| `Resolved`   | Arbiter released funds to the seller.          |
| `Refunded`   | Funds returned to the buyer.                   |

## Roles & authorization

| Role     | Capabilities                                                    |
| -------- | --------------------------------------------------------------- |
| `buyer`  | `deposit`, `confirm`, `dispute`                                 |
| `seller` | `mark_delivered`, `refund` (before delivery), `dispute`         |
| `arbiter`| `resolve` (dispute settlement), optional                        |
| anyone   | `release` (only valid after the response window expires)        |

Authorization uses Soroban's `require_auth` on the role's `Address`. When a
role is an account, its key must sign the invocation (and any nested token
`transfer` it authorizes). When a role is a contract, that contract's
`__check_auth` is consulted.

## Contract interaction flow

### Happy path (buyer confirms)

```
Buyer ──create_escrow──▶ Factory ──deploy──▶ Escrow (AwaitingPayment)
Buyer ──deposit──▶ Escrow (AwaitingDelivery) ──transfer──▶ SAC (buyer → escrow)
Seller ──mark_delivered──▶ Escrow (deadline = now + timeout)
Buyer ──confirm──▶ Escrow (Complete) ──transfer──▶ SAC (escrow → seller)
```

### Dispute path

```
Buyer/Seller ──dispute──▶ Escrow (Disputed)
Arbiter ──resolve(release_to_seller)──▶ Escrow (Resolved/Refunded)
                                   └─transfer─▶ SAC (escrow → seller | buyer)
```

### Timeout path (auto-release)

```
Seller ──mark_delivered──▶ Escrow (deadline = now + timeout)
... buyer does not respond ...
Anyone ──release──▶ Escrow (Complete) ──transfer─▶ SAC (escrow → seller)
```

## Storage

Each `Escrow` stores its configuration and mutable state in instance storage:

- Immutable: `buyer`, `seller`, `arbiter`, `token`, `amount`, `timeout`
- Mutable: `state`, `deadline`, `delivered`

The `EscrowFactory` stores the uploaded `Escrow` Wasm hash, an escrow counter,
and a `Map<u32, Address>` id → address index.

The `token` is any Stellar Asset Contract (SAC) address — USDC, a wrapped asset,
or the native XLM SAC (`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
on testnet). The escrow is token-agnostic: when it holds native XLM, the
balance is tracked by the native SAC's own contract storage rather than a
classic account balance, so deposit/release/refund behave identically.

## Events

Every transition emits a typed `#[contractevent]`:

`Deposited`, `Delivered`, `Completed`, `Released`, `Disputed`, `Resolved`,
`Refunded`, and `EscrowCreated` (factory).

## EVM secondary track

`contracts-evm/` contains a Solidity/Hardhat payment gateway (payments,
invoices, subscriptions) that predates the Soroban core. It is kept as an
optional, chain-agnostic track and is not required by the escrow platform.
