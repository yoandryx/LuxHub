// /pages/api/nft/[mintAddress].ts
// Fetch NFT metadata via Helius DAS API (single call)
// Replaces: Metaplex findByMint() → fetch IPFS URI → parse JSON (3 calls → 1)
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAsset, getAssetImage } from '../../../lib/services/dasApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { mintAddress } = req.query;

  if (!mintAddress || typeof mintAddress !== 'string') {
    return res.status(400).json({ error: 'Invalid mint address' });
  }

  try {
    // Single DAS call returns everything: metadata, image, attributes, ownership
    const asset = await getAsset(mintAddress);

    const metadata = asset.content?.metadata || {};
    const image = getAssetImage(asset);

    // Return in the same format as the old Metaplex + IPFS response
    // so existing frontend code doesn't break
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      name: metadata.name || '',
      symbol: metadata.symbol || '',
      description: metadata.description || '',
      image,
      external_url: asset.content?.links?.external_url || '',
      animation_url: asset.content?.links?.animation_url || '',
      attributes: metadata.attributes || [],
      // Extended data from DAS (not in old Metaplex response)
      properties: {
        files: asset.content?.files || [],
      },
      // On-chain data
      mint: asset.id,
      owner: asset.ownership?.owner || '',
      frozen: asset.ownership?.frozen || false,
      burnt: asset.burnt || false,
      compressed: asset.compression?.compressed || false,
      collection: asset.grouping?.find((g) => g.group_key === 'collection')?.group_value || null,
      royalty: asset.royalty
        ? {
            basisPoints: asset.royalty.basis_points,
            percent: asset.royalty.percent,
            primarySaleHappened: asset.royalty.primary_sale_happened,
          }
        : null,
      creators: asset.creators || [],
    });
  } catch (error: any) {
    console.error('Error fetching NFT metadata via DAS:', error);

    // Fallback to legacy Metaplex approach if DAS fails
    try {
      const { Metaplex } = await import('@metaplex-foundation/js');
      const { Connection, PublicKey } = await import('@solana/web3.js');

      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'
      );
      const metaplex = Metaplex.make(connection);
      const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mintAddress) });

      const metadataRes = await fetch(nft.uri);
      if (!metadataRes.ok) throw new Error('Failed to fetch metadata from URI');
      const metadataJson = await metadataRes.json();

      return res.status(200).json(metadataJson);
    } catch (fallbackError) {
      console.error('Fallback Metaplex fetch also failed:', fallbackError);
      return res.status(500).json({ error: 'Failed to fetch metadata' });
    }
  }
}
