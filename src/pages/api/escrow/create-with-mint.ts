// src/pages/api/escrow/create-with-mint.ts
// Atomic mint + escrow creation via Squads proposal
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey, TransactionMessage } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { BN } from '@coral-xyz/anchor';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Asset } from '../../../lib/models/Assets';
import { Vendor } from '../../../lib/models/Vendor';

export const config = {
  runtime: 'nodejs',
};

interface CreateWithMintRequest {
  // Vendor info
  vendorWallet: string;

  // Asset info
  assetId: string;
  nftMint: string;

  // Sale terms
  saleMode: 'fixed_price' | 'accepting_offers' | 'crowdfunded';
  listingPrice: number; // In lamports
  listingPriceUSD: number;
  minimumOffer?: number; // For accepting_offers mode
  minimumOfferUSD?: number;

  // Escrow params
  seed: number;
  fileCid: string;

  // Optional
  rpc?: string;
  multisigPda?: string;
  vaultIndex?: number;
  autoApprove?: boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      vendorWallet,
      assetId,
      nftMint,
      saleMode = 'fixed_price',
      listingPrice,
      listingPriceUSD,
      minimumOffer,
      minimumOfferUSD,
      seed,
      fileCid,
      rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
      multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG,
      vaultIndex = 0,
      autoApprove = true,
    } = req.body as CreateWithMintRequest;

    // Validation
    if (!vendorWallet || !assetId || !nftMint || !listingPrice || !seed || !fileCid) {
      return res.status(400).json({
        error:
          'Missing required fields: vendorWallet, assetId, nftMint, listingPrice, seed, fileCid',
      });
    }

    if (!rpc || !multisigPda) {
      return res.status(500).json({ error: 'RPC or MULTISIG env is not set' });
    }

    await dbConnect();

    // Verify asset exists
    const asset = await Asset.findById(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Verify vendor exists
    const vendor = await Vendor.findOne({ 'user.wallet': vendorWallet }).populate('user');
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Check for duplicate escrow
    const existingEscrow = await Escrow.findOne({ nftMint, deleted: false });
    if (existingEscrow) {
      return res.status(400).json({ error: 'Escrow already exists for this NFT' });
    }

    const connection = new Connection(rpc, 'confirmed');
    const msigPk = new PublicKey(multisigPda);
    const programId = new PublicKey(process.env.PROGRAM_ID!);
    const sellerPk = new PublicKey(vendorWallet);
    const mintPk = new PublicKey(nftMint);

    // Fetch multisig account for transaction index
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);
    const currentIndex = Number(multisigAccount.transactionIndex);
    const transactionIndex = BigInt(currentIndex + 1);

    const [vaultPda] = multisig.getVaultPda({ multisigPda: msigPk, index: vaultIndex });

    // Derive escrow PDA
    const seedBn = new BN(seed);
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('state'), seedBn.toArrayLike(Buffer, 'le', 8)],
      programId
    );

    // Build initialize escrow instruction data
    // Discriminator for 'initialize' + params
    const discriminator = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]); // anchor discriminator
    const seedBuffer = seedBn.toArrayLike(Buffer, 'le', 8);
    const initializerAmount = new BN(1).toArrayLike(Buffer, 'le', 8); // NFT = 1
    const takerAmount = new BN(listingPrice).toArrayLike(Buffer, 'le', 8);

    // Encode fileCid as string (4 byte length prefix + utf8 bytes)
    const cidBytes = Buffer.from(fileCid, 'utf8');
    const cidLengthBuffer = Buffer.alloc(4);
    cidLengthBuffer.writeUInt32LE(cidBytes.length, 0);

    const salePriceBuffer = new BN(listingPrice).toArrayLike(Buffer, 'le', 8);

    const instructionData = Buffer.concat([
      discriminator,
      seedBuffer,
      initializerAmount,
      takerAmount,
      cidLengthBuffer,
      cidBytes,
      salePriceBuffer,
    ]);

    // Build account keys for initialize instruction
    // This matches the Initialize context in the Anchor program
    const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
    const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');

    // Derive ATAs
    const [sellerAtaB] = PublicKey.findProgramAddressSync(
      [sellerPk.toBuffer(), TOKEN_PROGRAM.toBuffer(), mintPk.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM
    );
    const [nftVault] = PublicKey.findProgramAddressSync(
      [escrowPda.toBuffer(), TOKEN_PROGRAM.toBuffer(), mintPk.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM
    );
    const [wsolVault] = PublicKey.findProgramAddressSync(
      [escrowPda.toBuffer(), TOKEN_PROGRAM.toBuffer(), WSOL_MINT.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM
    );
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);

    const keys = [
      { pubkey: sellerPk.toBase58(), isSigner: true, isWritable: true },
      { pubkey: mintPk.toBase58(), isSigner: false, isWritable: false },
      { pubkey: WSOL_MINT.toBase58(), isSigner: false, isWritable: false },
      { pubkey: sellerAtaB.toBase58(), isSigner: false, isWritable: true },
      { pubkey: escrowPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: nftVault.toBase58(), isSigner: false, isWritable: true },
      { pubkey: wsolVault.toBase58(), isSigner: false, isWritable: true },
      { pubkey: configPda.toBase58(), isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM.toBase58(), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM.toBase58(), isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM.toBase58(), isSigner: false, isWritable: false },
    ];

    // Create Squads proposal via internal API call
    const proposeResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/squads/propose`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId: programId.toBase58(),
          keys,
          dataBase64: instructionData.toString('base64'),
          vaultIndex,
          autoApprove,
          rpc,
          multisigPda,
        }),
      }
    );

    const proposeResult = await proposeResponse.json();

    if (!proposeResponse.ok) {
      return res.status(500).json({
        error: 'Failed to create Squads proposal',
        details: proposeResult,
      });
    }

    // Create MongoDB escrow record
    const escrow = new Escrow({
      asset: assetId,
      seller: vendor._id,
      sellerWallet: vendorWallet,
      escrowPda: escrowPda.toBase58(),
      nftMint,
      saleMode,
      listingPrice,
      listingPriceUSD,
      minimumOffer: saleMode === 'accepting_offers' ? minimumOffer : undefined,
      minimumOfferUSD: saleMode === 'accepting_offers' ? minimumOfferUSD : undefined,
      acceptingOffers: saleMode === 'accepting_offers',
      status: 'initiated',
      squadsTransactionIndex: proposeResult.transactionIndex,
      squadsProposedAt: new Date(),
    });

    await escrow.save();

    // Update asset status
    await Asset.findByIdAndUpdate(assetId, {
      status: 'in_escrow',
      escrowPda: escrowPda.toBase58(),
    });

    return res.status(200).json({
      success: true,
      escrow: {
        _id: escrow._id,
        escrowPda: escrowPda.toBase58(),
        status: escrow.status,
        saleMode,
        listingPrice,
        listingPriceUSD,
      },
      squads: {
        transactionIndex: proposeResult.transactionIndex,
        proposalPda: proposeResult.proposalPda,
        vaultTransactionPda: proposeResult.vaultTransactionPda,
        squadsDeepLink: proposeResult.squadsDeepLink,
        autoApproved: proposeResult.autoApproved,
        threshold: proposeResult.threshold,
      },
      message: 'Escrow creation proposal submitted to Squads. Awaiting multisig approval.',
    });
  } catch (error: any) {
    console.error('[/api/escrow/create-with-mint] Error:', error);
    return res.status(500).json({
      error: 'Failed to create escrow',
      details: error?.message || 'Unknown error',
    });
  }
}
