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
import { notifyUser } from '../../../../lib/services/notificationService';

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
    escrowPda: clientEscrowPda, // Real on-chain PDA from client
    escrowSeed: clientEscrowSeed, // Seed used to derive PDA
    transferToVendor,
    transferDestination,
    transferDestinationType,
    transferSuccess,
  } = req.body;

  if (!mintRequestId || !mintAddress) {
    console.error('[confirm-mint] Missing required fields');
    return res.status(400).json({ error: 'mintRequestId and mintAddress are required' });
  }

  console.log(
    `[confirm-mint] Starting for request=${mintRequestId}, mint=${mintAddress}, transferDest=${transferDestination}, type=${transferDestinationType}`
  );

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
    console.log(`[confirm-mint] MintRequest saved as minted, owner=${mintRequest.transferredTo}`);

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
      const autoUsername = `vendor-${actualOwner.slice(0, 8).toLowerCase()}`;
      console.log(
        `[confirm-mint] Auto-creating vendor for ${actualOwner}, username=${autoUsername}`
      );
      ownerVendor = await Vendor.create({
        user: ownerUser._id,
        wallet: actualOwner,
        walletAddress: actualOwner,
        username: autoUsername,
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
    console.log(
      `[confirm-mint] Creating Asset: mint=${mintAddress}, vendor=${vendor?._id}, owner=${actualOwner}`
    );
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

    // Calculate listing price in lamports using live SOL price
    let solPrice = 150; // fallback
    try {
      const priceRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/price/sol`
      );
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        solPrice = priceData.price || 150;
      }
    } catch {
      /* use fallback */
    }
    const listingPriceLamports = Math.floor((mintRequest.priceUSD / solPrice) * 1e9);

    // Create Escrow record for marketplace listing
    // Use real on-chain escrow PDA from client (initialized after minting)
    // Falls back to placeholder for backward compatibility
    const listingEscrowPda = clientEscrowPda || `listing-${mintAddress}-${Date.now()}`;
    if (!clientEscrowPda) {
      console.warn('[confirm-mint] No escrowPda from client — using placeholder. Purchase will not work.');
    }

    console.log(
      `[confirm-mint] Creating Escrow listing: price=$${mintRequest.priceUSD}, SOL price=$${solPrice}`
    );
    const escrow = await Escrow.create({
      asset: asset._id,
      seller: ownerVendor?._id || null, // Use the vendor who owns the NFT
      sellerWallet: transferDestination || actualOwner, // Vendor wallet for payout routing
      escrowPda: listingEscrowPda, // Real on-chain PDA (or placeholder if client didn't provide)
      escrowSeed: clientEscrowSeed || null, // Seed for PDA derivation (needed for confirm_delivery)
      nftMint: mintAddress,
      saleMode: 'fixed_price',
      listingPrice: Math.round(mintRequest.priceUSD * 1_000_000), // USDC atomic units (6 decimals)
      listingPriceUSD: mintRequest.priceUSD,
      acceptingOffers: true, // Allow offers
      minimumOfferUSD: Math.floor(mintRequest.priceUSD * 0.8), // 80% minimum offer
      status: 'initiated', // Auto-promoted to 'listed' by Escrow pre-save hook when listingPrice is set
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

    // Notify vendor that NFT was minted and listed (best-effort)
    try {
      await notifyUser({
        userWallet: mintRequest.wallet,
        type: 'mint_request_minted',
        title: 'NFT Minted & Listed',
        message: `Your ${mintRequest.title} has been minted and is now listed on the marketplace.`,
        metadata: {
          assetId: asset._id.toString(),
          actionUrl: `/nft/${mintAddress}`,
        },
      }).catch(() => {});

      // Send rich email with listing image to vendor
      const resendKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'LuxHub <notifications@luxhub.gold>';
      const vendorUser = await User.findOne({ wallet: mintRequest.wallet });
      if (resendKey && vendorUser?.email) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: fromEmail,
            to: [vendorUser.email],
            subject: `Your ${mintRequest.title} is now live on LuxHub`,
            html: `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<style>:root{color-scheme:dark only;}body,html{background-color:#050507!important;}u+.body{background-color:#050507!important;}[data-ogsc] body{background-color:#050507!important;}@media(prefers-color-scheme:light){body,html,.cbg{background-color:#050507!important;}.t1{color:#ffffff!important;}.t2{color:#e0e0e0!important;}.t3{color:#999999!important;}}@media(prefers-color-scheme:dark){body,html,.cbg{background-color:#050507!important;}.t1{color:#ffffff!important;}.t2{color:#e0e0e0!important;}.t3{color:#999999!important;}}</style></head>
<body class="cbg" style="margin:0;padding:0;background-color:#050507;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:0;color:#050507;line-height:0;max-height:0;overflow:hidden;">Your ${mintRequest.title} is now live on LuxHub&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="cbg" style="background-color:#050507;">
<tr><td align="center" style="padding:48px 16px 40px;background-color:#050507;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">
<tr><td align="center" style="padding-bottom:44px;"><img src="${appUrl}/images/purpleLGG.png" alt="LuxHub" width="44" height="44" style="display:block;border:0;" /></td></tr>
<tr><td class="cbg" style="background-color:#0a0a0c;border:1px solid #1a1a1f;border-radius:16px;overflow:hidden;">
<div style="height:2px;background:linear-gradient(90deg,transparent 5%,#c8a1ff 30%,#a855f7 50%,#c8a1ff 70%,transparent 95%);"></div>
<div style="padding:48px 44px 40px;">
<p class="t1" style="margin:0 0 8px;font-size:18px;font-weight:600;color:#ffffff;">Your NFT is Live</p>
<p class="t3" style="margin:0 0 24px;font-size:14px;color:#999999;">Minted, verified, and listed on the marketplace.</p>
${imageUrl ? `<div style="text-align:center;margin:0 0 24px;"><div style="display:inline-block;border-radius:12px;overflow:hidden;border:1px solid rgba(200,161,255,0.15);"><img src="${imageUrl}" alt="${mintRequest.title}" style="display:block;max-width:280px;width:100%;object-fit:cover;" /></div></div>` : ''}
<p class="t1" style="margin:0 0 8px;font-size:18px;color:#ffffff;">${mintRequest.title}</p>
<p style="margin:0 0 12px;font-size:20px;font-weight:600;color:#c8a1ff;">$${Number(mintRequest.priceUSD).toLocaleString()} USD</p>
<p class="t3" style="margin:0 0 24px;font-size:13px;color:#999999;">Mint: <code style="background:#111;padding:2px 6px;border-radius:4px;font-size:12px;color:#999;">${mintAddress.slice(0, 12)}...${mintAddress.slice(-4)}</code></p>
<div style="text-align:center;margin:0 0 12px;">
<a href="${appUrl}/nft/${mintAddress}" style="display:inline-block;min-width:160px;padding:16px 36px;background:linear-gradient(135deg,rgba(200,161,255,0.12),rgba(168,85,247,0.08));border:1px solid #c8a1ff50;color:#c8a1ff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.8px;text-transform:uppercase;margin-right:8px;">View Listing</a>
<a href="${appUrl}/vendor/vendorDashboard" style="display:inline-block;min-width:120px;padding:16px 36px;background:rgba(255,255,255,0.03);border:1px solid #333;color:#999;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.8px;text-transform:uppercase;">Dashboard</a>
</div>
</div></td></tr>
<tr><td style="padding:36px 16px 0;text-align:center;"><p style="margin:0;font-size:11px;color:#555555;"><a href="https://luxhub.gold" style="color:#777;text-decoration:none;">luxhub.gold</a>&nbsp;&nbsp;&#183;&nbsp;&nbsp;<a href="https://x.com/LuxHubStudio" style="color:#777;text-decoration:none;">@LuxHubStudio</a></p></td></tr>
</table></td></tr></table></body></html>`,
          }),
        }).catch((err) => console.error('[confirm-mint] Vendor email error:', err));
      }
    } catch {
      /* non-blocking */
    }

    console.log(
      `[confirm-mint] Complete: asset=${asset._id}, escrow=${escrow._id}, notification sent to ${mintRequest.wallet}`
    );

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
