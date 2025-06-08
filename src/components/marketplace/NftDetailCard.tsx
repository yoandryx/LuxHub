import React, { useEffect, useState } from "react";
import styles from "../../styles/NFTDetailCard.module.css";
import { FaTimes, FaCopy } from "react-icons/fa";
import { Metaplex } from "@metaplex-foundation/js";
import { Connection, PublicKey } from "@solana/web3.js";

export interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url?: string;
  attributes?: { trait_type: string; value: string }[];
  seller_fee_basis_points: number;
  animation_url?: string;
  properties: {
    creators: { address: string; share: number }[];
    files: { uri: string; type: string }[];
    category?: string;
    background_color?: string;
    collection?: {
      name: string;
      family: string;
    };
  };
  mintAddress?: string;
  owner?: string;
  marketStatus?: string;
  priceSol?: number;
}

interface NftDetailCardProps {
  metadataUri?: string;
  mintAddress?: string;
  previewData?: {
    title: string;
    image: string;
    description: string;
    priceSol: number;
    attributes: { trait_type: string; value: string }[];
  };
  priceSol?: number;
  owner?: string;
  onClose: () => void;
  showContactButton?: boolean;
}

export const NftDetailCard: React.FC<NftDetailCardProps> = ({
  metadataUri,
  previewData,
  onClose,
  showContactButton = false,
  priceSol,
  owner,
  mintAddress,
}) => {
  const [metadata, setMetadata] = useState<NFTMetadata | null>(() => {
    if (previewData) {
      return {
        name: previewData.title,
        symbol: "",
        description: previewData.description,
        image: previewData.image,
        seller_fee_basis_points: 500,
        attributes: previewData.attributes,
        priceSol: previewData.priceSol,
        properties: {
          creators: [],
          files: [],
        },
      };
    }
    return null;
  });

  const [loading, setLoading] = useState<boolean>(!!metadataUri && !previewData);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        let uri = metadataUri;
  
        if (!uri && mintAddress) {
          const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.devnet.solana.com");
          const metaplex = Metaplex.make(connection);
          const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mintAddress) });
          uri = nft.uri;
        }
  
        if (!uri) return;
  
        const res = await fetch(uri);
        const json = await res.json();
  
        setMetadata((prev) => ({
          ...json,
          priceSol: parseFloat(
            json.priceSol ??
            json.attributes?.find((a: any) => a.trait_type === "Price")?.value ??
            prev?.priceSol ??
            priceSol?.toString() ??
            "0"
          ),
          owner:
            json.owner ??
            json.attributes?.find((a: any) => a.trait_type === "Current Owner")?.value ??
            prev?.owner ??
            owner,
          mintAddress: mintAddress ?? prev?.mintAddress,
        }));
      } catch (err) {
        console.error("Failed to fetch metadata:", err);
      } finally {
        setLoading(false);
      }
    };
  
    if (!previewData) {
      fetchMetadata();
    }
  }, [metadataUri, mintAddress, previewData]);
  

  if (loading) return <p style={{ color: "#aaa" }}>Loading NFT details...</p>;
  if (!metadata) return <p style={{ color: "#f66" }}>Unable to load NFT metadata.</p>;

  const truncate = (value: string, length: number = 10) => {
    if (!value || typeof value !== "string") return "~";
    return value.length > length ? `${value.slice(0, 4)}...${value.slice(-4)}` : value;
  };

  const getAttr = (type: string, shorten: boolean = false) => {
    const value = metadata.attributes?.find((a) => a.trait_type === type)?.value || "~";
    return shorten ? truncate(value.toString()) : value;
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalWrapper} onClick={(e) => e.stopPropagation()}>

      <button className={styles.closeButton} onClick={onClose}><FaTimes className={styles.icon} /></button>
      

        {/* Left image */}
        <div className={styles.modalLeft}>

          <h2 className={styles.modalTitle}>{metadata.name}</h2>

          <div className={styles.imageCard}>
            <img src={metadata.image} alt={metadata.name} className={styles.modalImage} />
          </div>

        </div>

        {/* Right details */}
        <div className={styles.modalRight}>

          {metadata.mintAddress && (
            <div className={styles.metaRow}>
              <strong>Mint:</strong>
              <span
                className={`${styles.metaCode} ${copiedField === "mint" ? styles.copied : ""}`}
                onClick={() => handleCopy("mint", metadata.mintAddress ?? "")}
                data-tooltip={copiedField === "mint" ? "Copied!" : "Click to copy"}
              >
                <FaCopy style={{ marginRight: "6px" }} />
                {truncate(metadata.mintAddress)}
              </span>
            </div>
          )}

          {metadata.owner && (
            <div className={styles.metaRow}>
              <strong>Current Owner:</strong>
              <span
                className={`${styles.metaCode} ${copiedField === "owner" ? styles.copied : ""}`}
                onClick={() => handleCopy("owner", metadata.owner ?? "")}
                data-tooltip={copiedField === "owner" ? "Copied!" : "Click to copy"}
              >
                <FaCopy style={{ marginRight: "6px" }} />
                {truncate(metadata.owner)}
              </span>
            </div>
          )}

          {metadata.priceSol !== undefined && (
            <div className={styles.metaRow}>
              <strong>Price:</strong>
              <span>◎ {metadata.priceSol}</span>
            </div>
          )}

          {showContactButton && (
            <button className={styles.chatButton}>Contact Owner</button>
          )}

          {metadata.marketStatus && (
            <div className={styles.metaRow}>
              <strong>Market Status:</strong>
              <span>{metadata.marketStatus}</span>
            </div>
          )}

          {/* Attributes */}
          <div className={styles.attributesSection}>
            <h4>Attributes</h4>
            <ul className={styles.attributeList}>
              <li><strong>Brand:</strong> {getAttr("Brand")}</li>
              <li><strong>Model:</strong> {getAttr("Model")}</li>
              <li><strong>Serial Number:</strong> {getAttr("Serial Number")}</li>
              <li><strong>Material:</strong> {getAttr("Material")}</li>
              <li><strong>Production Year:</strong> {getAttr("Production Year")}</li>
              <li><strong>Limited Edition:</strong> {getAttr("Limited Edition")}</li>
              <li><strong>Certificate:</strong> {getAttr("Certificate")}</li>
              <li><strong>Warranty Info:</strong> {getAttr("Warranty Info")}</li>
              <li title={getAttr("Provenance")}><strong>Provenance:</strong> {getAttr("Provenance", true)}</li>
              <li><strong>Movement:</strong> {getAttr("Movement")}</li>
              <li><strong>Case Size:</strong> {getAttr("Case Size")}</li>
              <li><strong>Water Resistance:</strong> {getAttr("Water Resistance")}</li>
              <li><strong>Dial Color:</strong> {getAttr("Dial Color")}</li>
              <li><strong>Country:</strong> {getAttr("Country")}</li>
              <li><strong>Release Date:</strong> {getAttr("Release Date")}</li>
              <li><strong>Box & Papers:</strong> {getAttr("Box & Papers")}</li>
              <li><strong>Condition:</strong> {getAttr("Condition")}</li>
              <li><strong>Features:</strong> {getAttr("Features")}</li>
            </ul>
          </div>
          
        </div>
      </div>
    </div>
  );
};
