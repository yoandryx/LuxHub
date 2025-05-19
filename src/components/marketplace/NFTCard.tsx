
import React from "react";
import styles from "../../styles/NFTCard.module.css";

interface NFT {
  nftId: string;
  fileCid: string;
  salePrice?: number;
  timestamp: number;
  seller: string;
  buyer?: string;
  marketStatus: string;
  image?: string;
  title?: string;
  attributes?: { trait_type: string; value: string }[];
}

interface NFTCardProps {
  nft: NFT;
  onClick: () => void;
}

const NFTCard = ({ nft, onClick }: NFTCardProps) => {
  // Fallback logic
  // const priceAttr = nft.attributes?.find(attr => attr.trait_type === "Price")?.value;
  // const ownerAttr = nft.attributes?.find(attr => attr.trait_type === "Current Owner")?.value;

  // const price = nft.salePrice ?? parseFloat(priceAttr ?? "0");
  // const owner =  nft.buyer ?? ownerAttr ?? nft.seller ?? "N/A";

  const price = nft.salePrice ?? parseFloat(nft.attributes?.find(attr => attr.trait_type === "Price")?.value ?? "0") ?? (nft as any).priceSol ?? 0;

  const owner = nft.buyer ?? nft.attributes?.find(attr => attr.trait_type === "Current Owner")?.value ?? (nft as any).currentOwner ?? nft.seller ?? "N/A";


  return (
    <div className={styles.holderCard}>
      <div className={styles.holderContent}>
        {/* Image */}
        <img src={nft.image} alt={nft.title} className={styles.holderImage} />

        {/* Overlay */}
        <div className={styles.overlay}>
          <div className={styles.overlayTitle}>{nft.title}</div>
          <div className={styles.overlayRow}>
            <span>Owner:</span>
            <span>{owner !== "N/A" ? `${owner.slice(0, 4)}...${owner.slice(-4)}` : "N/A"}</span>
          </div>
          <div className={styles.overlayRow}>
            <span>Price:</span>
            <span>{price.toFixed(2)} SOL</span>
          </div>
          <button className={styles.overlayButton} onClick={onClick}>
            View Details
          </button>
        </div>
      </div>

      {/* Badges */}
      <div className={styles.badge}>
        <img src="/images/purpleLGG.png" alt="Verified" className={styles.badgeIcon} />
        {nft.marketStatus === "invalid" ? "Unverified" : "Verified"}
      </div>

      <div className={styles.collectionTag}>{nft.title}</div>
    </div>
  );
};

export default NFTCard;
