#!/usr/bin/env bash
#
# Build the Escrow and EscrowFactory WASM contracts.
#
# Usage:
#   ./scripts/build.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v stellar >/dev/null 2>&1; then
  echo "error: 'stellar' CLI not found on PATH" >&2
  echo "Install it: https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup" >&2
  exit 1
fi

echo "==> Building Escrow"
stellar contract build --manifest-path contracts/escrow/Cargo.toml

echo "==> Building EscrowFactory"
stellar contract build --manifest-path contracts/factory/Cargo.toml

echo
echo "WASM artifacts:"
echo "  target/wasm32v1-none/release/escrow.wasm"
echo "  target/wasm32v1-none/release/escrow_factory.wasm"
