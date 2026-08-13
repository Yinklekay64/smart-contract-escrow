#!/usr/bin/env bash
#
# Build the contracts and deploy the EscrowFactory to a Stellar network.
# The factory embeds the Escrow Wasm and uploads it on-chain during its own
# constructor, so only the factory needs to be deployed explicitly.
#
# Usage:
#   ./scripts/deploy.sh                     # testnet, identity 'escrow-dev'
#   NETWORK=mainnet IDENTITY=my-account ./scripts/deploy.sh
#
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
IDENTITY="${IDENTITY:-escrow-dev}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v stellar >/dev/null 2>&1; then
  echo "error: 'stellar' CLI not found on PATH" >&2
  echo "Install it: https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup" >&2
  exit 1
fi

echo "==> Building contracts"
stellar contract build --manifest-path contracts/escrow/Cargo.toml
stellar contract build --manifest-path contracts/factory/Cargo.toml

echo "==> Deploying EscrowFactory to $NETWORK (identity: $IDENTITY)"
OWNER_ADDRESS="$(stellar keys public-key "$IDENTITY")"
FACTORY_ID="$(
  stellar contract deploy \
    --wasm target/wasm32v1-none/release/escrow_factory.wasm \
    --network "$NETWORK" \
    --source-account "$IDENTITY" \
    --alias escrow-factory \
    -- --owner "$OWNER_ADDRESS"
)"
echo "Factory owner (may pause new escrows): $OWNER_ADDRESS"

echo
echo "EscrowFactory deployed: $FACTORY_ID"
mkdir -p deployments
printf '%s\n' "$FACTORY_ID" > "deployments/factory.$NETWORK.txt"
echo "Saved to deployments/factory.$NETWORK.txt"
