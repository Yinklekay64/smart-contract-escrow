# Contributing

Thanks for helping build `smart-contract-escrow`. This project is structured
for open-source contribution.

## Local setup

```bash
# Rust + Stellar CLI
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none
# Install the stellar CLI per: https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup

# Build and test
make build
make test
```

## Workflow

1. Find or open an issue (bugs, test gaps, docs, small features are welcome).
2. Create a feature branch off `main`: `git checkout -b feature/your-change`.
3. Make focused changes in small commits using Conventional Commits
   (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
4. Open a pull request and fill in the PR template.

## Coding standards

- **Rust (Soroban)** — follow `cargo fmt` and pass
  `cargo clippy --workspace --all-targets -- -D warnings`.
- Keep contracts `no_std` and dependency-light.
- Every state-changing function must check the caller's role and the current
  state before doing anything.
- Emit a typed `#[contractevent]` for every state transition.
- Add tests for the happy path **and** the adversarial path.

## PR checklist

- [ ] `cargo fmt --all --check`
- [ ] `cargo clippy --workspace --all-targets -- -D warnings`
- [ ] `make build && cargo test --workspace`
- [ ] Tests added/updated for the change
- [ ] Docs updated if behavior changed

## How to claim an issue

A scoped backlog of ready-to-file issues lives in
[`docs/ISSUE_BACKLOG.md`](docs/ISSUE_BACKLOG.md). Comment on the issue to signal
you're working on it, then reference it in your PR (`Closes #N`). Issues are
labeled by complexity:

- **Trivial** — docs, typos, small test additions
- **Medium** — a focused feature or refactor
- **High** — larger features or security-sensitive changes

## Code of conduct

Be kind and constructive. Assume good faith.
