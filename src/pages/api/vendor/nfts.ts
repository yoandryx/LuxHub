// src/pages/api/vendor/nfts.ts
// Fetch NFTs owned by a vendor (for public profile display)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import NFTModel from '../../../lib/models/NFT';
import { Asset } from '../../../lib/models/Assets';
import { Vendor } from '../../../lib/models/Vendor';

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';
const IRYS_GATEWAY = 'https://gateway.irys.xyz/';

// Resolve image URL from CID or full URL
function resolveImageUrl(idOrUrl: string | undefined | null): string {
  if (!idOrUrl) return '/fallback.png';
  if (idOrUrl.startsWith('http://') || idOrUrl.startsWith('https://')) return idOrUrl;
  if (idOrUrl.startsWith('/')) return idOrUrl;
  // IPFS CIDv0 or CIDv1
  if (idOrUrl.startsWith('Qm') || idOrUrl.startsWith('bafy')) return `${GATEWAY}${idOrUrl}`;
  // Irys/Arweave TX ID (43-char base64url)
  if (idOrUrl.length === 43 && /^[A-Za-z0-9_-]+$/.test(idOrUrl)) return `${IRYS_GATEWAY}${idOrUrl}`;
  return `${GATEWAY}${idOrUrl}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  const wallet = req.query.wallet as string;
  const includeBurned = req.query.includeBurned === 'true';
  const onlyBurned = req.query.onlyBurned === 'true';

  if (!wallet) {
    return res.status(400).json({ error: 'Missing wallet' });
  }

  try {
    // Find the vendor by wallet
    const vendor = await Vendor.findOne({ wallet }).lean();

    // Query from Asset collection (primary source for minted NFTs)
    const vendorId = vendor ? (vendor as any)._id : null;
    const assetQuery: any = {
      deleted: { $ne: true },
      nftMint: { $exists: true, $ne: null }, // Only minted assets
      $or: [{ nftOwnerWallet: wallet }, ...(vendorId ? [{ vendor: vendorId }] : [])],
    };

    // Filter burned assets unless explicitly requested
    if (onlyBurned) {
      assetQuery.status = 'burned';
    } else if (!includeBurned) {
      assetQuery.status = { $ne: 'burned' };
    }

    const assets = await Asset.find(assetQuery).sort({ createdAt: -1 }).lean();

    // Also query NFT collection for any NFTs not in assets
    const assetMints = new Set(assets.map((a: any) => a.nftMint).filter(Boolean));
    const nftsFromCollection = await NFTModel.find({
      $or: [{ vendorWallet: wallet }, { currentOwner: wallet }],
      mintAddress: { $nin: Array.from(assetMints) },
    }).lean();

    // Transform assets to NFT format
    const nftsFromAssets = assets.map((asset: any) => {
      // Prefer full URL from images array, then resolve from imageIpfsUrls
      const imageSource = asset.images?.[0] || asset.imageIpfsUrls?.[0];
      const image = resolveImageUrl(imageSource);

      // Get attributes from metaplexMetadata (comprehensive list)
      const attrs = asset.metaplexMetadata?.attributes || {};
      const attributes = [
        { trait_type: 'Brand', value: attrs.brand || '' },
        { trait_type: 'Model', value: asset.model || '' },
        { trait_type: 'Serial Number', value: asset.serial || '' },
        { trait_type: 'Material', value: attrs.material || '' },
        { trait_type: 'Condition', value: attrs.condition || asset.condition || '' },
        { trait_type: 'Production Year', value: attrs.productionYear || '' },
        { trait_type: 'Movement', value: attrs.movement || '' },
        { trait_type: 'Case Size', value: attrs.caseSize || '' },
        { trait_type: 'Dial Color', value: attrs.dialColor || '' },
        { trait_type: 'Water Resistance', value: attrs.waterResistance || '' },
        { trait_type: 'Box & Papers', value: attrs.boxPapers || '' },
        { trait_type: 'Country', value: attrs.country || '' },
        { trait_type: 'Limited Edition', value: attrs.limitedEdition || '' },
        { trait_type: 'Certificate', value: attrs.certificate || '' },
        { trait_type: 'Warranty', value: attrs.warrantyInfo || '' },
        { trait_type: 'Features', value: attrs.features || '' },
        {
          trait_type: 'Price USD',
          value: asset.priceUSD ? `$${asset.priceUSD.toLocaleString()}` : '',
        },
      ].filter((a) => a.value);

      return {
        _id: asset._id?.toString(),
        mintAddress: asset.nftMint || '',
        title: asset.model || 'Untitled',
        description: asset.description || '',
        image,
        priceSol: asset.priceUSD ? asset.priceUSD / 150 : 0,
        priceUSD: asset.priceUSD || 0,
        metadataUri: asset.metadataIpfsUrl || '',
        currentOwner: asset.nftOwnerWallet || wallet,
        marketStatus: asset.status || 'pending',
        nftId: asset.nftMint || asset._id?.toString() || '',
        fileCid: asset.imageIpfsUrls?.[0] || '',
        timestamp: asset.createdAt ? new Date(asset.createdAt).getTime() : Date.now(),
        seller: wallet,
        attributes,
        status: asset.status,
        luxScore: asset.luxScore,
        escrowPda: asset.escrowPda,
      };
    });

    // Transform NFTs from collection
    const nftsFromNFTCollection = nftsFromCollection.map((nft: any) => ({
      _id: nft._id?.toString(),
      mintAddress: nft.mintAddress || '',
      title: nft.title || nft.name || 'Untitled',
      description: nft.description || '',
      image: resolveImageUrl(nft.image),
      priceSol: nft.priceSol || 0,
      priceUSD: nft.priceUSD || 0,
      metadataUri: nft.metadataUri || '',
      currentOwner: nft.currentOwner || wallet,
      marketStatus: nft.marketStatus || 'pending',
      nftId: nft.mintAddress || nft._id?.toString() || '',
      fileCid: nft.fileCid || '',
      timestamp: nft.updatedAt ? new Date(nft.updatedAt).getTime() : Date.now(),
      seller: nft.vendorWallet || wallet,
      attributes: nft.attributes || [],
      status: nft.marketStatus,
    }));

    // Combine both sources
    const allNfts = [...nftsFromAssets, ...nftsFromNFTCollection];

    // Calculate stats (need separate query for burned count since they're filtered out)
    const burnedCount = onlyBurned
      ? allNfts.length
      : await Asset.countDocuments({
          deleted: { $ne: true },
          nftMint: { $exists: true, $ne: null },
          status: 'burned',
          $or: [{ nftOwnerWallet: wallet }, ...(vendorId ? [{ vendor: vendorId }] : [])],
        });

    const stats = {
      totalItems: allNfts.length,
      itemsListed: allNfts.filter((n) => n.status === 'listed').length,
      itemsPending: allNfts.filter((n) => n.status === 'pending').length,
      itemsInEscrow: allNfts.filter((n) => n.status === 'in_escrow').length,
      itemsBurned: burnedCount,
      totalSales: (vendor as any)?.totalSales || 0,
    };

    res.status(200).json({
      nfts: allNfts,
      stats,
      vendor: vendor ? { name: (vendor as any).name, username: (vendor as any).username } : null,
    });
  } catch (e) {
    console.error('❌ Error fetching vendor NFTs:', e);
    res.status(500).json({ error: 'Failed to fetch NFTs.' });
  }
}
