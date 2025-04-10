// src/utils/metadata.ts
import { Connection, PublicKey } from "@solana/web3.js";
import { Metaplex, walletAdapterIdentity, Nft } from "@metaplex-foundation/js";
import type { WalletAdapter } from "@solana/wallet-adapter-base";
import { uploadToPinata } from "./pinata"; // adjust path if needed

// Updated NFTMetadata interface now includes the "uri" field.
export interface NFTMetadata {
  name: string;
  uri: string;
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
  };
}

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
  priceSol?: number // sale price in SOL
): NFTMetadata => {
  const gateway =
    process.env.NEXT_PUBLIC_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/";
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
    { trait_type: "Market Status", value: marketStatus || "inactive" }
  ];

  // Add the price attribute if provided.
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
    uri: "", // initially empty – you will fill this after uploading metadata to Pinata
    symbol: "LUXHUB",
    description,
    image: `${gateway}${imageCid}`,
    external_url: "",
    seller_fee_basis_points: 300,
    attributes: attributes.filter(attr => attr.value !== undefined) as { trait_type: string; value: string }[],
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

export const updateNftMetadata = async (
  wallet: WalletAdapter,
  mintAddress: string,
  updatedFields: Partial<Pick<NFTMetadata, "name" | "uri" | "seller_fee_basis_points" | "properties">>
): Promise<any> => {
  const connection = new Connection(
    process.env.NEXT_PUBLIC_ENDPOINT || "https://api.devnet.solana.com"
  );
  const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));

  // Fetch the current NFT.
  const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mintAddress) });
  // Build update arguments. Note that we use the key "uri" here – this is the on‑chain field.
  const updateArgs = {
    name: updatedFields.name || nft.name,
    uri: updatedFields.uri || nft.uri,
    sellerFeeBasisPoints: updatedFields.seller_fee_basis_points || nft.sellerFeeBasisPoints,
    creators:
      updatedFields.properties?.creators?.map((creator) => ({
        address: new PublicKey(creator.address),
        share: creator.share,
      })) || nft.creators,
  };

  const updatedNft = await metaplex.nfts().update({
    nftOrSft: nft,
    ...updateArgs,
  });
  return updatedNft;
};

export const fetchMetadataFromMint = async (mintAddress: string): Promise<any> => {
  try {
    const connection = new Connection(
      process.env.NEXT_PUBLIC_ENDPOINT || "https://api.devnet.solana.com"
    );
    const metaplex = Metaplex.make(connection);
    const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mintAddress) });
    const res = await fetch(nft.uri);
    if (!res.ok) throw new Error("Failed to fetch NFT metadata");
    const metadata = await res.json();
    return metadata;
  } catch (error) {
    console.error("Error fetching metadata:", error);
    return null;
  }
};

export const updateMarketStatus = async (
  wallet: WalletAdapter,
  mintAddress: string,
  newStatus: string
): Promise<any> => {
  // Fetch current metadata JSON using on-chain pointer.
  const currentMetadata = await fetchMetadataFromMint(mintAddress);
  if (!currentMetadata) throw new Error("Metadata not found");

  let attributes = currentMetadata.attributes || [];
  const index = attributes.findIndex((attr: any) => attr.trait_type === "Market Status");
  if (index !== -1) {
    attributes[index].value = newStatus;
  } else {
    attributes.push({ trait_type: "Market Status", value: newStatus });
  }
  // Add an updated timestamp to force Pinata to generate a new CID.
  currentMetadata.updatedAt = new Date().toISOString();
  const newUri = await uploadToPinata(currentMetadata, "Updated NFT Metadata");
  console.log("New metadata URI:", newUri);
  const updatedNft = await updateNftMetadata(wallet, mintAddress, { uri: newUri });
  return updatedNft;
};
