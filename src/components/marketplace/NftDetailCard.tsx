import React, { useEffect, useState, useRef } from "react";
import styles from "../../styles/NFTDetailCard.module.css";
import { FaTimes, FaCopy, FaArrowsAltH } from "react-icons/fa";
import { Metaplex } from "@metaplex-foundation/js";
import { Connection, PublicKey } from "@solana/web3.js";
import VanillaTilt from "vanilla-tilt";

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
  mintAddress,
  previewData,
  priceSol,
  owner,
  onClose,
  showContactButton = false,
}) => {
  const [metadata, setMetadata] = useState<NFTMetadata | null>(null);
  const [loading, setLoading] = useState<boolean>(!!metadataUri && !previewData);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);

  // 3D Tilt Effect with Gyroscope Support (works on phone!)
  useEffect(() => {
    if (cardRef.current) {
      VanillaTilt.init(cardRef.current, {
        max: 12,
        speed: 400,
        glare: false,
        "max-glare": 0.4,
        gyroscope: true,
        gyroscopeMinAngleX: -30,
        gyroscopeMaxAngleX: 30,
        gyroscopeMinAngleY: -30,
        gyroscopeMaxAngleY: 30,
        scale: 1.05,
        transition: true,
        easing: "cubic-bezier(.03,.98,.52,.99)",
      });
    }

    return () => {
      if (cardRef.current && (cardRef.current as any).vanillaTilt) {
        (cardRef.current as any).vanillaTilt.destroy();
      }
    };
  }, [metadata]);

  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  // Metadata fetching (your original logic fully preserved)
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        let uri = metadataUri;

        if (!uri && mintAddress) {
          const connection = new Connection(
            process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.devnet.solana.com"
          );
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
  }, [metadataUri, mintAddress, previewData, priceSol, owner]);

  // Handle previewData (your original initial state logic)
  useEffect(() => {
    if (previewData && !metadata) {
      setMetadata({
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
      });
      setLoading(false);
    }
  }, [previewData]);

  if (loading) return <p style={{ color: "#aaa" }}>Loading NFT details...</p>;
  if (!metadata) return <p> </p>;

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
      {/* 3D Flip Card */}
      <div
        className={`${styles.flipCard} ${isFlipped ? styles.flipped : ""}`}
        ref={cardRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsFlipped(!isFlipped);
        }}
      >
        <div className={styles.flipCardInner}>
          {/* FRONT SIDE - NFT Image */}
          <div className={styles.flipCardFront}>
            <h2>{metadata.name}</h2>
            <div className={styles.imageContainer}>
              <img src={metadata.image} alt={metadata.name} className={styles.cardImage} />
            </div>
            <div className={styles.flipHint}>
              Tap to view details<FaArrowsAltH />
            </div>
          </div>

          {/* BACK SIDE - All Details */}
          <div className={styles.flipCardBack}>
            <div className={styles.backContent}>
              <h2>{metadata.name}</h2>

              {/* {metadata.priceSol !== undefined && (
                <div className={styles.metaRow}>
                  <strong>Price:</strong> ◎ {metadata.priceSol}
                </div>
              )}

              {metadata.mintAddress && (
                <div className={styles.metaRow}>
                  <strong>Mint:</strong>
                  <span
                    className={`${styles.metaCode} ${copiedField === "mint" ? styles.copied : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy("mint", metadata.mintAddress ?? "");
                    }}
                  >
                    <FaCopy style={{ marginRight: "6px" }} />
                    {truncate(metadata.mintAddress)}
                  </span>
                </div>
              )}

              {metadata.owner && (
                <div className={styles.metaRow}>
                  <strong>Owner:</strong>
                  <span
                    className={`${styles.metaCode} ${copiedField === "owner" ? styles.copied : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy("owner", metadata.owner ?? "");
                    }}
                  >
                    <FaCopy style={{ marginRight: "6px" }} />
                    {truncate(metadata.owner)}
                  </span>
                </div>
              )} */}

              <div className={styles.metaDetails}>
                {metadata.priceSol !== undefined && (
                  <div className={styles.metaRow}>
                    <strong>Price:</strong> ◎ {metadata.priceSol}
                  </div>
                )}

                {metadata.mintAddress && (
                  <div className={styles.metaRow}>
                    <strong>Mint:</strong>
                    <span
                      className={`${styles.metaCode} ${copiedField === "mint" ? styles.copied : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy("mint", metadata.mintAddress ?? "");
                      }}
                    >
                      <FaCopy style={{ marginRight: "6px" }} />
                      {truncate(metadata.mintAddress)}
                    </span>
                  </div>
                )}

                {metadata.owner && (
                  <div className={styles.metaRow}>
                    <strong>Owner:</strong>
                    <span
                      className={`${styles.metaCode} ${copiedField === "owner" ? styles.copied : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy("owner", metadata.owner ?? "");
                      }}
                    >
                      <FaCopy style={{ marginRight: "6px" }} />
                      {truncate(metadata.owner)}
                    </span>
                  </div>
                )}
              </div>

              {showContactButton && (
                <button
                  className={styles.chatButton}
                  onClick={(e) => e.stopPropagation()}
                >
                  Contact Owner
                </button>
              )}

              {metadata.marketStatus && (
                <div className={styles.metaRow}>
                  <strong>Market Status:</strong> {metadata.marketStatus}
                </div>
              )}

              {/* <div className={styles.attributesSection}>
                <div className={styles.cardTitle}><h2>Attributes</h2></div>
        
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
              </div> */}

              <div className={styles.attributesSection}>
                <h2 className={styles.attributesTitle}>Attributes</h2>
                <div className={styles.attributesGrid}>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Brand</div>
                    <div className={styles.attrValue}>{getAttr("Brand")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Model</div>
                    <div className={styles.attrValue}>{getAttr("Model")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Serial Number</div>
                    <div className={styles.attrValue}>{getAttr("Serial Number")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Material</div>
                    <div className={styles.attrValue}>{getAttr("Material")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Production Year</div>
                    <div className={styles.attrValue}>{getAttr("Production Year")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Limited Edition</div>
                    <div className={styles.attrValue}>{getAttr("Limited Edition")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Certificate</div>
                    <div className={styles.attrValue}>{getAttr("Certificate")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Warranty Info</div>
                    <div className={styles.attrValue}>{getAttr("Warranty Info")}</div>
                  </div>
                  <div className={styles.attrCard} title={getAttr("Provenance")}>
                    <div className={styles.attrLabel}>Provenance</div>
                    <div className={styles.attrValue}>{getAttr("Provenance", true)}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Movement</div>
                    <div className={styles.attrValue}>{getAttr("Movement")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Case Size</div>
                    <div className={styles.attrValue}>{getAttr("Case Size")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Water Resistance</div>
                    <div className={styles.attrValue}>{getAttr("Water Resistance")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Dial Color</div>
                    <div className={styles.attrValue}>{getAttr("Dial Color")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Country</div>
                    <div className={styles.attrValue}>{getAttr("Country")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Release Date</div>
                    <div className={styles.attrValue}>{getAttr("Release Date")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Box & Papers</div>
                    <div className={styles.attrValue}>{getAttr("Box & Papers")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Condition</div>
                    <div className={styles.attrValue}>{getAttr("Condition")}</div>
                  </div>
                  <div className={styles.attrCard}>
                    <div className={styles.attrLabel}>Features</div>
                    <div className={styles.attrValue}>{getAttr("Features")}</div>
                  </div>
                </div>
              </div>

              <div className={styles.flipHintBack}>
                Tap to flip back <FaArrowsAltH />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Close Button (outside card) */}
      <button className={styles.closeButton} onClick={onClose}>
        <FaTimes />
      </button>
    </div>
  );
};