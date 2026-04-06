// Inspect stale Squads proposals — show what each would do
// Usage: node scripts/inspect-squads-proposals.cjs
const { Connection, PublicKey } = require('@solana/web3.js');
const multisig = require('@sqds/multisig');
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const endpoint =
    process.env.HELIUS_ENDPOINT ||
    process.env.NEXT_PUBLIC_SOLANA_ENDPOINT ||
    'https://api.mainnet-beta.solana.com';
  const msigAddr = process.env.NEXT_PUBLIC_SQUADS_MSIG;
  if (!msigAddr) {
    console.error('NEXT_PUBLIC_SQUADS_MSIG not set');
    process.exit(1);
  }

  const connection = new Connection(endpoint, 'confirmed');
  const msigPk = new PublicKey(msigAddr);

  const msigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);
  const currentIndex = Number(msigAccount.transactionIndex);
  console.log(`Multisig: ${msigAddr}`);
  console.log(`Total transactions: ${currentIndex}\n`);

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  for (let i = currentIndex; i >= Math.max(1, currentIndex - 15); i--) {
    const txIndex = BigInt(i);
    const [proposalPda] = multisig.getProposalPda({
      multisigPda: msigPk,
      transactionIndex: txIndex,
    });
    const [vaultTxPda] = multisig.getTransactionPda({
      multisigPda: msigPk,
      index: txIndex,
    });

    let proposal;
    try {
      proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
    } catch {
      console.log(`#${i}: (no proposal account)`);
      continue;
    }

    const ps = proposal.status;
    const kind = (ps && ps.__kind ? String(ps.__kind).toLowerCase() : '') ||
      (ps && typeof ps === 'object' ? Object.keys(ps)[0] : '') ||
      '';
    const approvals = proposal.approved?.length ?? 0;
    const threshold = Number(msigAccount.threshold);
    let status;
    if (kind === 'executed') status = 'EXECUTED';
    else if (kind === 'rejected') status = 'REJECTED';
    else if (kind === 'cancelled') status = 'CANCELLED';
    else if (kind === 'approved' || (kind === 'active' && approvals >= threshold))
      status = `APPROVED ${approvals}/${threshold} (ready to execute)`;
    else if (kind === 'active') status = `ACTIVE ${approvals}/${threshold}`;
    else if (kind === 'draft') status = 'DRAFT';
    else status = `UNKNOWN (raw=${JSON.stringify(ps)})`;

    // Try to match to an escrow in DB
    const matchEscrow = await db
      .collection('escrows')
      .findOne({
        $or: [
          { squadsTransactionIndex: String(i) },
          { confirmDeliveryProposalIndex: String(i) },
          { refundProposalIndex: String(i) },
        ],
      });

    console.log(`#${i}  ${status}`);
    console.log(`   vaultTx: ${vaultTxPda.toBase58()}`);
    if (matchEscrow) {
      console.log(`   → Escrow ${matchEscrow.escrowPda} (status=${matchEscrow.status}, nftMint=${matchEscrow.nftMint})`);
    } else {
      console.log(`   → No escrow match in DB (inspect on Solscan)`);
    }
    console.log('');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
