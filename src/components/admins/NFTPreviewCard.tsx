// src/components/admins/NFTPreviewCard.tsx
// Preview card using UnifiedNFTCard for consistency
import React from 'react';
import UnifiedNFTCard from '../common/UnifiedNFTCard';

interface NFTPreviewCardProps {
  fileCid?: string;
  imagePreview?: string;
  title: string;
  description: string;
  priceSol?: number; // Legacy support
  priceUSD?: number; // USD as source of truth
  estimatedSol?: number; // Estimated SOL conversion for display
  brand?: string;
  onViewDetails?: () => void;
}

const NFTPreviewCard = ({
  fileCid,
  imagePreview,
  title,
  description,
  priceSol,
  priceUSD,
  estimatedSol,
  brand,
  onViewDetails,
}: NFTPreviewCardProps) => {
  // Determine which price to show as primary
  const hasUsdPrice = priceUSD !== undefined && priceUSD > 0;
  const primaryPrice = hasUsdPrice ? priceUSD : priceSol || 0;
  const priceLabel = hasUsdPrice ? 'USD' : 'SOL';

  return (
    <UnifiedNFTCard
      title={title || 'Untitled'}
      image={imagePreview}
      imageCid={fileCid}
      price={primaryPrice}
      priceLabel={priceLabel}
      priceUSD={hasUsdPrice ? undefined : priceUSD} // Show USD in secondary if primary is SOL
      brand={brand}
      description={description}
      status="preview"
      isVerified={false}
      showBadge={true}
      showPrice={true}
      showOwner={false}
      showOverlay={true}
      onViewDetails={onViewDetails}
    />
  );
};

export default NFTPreviewCard;
