import { Connection, PublicKey } from "@solana/web3.js";
import { Metaplex, walletAdapterIdentity, Nft } from "@metaplex-foundation/js";
import type { WalletAdapter } from "@solana/wallet-adapter-base";
import { uploadToPinata } from "./pinata";  // Adjust the path as needed

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
  marketStatus?: string
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
    { trait_type: "Market Status", value: marketStatus }
  ];

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

// Updates NFT metadata on-chain using the Metaplex JS SDK update method.
// In a production system you might rebuild the entire metadata JSON, re-upload it to IPFS (e.g., via Pinata),
// and update the on-chain URI. This update works for any NFT whose update authority is still LuxHub.
export const updateNftMetadata = async (
  wallet: WalletAdapter,
  mintAddress: string,
  updatedFields: Partial<Pick<NFTMetadata, "name" | "image" | "seller_fee_basis_points" | "properties">>
): Promise<any> => {
  const connection = new Connection(
    process.env.NEXT_PUBLIC_ENDPOINT || "https://api.devnet.solana.com"
  );
  const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));

  // Fetch the current NFT data using the mint key.
  const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mintAddress) });

  // Build update arguments with allowed fields.
  const updateArgs = {
    name: updatedFields.name || nft.name,
    uri: updatedFields.image ? updatedFields.image : nft.uri,
    sellerFeeBasisPoints: updatedFields.seller_fee_basis_points || nft.sellerFeeBasisPoints,
    creators: updatedFields.properties?.creators?.map((creator) => ({
      address: new PublicKey(creator.address),
      share: creator.share,
    })) || nft.creators,
  };

  // Call update using the mint key.
  const updatedNft = await metaplex.nfts().update({
    nftOrSft: nft,
    ...updateArgs,
  });
  return updatedNft;
};

// ------------------------------------------------------------------
// New Helper Functions to Update Market Status in NFT Metadata
// ------------------------------------------------------------------

// Fetch the current metadata JSON from the NFT's on-chain URI.
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

// Update the "Market Status" attribute in the NFT metadata.
// This function fetches the current metadata, updates (or adds) the "Market Status" attribute,
// re-uploads the updated JSON to IPFS, and then updates the on-chain metadata URI.
export const updateMarketStatus = async (
  wallet: WalletAdapter,
  mintAddress: string,
  newStatus: string
): Promise<any> => {
  // Fetch current metadata JSON from IPFS.
  const currentMetadata = await fetchMetadataFromMint(mintAddress);
  if (!currentMetadata) throw new Error("Metadata not found");

  // Update or add the "Market Status" attribute.
  let attributes = currentMetadata.attributes || [];
  const index = attributes.findIndex((attr: any) => attr.trait_type === "Market Status");
  if (index !== -1) {
    attributes[index].value = newStatus;
  } else {
    attributes.push({ trait_type: "Market Status", value: newStatus });
  }

  // Create the updated metadata object.
  const updatedMetadata = {
    ...currentMetadata,
    attributes,
  };

  // Re-upload the updated metadata to IPFS (using your uploadToPinata function).
  const newUri = await uploadToPinata(updatedMetadata, "Updated NFT Metadata");
  console.log("New metadata URI:", newUri);

  // Update the NFT metadata on-chain via Metaplex.
  // Here we pass the new URI in the 'image' field (adjust updateNftMetadata if needed).
  const updatedNft = await updateNftMetadata(wallet, mintAddress, { image: newUri });
  return updatedNft;
};
