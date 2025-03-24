// components/NftDetailCard.tsx
import React, { useEffect, useState } from "react";

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
}

interface NftDetailCardProps {
  metadataUri: string;
}

export const NftDetailCard: React.FC<NftDetailCardProps> = ({ metadataUri }) => {
  const [metadata, setMetadata] = useState<NFTMetadata | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const res = await fetch(metadataUri);
        const json = await res.json();
        setMetadata(json);
      } catch (error) {
        console.error("Error fetching NFT metadata:", error);
      } finally {
        setLoading(false);
      }
    };

    if (metadataUri) {
      fetchMetadata();
    }
  }, [metadataUri]);

  if (loading) return <p>Loading NFT details...</p>;
  if (!metadata) return <p>Unable to load NFT metadata.</p>;

  return (
    <div style={{ padding: "1rem", background: "#222", borderRadius: "8px", color: "#eee" }}>
      <img src={metadata.image} alt={metadata.name} style={{ width: "100%", borderRadius: "8px" }} />
      <h2>{metadata.name}</h2>
      <p>{metadata.description}</p>
      {metadata.attributes && metadata.attributes.length > 0 && (
        <div>
          <h3>Attributes</h3>
          <ul>
            {metadata.attributes.map((attr, index) => (
              <li key={index}>
                <strong>{attr.trait_type}: </strong>{attr.value}
              </li>
            ))}
          </ul>
        </div>
      )}
      {metadata.properties?.collection && (
        <div>
          <h4>Collection</h4>
          <p>{metadata.properties.collection.name} - {metadata.properties.collection.family}</p>
        </div>
      )}
      {metadata.external_url && (
        <div>
          <a href={metadata.external_url} target="_blank" rel="noopener noreferrer">
            More Info
          </a>
        </div>
      )}
    </div>
  );
};
