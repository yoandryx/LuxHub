import React from "react";
import styles from "../../styles/NFTCard.module.css";

interface NFTPreviewCardProps {
  fileCid?: string;             // IPFS CID
  imagePreview?: string;        // base64 image
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
  onViewDetails
}: NFTPreviewCardProps) => {
  const imageUrl = imagePreview
    ? imagePreview
    : fileCid
    ? `${process.env.NEXT_PUBLIC_GATEWAY_URL}${fileCid}`
    : "";

  return (
    <div className={styles.holderCard}>
      <div className={styles.holderContent}>
        {imageUrl ? (
          <img src={imageUrl} alt="Preview" className={styles.holderImage} />
        ) : (
          <div className={styles.skeletonCard} />
        )}

        <div className={styles.overlay}>
          <div className={styles.overlayTitle}>{title || "Untitled"}</div>
          <div className={styles.overlayRow}>
            <span>Description:</span>
            <span>{description || "—"}</span>
          </div>
          <div className={styles.overlayRow}>
            <span>Price:</span>
            <span>◎ {priceSol || 0} SOL</span>
          </div>
          <button className={styles.overlayButton} onClick={onViewDetails}>
            View Details
          </button>
        </div>
      </div>

      <div className={styles.badge}>
        <img src="/images/purpleLGG.png" alt="Pending" className={styles.badgeIcon} />
        Preview
      </div>

      <div className={styles.collectionTag}>{brand ? brand : "Your NFT"}</div>
    </div>
  );
};

export default NFTPreviewCard;
