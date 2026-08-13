#!/usr/bin/env bash
#
# Configure the Stellar CLI for Testnet and create a funded dev identity.
#
# Usage:
#   ./scripts/testnet-setup.sh [IDENTITY_NAME]
#
# Env overrides:
#   STELLAR_RPC_URL            Testnet RPC endpoint
#   STELLAR_NETWORK_PASSPHRASE Testnet passphrase
#
set -euo pipefail

IDENTITY="${1:-escrow-dev}"
NETWORK="testnet"

RPC_URL="${STELLAR_RPC_URL:-https://soroban-testnet.stellar.org}"
PASSPHRASE="${STELLAR_NETWORK_PASSPHRASE:-Test SDF Network ; September 2015}"

if ! command -v stellar >/dev/null 2>&1; then
  echo "error: 'stellar' CLI not found on PATH" >&2
  echo "Install it: https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup" >&2
  exit 1
fi

# Register the network (idempotent).
stellar network add "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$PASSPHRASE" \
  2>/dev/null || true

# Generate the identity and fund it via Friendbot.
stellar keys generate "$IDENTITY" --network "$NETWORK" --fund

ADDRESS="$(stellar keys public-key "$IDENTITY")"
echo
echo "Testnet ready."
echo "  network:  $NETWORK"
echo "  identity: $IDENTITY -> $ADDRESS"
echo
echo "Next: ./scripts/deploy.sh"
