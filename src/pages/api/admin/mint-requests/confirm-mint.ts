// /pages/api/admin/mint-requests/confirm-mint.ts
// Confirms a mint after client-side signing and submission
// Updates database records, creates asset, and auto-lists on marketplace
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import dbConnect from '../../../../lib/database/mongodb';
import MintRequest from '../../../../lib/models/MintRequest';
import Asset from '../../../../lib/models/Assets';
import { Escrow } from '../../../../lib/models/Escrow';
import { Vendor } from '../../../../lib/models/Vendor';
import { User } from '../../../../lib/models/User';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';
import { getStorageConfig } from '../../../../utils/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();

  const signerWallet = req.headers['x-wallet-address'] as string;
  if (!signerWallet) {
    return res.status(401).json({ error: 'Wallet address required' });
  }

  // Verify admin permissions
  const adminConfig = getAdminConfig();
  const isEnvAdmin = adminConfig.isAdmin(signerWallet);
  const isEnvSuperAdmin = adminConfig.isSuperAdmin(signerWallet);
  const dbAdmin = await AdminRole.findOne({ wallet: signerWallet, isActive: true });

  const canMint =
    isEnvSuperAdmin ||
    isEnvAdmin ||
    dbAdmin?.permissions?.canApproveMints ||
    dbAdmin?.role === 'super_admin';

  if (!canMint) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { mintRequestId, mintAddress, signature, transferToVendor } = req.body;

  if (!mintRequestId || !mintAddress) {
    return res.status(400).json({ error: 'mintRequestId and mintAddress are required' });
  }

  try {
    const mintRequest = await MintRequest.findById(mintRequestId);
    if (!mintRequest) {
      return res.status(404).json({ error: 'Mint request not found' });
    }

    // Verify the mint exists on-chain
    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'
    );

    try {
      const accountInfo = await connection.getAccountInfo(new PublicKey(mintAddress));
      if (!accountInfo) {
        return res.status(400).json({
          error: 'Mint address not found on-chain. Transaction may have failed.',
        });
      }
    } catch (e) {
      console.error('Failed to verify mint on-chain:', e);
      // Continue anyway - might be RPC issue
    }

    // Get image/metadata info from pending mint or existing fields
    const imageUrl =
      mintRequest.pendingMint?.imageUrl ||
      mintRequest.imageUrl ||
      (mintRequest.imageCid
        ? getStorageConfig().provider === 'irys'
          ? `https://gateway.irys.xyz/${mintRequest.imageCid}`
          : mintRequest.imageUrl
        : null);
    const imageTxId = mintRequest.pendingMint?.imageTxId || mintRequest.imageCid;
    const metadataUri = mintRequest.pendingMint?.metadataUri;

    // Update mint request status
    mintRequest.status = 'minted';
    mintRequest.mintAddress = mintAddress;
    mintRequest.mintedBy = signerWallet;
    mintRequest.mintedAt = new Date();
    mintRequest.mintSignature = signature;
    if (imageTxId) mintRequest.imageCid = imageTxId;
    if (imageUrl) mintRequest.imageUrl = imageUrl;
    mintRequest.pendingMint = undefined; // Clear pending state
    await mintRequest.save();

    // Find vendor by wallet
    const vendorUser = await User.findOne({ wallet: mintRequest.wallet });
    const vendor = vendorUser ? await Vendor.findOne({ user: vendorUser._id }) : null;

    // Create Asset record
    const asset = await Asset.create({
      vendor: vendor?._id || null,
      model: mintRequest.model,
      serial: mintRequest.referenceNumber,
      description: mintRequest.description,
      priceUSD: mintRequest.priceUSD,
      imageIpfsUrls: imageTxId ? [imageTxId] : [],
      imageUrl: imageUrl,
      metadataIpfsUrl: metadataUri,
      nftMint: mintAddress,
      nftOwnerWallet: mintRequest.wallet, // Vendor owns the NFT
      mintedBy: signerWallet,
      status: 'listed',
      category: 'watches',
      brand: mintRequest.brand,
      title: mintRequest.title,
      material: mintRequest.material,
      productionYear: mintRequest.productionYear,
      movement: mintRequest.movement,
      caseSize: mintRequest.caseSize,
      waterResistance: mintRequest.waterResistance,
      dialColor: mintRequest.dialColor,
      condition: mintRequest.condition,
      boxPapers: mintRequest.boxPapers,
      limitedEdition: mintRequest.limitedEdition,
      country: mintRequest.country,
      certificate: mintRequest.certificate,
      warrantyInfo: mintRequest.warrantyInfo,
      provenance: mintRequest.provenance,
      features: mintRequest.features,
      releaseDate: mintRequest.releaseDate,
      arweaveTxId: imageTxId,
      arweaveMetadataTxId: metadataUri?.includes('gateway.irys.xyz')
        ? metadataUri.split('/').pop()
        : undefined,
      transferHistory: [
        {
          from: signerWallet,
          to: mintRequest.wallet,
          transferredAt: new Date(),
        },
      ],
      metaplexMetadata: {
        name: mintRequest.title,
        symbol: 'LUXHUB',
        uri: metadataUri || '',
        creators: [
          {
            address: signerWallet,
            share: 100,
            verified: true,
          },
        ],
      },
    });

    console.log(`✅ Asset created: ${asset._id}`);

    // Calculate listing price in lamports (1 SOL = 1e9 lamports)
    // Use a rough SOL price estimate or fetch from API
    const solPrice = 150; // Approximate SOL price in USD
    const listingPriceLamports = Math.floor((mintRequest.priceUSD / solPrice) * 1e9);

    // Create Escrow record for marketplace listing
    // This allows the NFT to show up on the marketplace
    const escrow = await Escrow.create({
      asset: asset._id,
      seller: vendor?._id || null,
      sellerWallet: mintRequest.wallet,
      nftMint: mintAddress,
      saleMode: 'fixed_price',
      listingPrice: listingPriceLamports,
      listingPriceUSD: mintRequest.priceUSD,
      acceptingOffers: true, // Allow offers
      minimumOfferUSD: Math.floor(mintRequest.priceUSD * 0.8), // 80% minimum offer
      status: 'initiated', // Ready for sale
      createdAt: new Date(),
    });

    // Update asset with escrow reference
    asset.escrowId = escrow._id;
    await asset.save();

    console.log(`✅ Escrow created: ${escrow._id}, listing at $${mintRequest.priceUSD}`);

    return res.status(200).json({
      success: true,
      message: 'NFT minted, asset created, and listed on marketplace',
      mintAddress,
      assetId: asset._id,
      escrowId: escrow._id,
      signature,
      vendorWallet: mintRequest.wallet,
      listingPriceUSD: mintRequest.priceUSD,
    });
  } catch (error) {
    console.error('Error confirming mint:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
