import { Connection, PublicKey } from "@solana/web3.js";
import { Metaplex, walletAdapterIdentity, Nft } from "@metaplex-foundation/js";
import type { WalletAdapter } from "@solana/wallet-adapter-base";

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
  currentOwner?: string // NEW: optional current owner field
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
