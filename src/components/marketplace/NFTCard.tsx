// src/components/marketplace/NFTCard.tsx
// Wrapper for UnifiedNFTCard to maintain backwards compatibility
import React, { memo, useMemo } from 'react';
import UnifiedNFTCard, { NFTStatus } from '../common/UnifiedNFTCard';
import { resolveAssetImage } from '../../utils/imageUtils';

interface NFT {
  nftId: string;
  fileCid?: string;
  salePrice?: number;
  timestamp: number;
  seller: string;
  buyer?: string;
  marketStatus: string;
  image?: string;
  imageUrl?: string;
  imageIpfsUrls?: string[];
  images?: string[];
  title?: string;
  attributes?: { trait_type: string; value: string }[];
}

interface NFTCardProps {
  nft: NFT;
  onClick: () => void;
}

// Map legacy status to new status type
const mapStatus = (status: string): NFTStatus => {
  const statusMap: Record<string, NFTStatus> = {
    pending: 'pending',
    reviewed: 'verified',
    listed: 'listed',
    in_escrow: 'escrow',
    pooled: 'pooled',
    sold: 'sold',
    burned: 'burned',
    invalid: 'error',
  };
  return statusMap[status] || 'verified';
};

const NFTCard = memo(({ nft, onClick }: NFTCardProps) => {
  // Resolve image using the comprehensive asset image resolver
  const resolvedImage = useMemo(
    () =>
      resolveAssetImage({
        imageUrl: nft.imageUrl,
        images: nft.images,
        imageIpfsUrls: nft.imageIpfsUrls,
        image: nft.image,
        fileCid: nft.fileCid,
      }),
    [nft.imageUrl, nft.images, nft.imageIpfsUrls, nft.image, nft.fileCid]
  );

  // Memoized price calculation
  const price = useMemo(
    () =>
      nft.salePrice ??
      parseFloat(nft.attributes?.find((attr) => attr.trait_type === 'Price')?.value ?? '0') ??
      (nft as any).priceSol ??
      0,
    [nft.salePrice, nft.attributes]
  );

  // Memoized owner calculation
  const owner = useMemo(
    () =>
      nft.buyer ??
      nft.attributes?.find((attr) => attr.trait_type === 'Current Owner')?.value ??
      (nft as any).currentOwner ??
      nft.seller ??
      undefined,
    [nft.buyer, nft.attributes, nft.seller]
  );

  // Get brand from attributes
  const brand = nft.attributes?.find((attr) => attr.trait_type === 'Brand')?.value;

  // Get USD price from attributes (fixed watch price)
  const priceUSD = useMemo(() => {
    const usdAttr = nft.attributes?.find(
      (attr) => attr.trait_type === 'Price USD' || attr.trait_type === 'Estimated Value'
    )?.value;
    return usdAttr ? parseFloat(usdAttr.replace(/[^0-9.]/g, '')) : (nft as any).priceUSD;
  }, [nft.attributes]);

  return (
    <UnifiedNFTCard
      title={nft.title || 'Untitled NFT'}
      image={resolvedImage}
      price={price}
      priceLabel="SOL"
      priceUSD={priceUSD}
      owner={owner}
      brand={brand}
      status={mapStatus(nft.marketStatus)}
      isVerified={nft.marketStatus !== 'invalid'}
      onViewDetails={onClick}
      showOverlay={true}
      showBadge={true}
      showPrice={true}
      showOwner={true}
    />
  );
});

NFTCard.displayName = 'NFTCard';

export default NFTCard;
