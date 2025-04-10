// src/utils/metadata.ts
import { Connection, PublicKey } from "@solana/web3.js";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import type { WalletAdapter } from "@solana/wallet-adapter-base";
import { uploadToPinata } from "./pinata"; // Adjust path if needed

export interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url?: string;
  attributes?: { trait_type: string; value: string }[];
  seller_fee_basis_points: number;
  properties: {
    creators: { address: string; share: number }[];
    files: { uri: string; type: string }[];
    category?: string;
  };
  // Additional fields used by your app
  updatedAt?: string;
  // If you want to store 'uri' field, you can add it explicitly
}

// Create metadata JSON object
export const createMetadata = (
  name: string,
  description: string,
  imageCid: string,
  walletAddress: string,
  brand: string,
  model: string,
  serialNumber: string,
  material: string,
  productionYear: string,
  limitedEdition: string,
  certificate: string,
  warrantyInfo: string,
  provenance: string,
  movement?: string,
  caseSize?: string,
  waterResistance?: string,
  dialColor?: string,
  country?: string,
  releaseDate?: string,
  currentOwner?: string,
  marketStatus?: string,
  priceSol?: number
): NFTMetadata => {
  const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/";
  const attributes = [
    { trait_type: "Brand", value: brand },
    { trait_type: "Model", value: model },
    { trait_type: "Serial Number", value: serialNumber },
    { trait_type: "Material", value: material },
    { trait_type: "Production Year", value: productionYear },
    { trait_type: "Limited Edition", value: limitedEdition },
    { trait_type: "Certificate", value: certificate },
    { trait_type: "Warranty Info", value: warrantyInfo },
    { trait_type: "Provenance", value: provenance },
    { trait_type: "Market Status", value: marketStatus || "inactive" },
  ];
  if (priceSol !== undefined) {
    attributes.push({ trait_type: "Price", value: priceSol.toString() });
  }
  if (movement) attributes.push({ trait_type: "Movement", value: movement });
  if (caseSize) attributes.push({ trait_type: "Case Size", value: caseSize });
  if (waterResistance) attributes.push({ trait_type: "Water Resistance", value: waterResistance });
  if (dialColor) attributes.push({ trait_type: "Dial Color", value: dialColor });
  if (country) attributes.push({ trait_type: "Country", value: country });
  if (releaseDate) attributes.push({ trait_type: "Release Date", value: releaseDate });
  if (currentOwner) {
    attributes.push({ trait_type: "Current Owner", value: currentOwner });
  }

  return {
    name,
    symbol: "LUXHUB",
    description,
    image: `${gateway}${imageCid}`,
    external_url: "",
    seller_fee_basis_points: 300,
    attributes,
    properties: {
      creators: [
        {
          address: walletAddress,
          share: 100,
        },
      ],
      files: [
        {
          uri: `${gateway}${imageCid}`,
          type: "image/png",
        },
      ],
      category: "Timepieces",
    },
  };
};

// On-chain update
export const updateNftMetadata = async (
  wallet: WalletAdapter,
  mintAddress: string,
  updatedFields: Partial<{
    name: string;
    uri: string; // this is the new field we pass in
    seller_fee_basis_points: number;
    properties: NFTMetadata["properties"];
  }>
) => {
  const connection = new Connection(
    process.env.NEXT_PUBLIC_ENDPOINT || "https://api.devnet.solana.com"
  );
  const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));

  // Fetch NFT
  const nft = await metaplex.nfts().findByMint({
    mintAddress: new PublicKey(mintAddress),
  });

  // Build updates
  const updateArgs = {
    name: updatedFields.name || nft.name,
    uri: updatedFields.uri ? updatedFields.uri : nft.uri,
    sellerFeeBasisPoints:
      updatedFields.seller_fee_basis_points ?? nft.sellerFeeBasisPoints,
    creators:
      updatedFields.properties?.creators?.map((c) => ({
        address: new PublicKey(c.address),
        share: c.share,
      })) || nft.creators,
  };

  // On-chain update
  const updatedNft = await metaplex.nfts().update({
    nftOrSft: nft,
    ...updateArgs,
  });
  return updatedNft;
};
