// src/pages/api/users/profile/[wallet].ts
// Public user profile endpoint - no auth required
// Returns user info + REAL on-chain NFT holdings via Helius DAS API + pool investments
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import { User } from '../../../../lib/models/User';
import { Asset } from '../../../../lib/models/Assets';
import { Pool } from '../../../../lib/models/Pool';
import VendorProfileModel from '../../../../lib/models/VendorProfile';
import { getAssetsByOwner, isNFT, getAssetImage, DASAsset } from '../../../../lib/services/dasApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { wallet } = req.query;

    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    await dbConnect();

    // Fetch user + vendor profile in parallel
    const [user, vendorProfile] = await Promise.all([
      User.findOne({
        $or: [{ wallet }, { 'linkedWallets.address': wallet }],
      }).lean() as Promise<any>,
      VendorProfileModel.findOne({ wallet }).lean() as Promise<any>,
    ]);

    // ========== ON-CHAIN NFT HOLDINGS via Helius DAS ==========
    // Single call returns ALL NFTs this wallet owns on Solana + SOL balance
    let dasResult;
    try {
      dasResult = await getAssetsByOwner(wallet, {
        page: 1,
        limit: 100,
        showNativeBalance: true,
        showCollectionMetadata: true,
        sortBy: { sortBy: 'recent_action', sortDirection: 'desc' },
      });
    } catch (err) {
      console.warn('[profile] DAS API call failed, returning empty holdings:', err);
      dasResult = { items: [], total: 0, limit: 100, page: 1 };
    }

    // Filter to NFTs only (exclude fungible tokens)
    const nftAssets = (dasResult.items || []).filter(
      (asset: DASAsset) => isNFT(asset) && !asset.burnt
    );

    // Background sync: update MongoDB ownership for any LuxHub NFTs this wallet holds on-chain
    // This fixes Gap 1: direct on-chain transfers now auto-sync to MongoDB
    if (nftAssets.length > 0) {
      const onChainMints = nftAssets.map((a: DASAsset) => a.id);
      Asset.updateMany(
        { nftMint: { $in: onChainMints }, nftOwnerWallet: { $ne: wallet } },
        { $set: { nftOwnerWallet: wallet } }
      ).catch((err: any) => console.warn('[profile] Background ownership sync failed:', err));
    }

    // Transform DAS assets to our NFT card format
    const nfts = nftAssets.map((asset: DASAsset) => {
      const metadata = asset.content?.metadata || {};
      const image = getAssetImage(asset);
      const priceInfo = asset.token_info?.price_info;

      return {
        _id: asset.id,
        mintAddress: asset.id,
        title: metadata.name || 'Untitled',
        image,
        priceSol: priceInfo?.price_per_token || 0,
        priceUSD: priceInfo?.total_price || 0,
        currentOwner: asset.ownership?.owner || wallet,
        marketStatus: 'holding',
        nftId: asset.id,
        fileCid: '',
        timestamp: Date.now(),
        seller: asset.creators?.[0]?.address || '',
        attributes: metadata.attributes || [],
        status: 'holding',
        collection: asset.grouping?.find((g) => g.group_key === 'collection')?.group_value,
        compressed: asset.compression?.compressed || false,
      };
    });

    // SOL balance from DAS
    const solBalance = dasResult.nativeBalance ? dasResult.nativeBalance.lamports / 1e9 : null;

    // ========== POOL INVESTMENTS (from MongoDB) ==========
    const pools = await Pool.find({
      'participants.wallet': wallet,
      deleted: { $ne: true },
    })
      .select('selectedAssetId status totalShares sharePriceUSD participants bagsTokenMint')
      .populate({ path: 'selectedAssetId', select: 'model brand images imageIpfsUrls' })
      .lean();

    const poolPositions = (pools as any[]).map((pool) => {
      const participant = pool.participants?.find((p: any) => p.wallet === wallet);
      const asset = pool.selectedAssetId as any;
      return {
        poolId: pool._id,
        status: pool.status,
        asset: asset
          ? {
              model: asset.model,
              brand: asset.brand,
              image: asset.imageIpfsUrls?.[0] || asset.images?.[0],
            }
          : null,
        shares: participant?.shares || 0,
        ownershipPercent: participant?.ownershipPercent || 0,
        investedUSD: participant?.investedUSD || 0,
      };
    });

    // Stats
    const totalNFTValue = nfts.reduce((sum: number, n: any) => sum + (n.priceSol || 0), 0);
    const totalPoolInvested = poolPositions.reduce((sum, p) => sum + p.investedUSD, 0);
    const activePools = poolPositions.filter(
      (p) => !['closed', 'dead', 'burned', 'failed'].includes(p.status)
    );

    // Build profile
    const profile = {
      wallet,
      name: user?.profile?.displayName || user?.profile?.name || vendorProfile?.name || null,
      username: user?.profile?.username || vendorProfile?.username || null,
      bio: user?.profile?.bio || vendorProfile?.bio || null,
      avatar: user?.profile?.avatar || vendorProfile?.avatarUrl || null,
      banner: user?.profile?.banner || vendorProfile?.bannerUrl || null,
      role: user?.role || 'user',
      joinedAt: user?.createdAt || vendorProfile?.joined || null,
      isVendor: !!vendorProfile,
      isVerified: vendorProfile?.verified || false,
    };

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json({
      success: true,
      profile,
      nfts,
      pools: poolPositions,
      stats: {
        totalNFTs: nfts.length,
        totalOnChainAssets: dasResult.total || 0,
        totalNFTValueSOL: totalNFTValue,
        solBalance,
        totalPoolInvested,
        activePools: activePools.length,
        totalPools: poolPositions.length,
      },
    });
  } catch (error: any) {
    console.error('[/api/users/profile/[wallet]] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch user profile',
      details: error?.message || 'Unknown error',
    });
  }
}
