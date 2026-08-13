# Roadmap

## v0.1 — Core escrow ✅

- `Escrow` contract with buyer/seller/arbiter roles
- SAC-token deposits and the full state machine
- Timeout auto-release
- Events for every transition
- Unit + integration tests

## v0.2 — Disputes & arbiter ✅

- Dispute resolution by an optional arbiter (release or refund)
- Adversarial tests (unauthorized callers, invalid transitions)

## v0.3 — Frontend

- [x] React + Freighter wallet scaffold
- [ ] Create-escrow flow (buyer)
- [ ] Deposit / confirm / dispute actions per role
- [ ] Escrow dashboard (list by factory index)
- [ ] Testnet end-to-end walkthrough

## v0.4 — Multi-asset & native support

- [ ] Native XLM deposits in addition to SAC tokens
- [ ] Multi-asset escrows (basket of assets per deal)
- [ ] Storage TTL extension on state-changing calls

## v0.5 — Platform hardening

- [ ] Token allow/deny list on the factory
- [ ] Optional platform fee to a treasury
- [ ] Sub-account / custom-account auth tests
- [ ] Professional security audit

## Backlog

Scoped, contributor-friendly issues (bug fixes, test-coverage gaps, docs,
small features) are tracked in GitHub issues with `Trivial` / `Medium` / `High`
complexity labels and clear acceptance criteria.
