# Platform registration

This repo is built to be registered on **GrantFox** and submitted to the
**Drips Wave — Stellar Wave Program**. The code, tests, CI, docs, and a labeled
issue backlog are already in place; the remaining steps are manual applications
that only the repo owner can submit.

## Project summary (copy/paste pitch)

**smart-contract-escrow** is a decentralized, Stellar-native escrow platform
built with Soroban. A buyer locks funds in a smart contract; the seller
delivers; the buyer confirms, either party disputes, or the funds auto-release
after a timeout. An optional arbiter settles disputes. Funds are self-custodied by the
contract — no trusted middleman. It supports any Stellar Asset Contract token
(e.g. USDC) and native XLM, with many concurrent escrows managed by a factory.

- **Chain:** Stellar / Soroban (Rust)
- **Category:** escrow / trustless payments
- **Repo:** https://github.com/Yinklekay64/smart-contract-escrow
- **License:** MIT
- **Status:** working contracts, 34 tests, CI (test + clippy + fmt), frontend;
  **unaudited — testnet only**

## GrantFox

1. Register at https://maintainer.grantfox.xyz and add this repo as a project.
2. Launch a campaign linking to the open, labeled issues (see below). The
   `good first issue` + `complexity: trivial` issues are ideal starter tasks.
3. Labels are already applied:
   - `complexity: trivial` / `medium` / `high`
   - `area: contracts` / `frontend` / `docs` / `tests`
   - `good first issue`

## Drips Wave — Stellar Wave Program

1. Apply at https://drips.network/wave/stellar with this repo.
2. Once approved, add the open issues to the Program either via the Drips Wave
   bot or by applying the Wave label directly on GitHub.
3. Issues worth highlighting for the program (full list at
   https://github.com/Yinklekay64/smart-contract-escrow/issues):
   - Add a token allow-list to the factory (#13)
   - Add an optional platform fee to a treasury (#14)
   - Frontend: token metadata & role-aware actions (#15)
   - Add contract-account (C-account) role test (#8)

## Before applying (checklist)

- [ ] CI is green on the default branch (or on the open PR).
- [ ] README renders the logo and setup steps.
- [ ] Issue backlog is open and labeled (15 issues, #2–#16).
- [ ] The "unaudited — testnet only" status is stated clearly.
