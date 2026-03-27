#!/usr/bin/env bash
# =============================================================================
# LuxHub Mainnet Deployment Script
# =============================================================================
# This script guides the deployment of the LuxHub Anchor program to mainnet-beta
# and initializes all on-chain configuration.
#
# Prerequisites (all completed):
#   - Deploy wallet funded with ~3 SOL: keys/mainnet/deploy.json
#   - Admin wallet: rb2BPA6dmjjAAp4DxbqwnpH5oVnXfLHD78KpDUxKHnb
#   - Squads multisig PDA: 5hy7HgdqM3vCPPtBY8crXqDhy3DttBvzrY3rzWnVRZor
#   - Treasury Marketplace wallet: HazcpAEQzcQHfpLpMdBiKo8U51NQbng7f3kqEcRGryUU
#   - Treasury Pools wallet: HvAB36TpqVgBRitWSCi9nHUEP6QdWP6jg3kjBqpiQcWU
#   - Treasury Partner wallet: FzdN8XFy6UzNaSnzXdwk9QWkcKFEYmUKb6o5Cz5wg1DE
#
# Usage: Run each section manually, verifying output at each step.
# DO NOT run this as a single automated script -- each step needs verification.
# =============================================================================

set -euo pipefail

# Configuration
DEPLOY_KEYPAIR="keys/mainnet/deploy.json"
DEPLOY_PUBKEY="39PFk7DPf4u1rbgjpxYdcp4sKmvpxLygoWyoef26qBZV"
ADMIN_WALLET="rb2BPA6dmjjAAp4DxbqwnpH5oVnXfLHD78KpDUxKHnb"
SQUADS_MULTISIG_PDA="5hy7HgdqM3vCPPtBY8crXqDhy3DttBvzrY3rzWnVRZor"
TREASURY_MARKETPLACE="HazcpAEQzcQHfpLpMdBiKo8U51NQbng7f3kqEcRGryUU"
TREASURY_POOLS="HvAB36TpqVgBRitWSCi9nHUEP6QdWP6jg3kjBqpiQcWU"
TREASURY_PARTNER="FzdN8XFy6UzNaSnzXdwk9QWkcKFEYmUKb6o5Cz5wg1DE"
RPC_URL="${NEXT_PUBLIC_SOLANA_ENDPOINT:-https://api.mainnet-beta.solana.com}"

echo "============================================="
echo "  LuxHub Mainnet Deployment Checklist"
echo "============================================="
echo ""

# ---------------------------------------------------------------------------
# STEP 0: Pre-flight checks
# ---------------------------------------------------------------------------
echo "--- STEP 0: Pre-flight Checks ---"
echo ""

echo "Checking deploy wallet balance..."
solana balance "$DEPLOY_PUBKEY" --url mainnet-beta
echo ""
echo "Expected: >= 2.5 SOL (program deploy ~2 SOL + config init ~0.01 SOL)"
echo ""

echo "Checking Solana CLI version..."
solana --version
echo ""

echo "Checking Anchor CLI version..."
anchor --version
echo ""

echo "Press Enter to continue to Step 1 (build), or Ctrl+C to abort."
read -r

# ---------------------------------------------------------------------------
# STEP 1: Update Anchor.toml with mainnet config
# ---------------------------------------------------------------------------
echo "--- STEP 1: Update Anchor.toml ---"
echo ""
echo "Add the following to Solana-Anchor/Anchor.toml:"
echo ""
echo '  [programs.mainnet]'
echo '  luxhub_marketplace = "PLACEHOLDER_UNTIL_DEPLOY"'
echo ""
echo "Also ensure the [provider] section has mainnet option:"
echo ""
echo '  [provider]'
echo '  cluster = "mainnet"'
echo '  wallet = "'$DEPLOY_KEYPAIR'"'
echo ""
echo "Press Enter after updating Anchor.toml, or Ctrl+C to abort."
read -r

# ---------------------------------------------------------------------------
# STEP 2: Build the Anchor program
# ---------------------------------------------------------------------------
echo "--- STEP 2: Build Anchor Program ---"
echo ""
cd Solana-Anchor

echo "Running: anchor build"
anchor build

echo ""
echo "Build complete. Verify no errors above."
echo "Press Enter to continue to deployment, or Ctrl+C to abort."
read -r

# ---------------------------------------------------------------------------
# STEP 3: Deploy to mainnet-beta
# ---------------------------------------------------------------------------
echo "--- STEP 3: Deploy to Mainnet-Beta ---"
echo ""
echo "IMPORTANT: This costs ~2 SOL and deploys the program permanently."
echo ""
echo "Running: anchor deploy --provider.cluster mainnet --provider.wallet $DEPLOY_KEYPAIR"
echo ""
echo "Press Enter to deploy, or Ctrl+C to abort."
read -r

anchor deploy --provider.cluster mainnet --provider.wallet "$DEPLOY_KEYPAIR"

echo ""
echo "=== CAPTURE THE PROGRAM ID FROM OUTPUT ABOVE ==="
echo "Enter the new mainnet program ID:"
read -r MAINNET_PROGRAM_ID

echo ""
echo "Verifying program deployment..."
solana program show "$MAINNET_PROGRAM_ID" --url mainnet-beta

echo ""
echo "Press Enter after verifying the program info above, or Ctrl+C if there was an error."
read -r

# ---------------------------------------------------------------------------
# STEP 4: Update Anchor.toml with real program ID
# ---------------------------------------------------------------------------
echo "--- STEP 4: Update Anchor.toml with Real Program ID ---"
echo ""
echo "Update Solana-Anchor/Anchor.toml:"
echo ""
echo '  [programs.mainnet]'
echo "  luxhub_marketplace = \"$MAINNET_PROGRAM_ID\""
echo ""
echo "Press Enter after updating, or Ctrl+C to abort."
read -r

# ---------------------------------------------------------------------------
# STEP 5: Initialize EscrowConfig on mainnet
# ---------------------------------------------------------------------------
echo "--- STEP 5: Initialize EscrowConfig ---"
echo ""
echo "Run the initialization script from the project root:"
echo ""
echo "  npx ts-node scripts/initialize-escrow-config.ts \\"
echo "    --programId $MAINNET_PROGRAM_ID \\"
echo "    --keypair $DEPLOY_KEYPAIR \\"
echo "    --authority $ADMIN_WALLET \\"
echo "    --treasury $TREASURY_MARKETPLACE \\"
echo "    --feeBps 300 \\"
echo "    --cluster mainnet-beta"
echo ""
echo "Press Enter after running the script, or Ctrl+C to abort."
read -r

# ---------------------------------------------------------------------------
# STEP 6: Derive Squads Vault PDA
# ---------------------------------------------------------------------------
echo "--- STEP 6: Derive Squads Vault PDA ---"
echo ""
echo "Run:"
echo "  node scripts/deriveVaultPda.mjs $SQUADS_MULTISIG_PDA"
echo ""
echo "Record the Vault 0 PDA for use as the EscrowConfig treasury."
echo ""
echo "If the EscrowConfig treasury should point to the Squads vault PDA"
echo "instead of the direct marketplace wallet, run update_config after"
echo "deriving the vault PDA."
echo ""
echo "Press Enter to continue, or Ctrl+C to abort."
read -r

# ---------------------------------------------------------------------------
# STEP 7: Create Bags Partner Config PDA
# ---------------------------------------------------------------------------
echo "--- STEP 7: Create Bags Partner Config PDA ---"
echo ""
echo "Option A: Use the API endpoint (requires app running):"
echo "  curl -X POST http://localhost:3000/api/bags/create-partner-config \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"adminWallet\": \"$ADMIN_WALLET\", \"partnerWallet\": \"$TREASURY_PARTNER\"}'"
echo ""
echo "Option B: Use the Bags dashboard at https://dev.bags.fm"
echo ""
echo "After creation, record the BAGS_PARTNER_CONFIG_PDA value."
echo ""
echo "Press Enter to continue, or Ctrl+C to abort."
read -r

# ---------------------------------------------------------------------------
# STEP 8: Summary
# ---------------------------------------------------------------------------
echo ""
echo "============================================="
echo "  Mainnet Deployment Summary"
echo "============================================="
echo ""
echo "Program ID (mainnet):     $MAINNET_PROGRAM_ID"
echo "Deploy Wallet:            $DEPLOY_PUBKEY"
echo "Admin Wallet:             $ADMIN_WALLET"
echo "Squads Multisig PDA:      $SQUADS_MULTISIG_PDA"
echo "Treasury Marketplace:     $TREASURY_MARKETPLACE"
echo "Treasury Pools:           $TREASURY_POOLS"
echo "Treasury Partner:         $TREASURY_PARTNER"
echo ""
echo "Next steps:"
echo "  1. Update .env.local / Vercel env vars with PROGRAM_ID=$MAINNET_PROGRAM_ID"
echo "  2. Set NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta"
echo "  3. Set NEXT_PUBLIC_SOLANA_ENDPOINT to mainnet Helius RPC"
echo "  4. Set NEXT_PUBLIC_SQUADS_MSIG=$SQUADS_MULTISIG_PDA"
echo "  5. Set TREASURY_MARKETPLACE=$TREASURY_MARKETPLACE"
echo "  6. Set TREASURY_POOLS=$TREASURY_POOLS"
echo "  7. Set TREASURY_PARTNER=$TREASURY_PARTNER"
echo "  8. Deploy app to Vercel"
echo ""
echo "============================================="
