// scripts/derive-addresses.ts
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';

const PROGRAM_ID = process.env.PROGRAM_ID || 'GRE7cbpBscopx6ygmCvhPqMNEUDWtu9gBVSzNMSPWkLX';
const WSOL = 'So11111111111111111111111111111111111111112';

async function main() {
  const [seedArg, mintBArg, sellerArg, buyerArg, luxhubFeeArg] = process.argv.slice(2);
  if (!seedArg || !mintBArg || !sellerArg || !buyerArg || !luxhubFeeArg) {
    console.error(
      'Usage: ts-node scripts/derive-addresses.ts <seed> <mintB> <seller> <buyer> <luxhubFeeWallet>'
    );
    process.exit(1);
  }

  const seed = new BN(seedArg);
  const mintB = new PublicKey(mintBArg);
  const seller = new PublicKey(sellerArg);
  const buyer = new PublicKey(buyerArg);
  const luxhubFeeWallet = new PublicKey(luxhubFeeArg);

  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('state'), seed.toArrayLike(Buffer, 'le', 8)],
    new PublicKey(PROGRAM_ID)
  );

  // Vault ATAs (owner = escrowPda, allow owner off-curve)
  const nftVault = await getAssociatedTokenAddress(mintB, escrowPda, true);
  const wsolVault = await getAssociatedTokenAddress(new PublicKey(WSOL), escrowPda, true);

  // User ATAs
  const sellerNftAta = await getAssociatedTokenAddress(mintB, seller);
  const buyerNftAta = await getAssociatedTokenAddress(mintB, buyer);
  const sellerFundsAta = await getAssociatedTokenAddress(new PublicKey(WSOL), seller);
  const luxhubFeeAta = await getAssociatedTokenAddress(new PublicKey(WSOL), luxhubFeeWallet);

  console.log(
    JSON.stringify(
      {
        programId: PROGRAM_ID,
        seed: seed.toString(),
        escrowPda: escrowPda.toBase58(),
        nftVault: nftVault.toBase58(),
        wsolVault: wsolVault.toBase58(),
        sellerNftAta: sellerNftAta.toBase58(),
        buyerNftAta: buyerNftAta.toBase58(),
        sellerFundsAta: sellerFundsAta.toBase58(),
        luxhubFeeAta: luxhubFeeAta.toBase58(),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
