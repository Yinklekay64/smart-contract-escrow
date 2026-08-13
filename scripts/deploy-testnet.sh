#!/usr/bin/env bash
#
# Deploy the EscrowFactory to Stellar Testnet. Thin wrapper around deploy.sh.
#
# Usage:
#   ./scripts/testnet-setup.sh            # once, to create a funded identity
#   ./scripts/deploy-testnet.sh           # deploy the factory
#
# Env overrides:
#   IDENTITY   CLI identity to sign with (default: escrow-dev)
#
set -euo pipefail

export NETWORK="${NETWORK:-testnet}"
exec "$(dirname "${BASH_SOURCE[0]}")/deploy.sh"
