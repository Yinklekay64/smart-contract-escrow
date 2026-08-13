#!/usr/bin/env bash
#
# Print example `stellar contract invoke` commands for every escrow function,
# so reviewers and contributors can exercise the contract manually on testnet.
#
# This script only *prints* commands; it does not run them. Run it, copy the
# lines you need, and substitute the placeholder values (or export them first).
#
# Usage:
#   FACTORY_ID=CC… ./scripts/invoke-examples.sh
#
# Env overrides (all optional — placeholders are printed otherwise):
#   FACTORY_ID, BUYER, SELLER, ARBITER, TOKEN, AMOUNT, TIMEOUT, ESCROW_ID
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NETWORK="testnet"
IDENTITY="${IDENTITY:-escrow-dev}"
FACTORY_ID="${FACTORY_ID:-$(cat deployments/factory.testnet.txt 2>/dev/null || echo '<FACTORY_ID>')}"
BUYER="${BUYER:-<BUYER_ADDRESS>}"
SELLER="${SELLER:-<SELLER_ADDRESS>}"
ARBITER="${ARBITER:-<ARBITER_ADDRESS>}"
# Native XLM SAC on testnet by default; pass any SAC/USDC contract id instead.
TOKEN="${TOKEN:-CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC}"
AMOUNT="${AMOUNT:-10000000}"
TIMEOUT="${TIMEOUT:-604800}"
ESCROW_ADDRESS="${ESCROW_ADDRESS:-<ESCROW_ADDRESS>}"

cat <<EOF
# ── Factory ────────────────────────────────────────────────────────────────

# 1. Create an escrow (returns the new escrow id)
stellar contract invoke \\
  --id $FACTORY_ID \\
  --network $NETWORK \\
  --source-account $IDENTITY \\
  -- create_escrow \\
  --buyer $BUYER \\
  --seller $SELLER \\
  --arbiter $ARBITER \\
  --token $TOKEN \\
  --amount $AMOUNT \\
  --timeout $TIMEOUT

# 2. Look up the deployed escrow address by id
stellar contract invoke \\
  --id $FACTORY_ID \\
  --network $NETWORK \\
  --source-account $IDENTITY \\
  -- get_escrow --id <ESCROW_ID>

# 3. List escrow ids a participant is involved in
stellar contract invoke \\
  --id $FACTORY_ID \\
  --network $NETWORK \\
  --source-account $IDENTITY \\
  -- list_escrows_by_user --user $BUYER

# ── Escrow ─────────────────────────────────────────────────────────────────

# 4. Buyer deposits funds
stellar contract invoke \\
  --id $ESCROW_ADDRESS \\
  --network $NETWORK \\
  --source-account $BUYER \\
  -- deposit

# 5. Seller marks delivery (opens the buyer response window)
stellar contract invoke \\
  --id $ESCROW_ADDRESS \\
  --network $NETWORK \\
  --source-account $SELLER \\
  -- mark_delivered

# 6. Buyer confirms receipt (releases to seller)
stellar contract invoke \\
  --id $ESCROW_ADDRESS \\
  --network $NETWORK \\
  --source-account $BUYER \\
  -- confirm

# 7. Buyer raises a dispute
stellar contract invoke \\
  --id $ESCROW_ADDRESS \\
  --network $NETWORK \\
  --source-account $BUYER \\
  -- dispute

# 8. Arbiter resolves a dispute (release_to_seller: true | false)
stellar contract invoke \\
  --id $ESCROW_ADDRESS \\
  --network $NETWORK \\
  --source-account $ARBITER \\
  -- resolve --release_to_seller true

# 9. Auto-release after the response window expires (anyone)
stellar contract invoke \\
  --id $ESCROW_ADDRESS \\
  --network $NETWORK \\
  --source-account $IDENTITY \\
  -- release

# 10. Seller refunds the buyer before delivery
stellar contract invoke \\
  --id $ESCROW_ADDRESS \\
  --network $NETWORK \\
  --source-account $SELLER \\
  -- refund
EOF
