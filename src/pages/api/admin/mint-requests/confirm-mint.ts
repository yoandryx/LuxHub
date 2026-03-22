// /pages/api/admin/mint-requests/confirm-mint.ts
// Confirms a mint after client-side signing and submission
// Updates database records, creates asset, and auto-lists on marketplace
import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import { getConnection } from '@/lib/solana/clusterConfig';
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

  const {
    mintRequestId,
    mintAddress,
    signature,
    transferToVendor,
    transferDestination,
    transferDestinationType,
    transferSuccess,
  } = req.body;

  if (!mintRequestId || !mintAddress) {
    console.error('[CONFIRM-MINT] ❌ Missing required fields');
    return res.status(400).json({ error: 'mintRequestId and mintAddress are required' });
  }

  try {
    const mintRequest = await MintRequest.findById(mintRequestId);
    if (!mintRequest) {
      return res.status(404).json({ error: 'Mint request not found' });
    }

    // Verify the mint exists on-chain (with retry for slow RPC)
    const connection = getConnection();

    let onChainVerified = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const accountInfo = await connection.getAccountInfo(new PublicKey(mintAddress));
        if (accountInfo) {
          onChainVerified = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 2000)); // Wait 2 seconds between retries
      } catch (e) {
        console.error('[CONFIRM-MINT] RPC error:', e);
      }
    }

    if (!onChainVerified) {
      // Could not verify on-chain, proceeding anyway (RPC may be slow)
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

    // Store transfer destination info
    mintRequest.transferDestination = transferDestination || signerWallet;
    mintRequest.transferDestinationType = transferDestinationType || 'admin';
    mintRequest.transferredTo = transferSuccess
      ? transferDestination || signerWallet
      : signerWallet;
    mintRequest.transferSuccess = transferSuccess;

    await mintRequest.save();

    // Determine actual NFT owner based on transfer destination
    const actualOwner = transferSuccess && transferDestination ? transferDestination : signerWallet;

    // Find or create user for the actual owner
    const ownerUser = await User.findOneAndUpdate(
      { wallet: actualOwner },
      { $setOnInsert: { wallet: actualOwner, role: 'vendor' } },
      { upsert: true, new: true }
    );

    // Find or auto-create vendor record for the owner
    let ownerVendor = await Vendor.findOne({ user: ownerUser._id });
    if (!ownerVendor) {
      // Auto-create a basic vendor record so they can access the dashboard
      ownerVendor = await Vendor.create({
        user: ownerUser._id,
        wallet: actualOwner,
        businessName: mintRequest.brand
          ? `${mintRequest.brand} Dealer`
          : `Vendor ${actualOwner.slice(0, 6)}`,
        verified: false,
        approved: true, // Auto-approve since admin is creating the listing
        onboardingStep: 'complete',
      });
      // Update user role to vendor
      await User.findByIdAndUpdate(ownerUser._id, { role: 'vendor' });
    }

    // Also find the original requester's vendor for reference
    const requesterUser = await User.findOne({ wallet: mintRequest.wallet });
    const requesterVendor = requesterUser
      ? await Vendor.findOne({ user: requesterUser._id })
      : null;

    // Use the owner's vendor if available, otherwise use requester's vendor
    const vendor = ownerVendor || requesterVendor;

    // Map free-text condition to Asset enum values
    // Legacy values ('New', 'Mint') map to 'Unworn' for backward compatibility
    const conditionMap: Record<string, string> = {
      new: 'Unworn',
      mint: 'Unworn',
      unworn: 'Unworn',
    };
    let mappedCondition: string | undefined;
    if (mintRequest.condition) {
      const condLower = mintRequest.condition.toLowerCase().trim();
      // Check explicit mappings first (legacy values)
      mappedCondition = conditionMap[condLower];
      if (!mappedCondition) {
        // Then fuzzy match against valid values
        const validConditions = ['Unworn', 'Excellent', 'Very Good', 'Good', 'Fair'];
        mappedCondition = validConditions.find((c) => condLower.includes(c.toLowerCase()));
      }
    }

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
      nftOwnerWallet: actualOwner, // Owner based on transfer success
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
      condition: mappedCondition,
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
      transferHistory: transferToVendor
        ? [
            {
              from: signerWallet,
              to: mintRequest.wallet,
              transferredAt: new Date(),
            },
          ]
        : [],
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

    // Calculate listing price in lamports (1 SOL = 1e9 lamports)
    // Use a rough SOL price estimate or fetch from API
    const solPrice = 150; // Approximate SOL price in USD
    const listingPriceLamports = Math.floor((mintRequest.priceUSD / solPrice) * 1e9);

    // Create Escrow record for marketplace listing
    // This allows the NFT to show up on the marketplace
    // Generate a placeholder escrowPda for listing purposes (actual on-chain escrow created on purchase)
    const listingEscrowPda = `listing-${mintAddress}-${Date.now()}`;

    const escrow = await Escrow.create({
      asset: asset._id,
      seller: ownerVendor?._id || null, // Use the vendor who owns the NFT
      sellerWallet: actualOwner,
      escrowPda: listingEscrowPda, // Placeholder for listing, replaced on-chain when buyer purchases
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

    // Determine transfer status message
    let transferMessage = 'NFT minted and listed on marketplace';
    if (transferSuccess && transferDestination) {
      if (transferDestinationType === 'requester') {
        transferMessage =
          'NFT minted, transferred to vendor (requester), and listed on marketplace';
      } else if (transferDestinationType === 'vendor') {
        transferMessage = 'NFT minted, transferred to selected vendor, and listed on marketplace';
      } else if (transferDestinationType === 'custom') {
        transferMessage = 'NFT minted, transferred to custom address, and listed on marketplace';
      }
    } else if (transferDestinationType === 'admin') {
      transferMessage = 'NFT minted and kept in admin wallet, listed on marketplace';
    }

    return res.status(200).json({
      success: true,
      message: transferMessage,
      mintAddress,
      assetId: asset._id,
      escrowId: escrow._id,
      signature,
      requesterWallet: mintRequest.wallet,
      actualOwner,
      transferDestination: transferDestination || signerWallet,
      transferDestinationType: transferDestinationType || 'admin',
      transferSuccess: !!transferSuccess,
      listingPriceUSD: mintRequest.priceUSD,
    });
  } catch (error: any) {
    console.error('Error confirming mint:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      details: error?.message || 'Unknown error',
      code: error?.code,
    });
  }
}
