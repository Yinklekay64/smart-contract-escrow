<p align="center">
  <img src="assets/logo.svg" alt="smart-contract-escrow logo" width="128" height="128" />
</p>

<h1 align="center">smart-contract-escrow</h1>

<p align="center">
  A Stellar-native, decentralized escrow platform built with <strong>Soroban</strong>.
</p>

<p align="center">
  <a href="#license"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <a href="https://github.com/Yinklekay64/smart-contract-escrow/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Yinklekay64/smart-contract-escrow/ci.yml?branch=main" /></a>
</p>

---

## Problem

Sending value to a counterparty you don't fully trust is risky: the seller may
never deliver, or the buyer may never pay after delivery. Traditional escrow
services introduce a centralized, trusted middleman with custody of the funds.

`smart-contract-escrow` replaces the middleman with a **Soroban smart contract**
that holds funds in escrow and only releases them when the agreed conditions
are met — with an optional **arbiter** to settle disputes. Funds are
self-custodied by the contract, not by any trusted operator.

## Architecture overview

- **`Escrow`** — a single-deal contract with three roles (`buyer`, `seller`,
  optional `arbiter`) and a strict state machine.
- **`EscrowFactory`** — deploys and indexes many concurrent `Escrow` instances
  from one address (factory pattern).
- **Assets** — deposits use any Stellar Asset Contract (SAC) token (e.g. USDC)
  or native XLM via the native asset SAC.
- **Events** — every state transition emits a typed contract event.

```
AwaitingPayment ── deposit() ──▶ AwaitingDelivery
AwaitingDelivery ── confirm() / release() ──▶ Complete
AwaitingDelivery ── dispute() ──▶ Disputed
AwaitingDelivery ── refund() ──▶ Refunded
Disputed ── resolve(release) ──▶ Resolved
Disputed ── resolve(refund) ──▶ Refunded
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full flow and
[`docs/SECURITY.md`](docs/SECURITY.md) for the threat model.

## Repository layout

```
├── contracts/                 # Soroban contracts (Rust)
│   ├── escrow/                #   Escrow state machine
│   └── factory/               #   Factory + index
├── contracts-evm/             # Optional EVM/Solidity secondary track
├── tests/                     # End-to-end integration tests
├── scripts/                   # Deploy & testnet-setup scripts
├── frontend/                  # React + Stellar (Freighter) frontend
├── docs/                      # Architecture, security, roadmap
└── assets/                    # Branding
```

## Prerequisites

- Rust (stable) — https://rustup.rs
- Stellar CLI (`stellar`) — https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup
- The `wasm32v1-none` target: `rustup target add wasm32v1-none`

## Build & test

```bash
make build                 # builds the Escrow and Factory wasm files
make test                  # runs unit + integration tests
make clippy                # lints the workspace
make fmt-check             # verifies formatting
```

The test suite covers the deposit → confirm / dispute → resolve / refund and
timeout auto-release paths, plus adversarial cases: unauthorized callers,
double confirmation/deposit, zero-value and expired-timeout inputs.

## Deploy to Testnet

```bash
./scripts/testnet-setup.sh      # register testnet + create a funded identity
./scripts/build.sh              # build both WASM contracts
./scripts/deploy-testnet.sh     # deploy the EscrowFactory to testnet
./scripts/invoke-examples.sh    # print example CLI invocations for every function
```

`deploy.sh` prints the factory contract id and writes it to
`deployments/factory.testnet.txt`. The factory uploads the `Escrow` Wasm
on-chain during its own constructor, so no separate escrow deployment is
required.

## Usage

Create an escrow through the factory:

```bash
stellar contract invoke \
  --id <FACTORY_ID> \
  --network testnet \
  --source-account escrow-dev \
  -- create_escrow \
  --buyer <BUYER> \
  --seller <SELLER> \
  --arbiter <ARBITER> \
  --token <TOKEN_CONTRACT_ID> \
  --amount 10000000 \
  --timeout 604800
```

`<TOKEN_CONTRACT_ID>` is any SAC token (e.g. USDC) or the native XLM SAC:
`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` (testnet).

The returned id indexes the deployed escrow; retrieve its address with
`get_escrow(id)`, then interact directly:

- `deposit` (buyer) — lock funds
- `mark_delivered` (seller) — open the buyer's response window
- `confirm` (buyer) / `dispute` (buyer or seller) — accept delivery or raise a dispute
- `resolve(release_to_seller)` (arbiter) — settle a dispute
- `release` (anyone) — auto-release after the window expires
- `refund` (seller) — cancel before delivery
- `pause` / `unpause` (factory owner) — emergency-stop new escrow creation

## Frontend

A React app (Vite + `@stellar/stellar-sdk` + Freighter wallet) lives in
`frontend/`:

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_FACTORY_CONTRACT_ID
npm run dev
```

## Roadmap & contributing

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for milestones and
[`CONTRIBUTING.md`](CONTRIBUTING.md) to get involved. Contributors are welcome —
check the open issues and pick one up.

## License

[MIT](LICENSE)
