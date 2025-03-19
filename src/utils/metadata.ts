// utils/metadata.ts

export interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string; // IPFS URL of image
  attributes?: { trait_type: string; value: string }[];
  seller_fee_basis_points?: number; // Royalties (default: 5%)
  properties?: {
    creators?: { address: string; share: number }[];
    files?: { uri: string; type: string }[];
  };
}

// Function to create metadata object before uploading
export const createMetadata = (
  name: string,
  description: string,
  imageCid: string,
  walletAddress: string
): NFTMetadata => {
  return {
    name,
    symbol: "MYNFT",
    description,
    image: `https://gateway.pinata.cloud/ipfs/${imageCid}`,
    seller_fee_basis_points: 500, // 5% royalties
    properties: {
      creators: [
        {
          address: walletAddress,
          share: 100,
        },
      ],
      files: [
        {
          uri: `https://gateway.pinata.cloud/ipfs/${imageCid}`,
          type: "image/png",
        },
      ],
    },
  };
};
