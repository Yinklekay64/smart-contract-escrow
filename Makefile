# Convenience targets for the Soroban workspace.

default: build

all: test

build:
	stellar contract build --manifest-path contracts/escrow/Cargo.toml
	stellar contract build --manifest-path contracts/factory/Cargo.toml

test: build
	cargo test --workspace

clippy: build
	cargo clippy --workspace --all-targets -- -D warnings

fmt:
	cargo fmt --all

fmt-check:
	cargo fmt --all --check

clean:
	cargo clean

.PHONY: default all build test clippy fmt fmt-check clean
