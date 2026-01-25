// src/components/admins/NFTPreviewCard.tsx
// Preview card using UnifiedNFTCard for consistency
import React from 'react';
import UnifiedNFTCard from '../common/UnifiedNFTCard';

interface NFTPreviewCardProps {
  fileCid?: string;
  imagePreview?: string;
  title: string;
  description: string;
  priceSol: number;
  brand?: string;
  onViewDetails?: () => void;
}

const NFTPreviewCard = ({
  fileCid,
  imagePreview,
  title,
  description,
  priceSol,
  brand,
  onViewDetails,
}: NFTPreviewCardProps) => {
  return (
    <UnifiedNFTCard
      title={title || 'Untitled'}
      image={imagePreview}
      imageCid={fileCid}
      price={priceSol}
      priceLabel="SOL"
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
