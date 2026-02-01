// src/utils/metadata.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex, walletAdapterIdentity } from '@metaplex-foundation/js';
import type { WalletAdapter } from '@solana/wallet-adapter-base';

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
  // LuxHub Verification Fields
  collection?: {
    name: string;
    family: string;
  };
  luxhub_verification?: {
    verified: boolean;
    vault_address: string;
    minted_by: string;
    minted_at: string;
    verification_url: string;
  };
  updatedAt?: string;
}

// Verification options for LuxHub authenticated mints
export interface LuxHubVerificationOptions {
  isVaultMint?: boolean; // Minted through official vault
  vaultAddress?: string; // LuxHub vault/multisig address
  mintedBy?: string; // Admin wallet who initiated mint
  collectionName?: string; // Collection name (e.g., "LuxHub Verified Timepieces")
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
  priceSol?: number,
  boxPapers?: string, // Yes/No
  condition?: string, // New, Excellent, etc.
  serviceHistory?: string, // e.g., "Serviced 2024"
  features?: string[], // e.g., ["Chronograph", "GMT"]
  imageUri?: string, // Full URL (Irys or IPFS) - if provided, overrides imageCid
  verification?: LuxHubVerificationOptions // LuxHub verification data
): NFTMetadata => {
  const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';
  // Use provided imageUri if available, otherwise build from CID
  const finalImageUrl = imageUri || `${gateway}${imageCid}`;
  const attributes: { trait_type: string; value: string }[] = [
    { trait_type: 'Brand', value: brand },
    { trait_type: 'Model', value: model },
    { trait_type: 'Serial Number', value: serialNumber },
    { trait_type: 'Material', value: material },
    { trait_type: 'Production Year', value: productionYear },
    { trait_type: 'Limited Edition', value: limitedEdition },
    { trait_type: 'Certificate', value: certificate },
    { trait_type: 'Warranty Info', value: warrantyInfo },
    { trait_type: 'Provenance', value: provenance },
    { trait_type: 'Market Status', value: marketStatus || 'inactive' },
  ];

  // Conditionally include optional fields
  if (priceSol !== undefined) attributes.push({ trait_type: 'Price', value: priceSol.toString() });
  if (movement) attributes.push({ trait_type: 'Movement', value: movement });
  if (caseSize) attributes.push({ trait_type: 'Case Size', value: caseSize });
  if (waterResistance) attributes.push({ trait_type: 'Water Resistance', value: waterResistance });
  if (dialColor) attributes.push({ trait_type: 'Dial Color', value: dialColor });
  if (country) attributes.push({ trait_type: 'Country', value: country });
  if (releaseDate) attributes.push({ trait_type: 'Release Date', value: releaseDate });
  if (currentOwner) attributes.push({ trait_type: 'Current Owner', value: currentOwner });
  if (boxPapers) attributes.push({ trait_type: 'Box & Papers', value: boxPapers });
  if (condition) attributes.push({ trait_type: 'Condition', value: condition });
  if (serviceHistory) attributes.push({ trait_type: 'Service History', value: serviceHistory });
  if (features && features.length > 0) {
    features.forEach((feat) => attributes.push({ trait_type: 'Feature', value: feat }));
  }

  // Build base metadata
  const metadata: NFTMetadata = {
    name,
    symbol: 'LUXHUB',
    description,
    image: finalImageUrl,
    external_url: 'https://luxhub.io',
    seller_fee_basis_points: 500,
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
          uri: finalImageUrl,
          type: 'image/png',
        },
      ],
      category: 'Timepieces',
    },
    updatedAt: new Date().toISOString(),
  };

  // Add LuxHub verification data if this is an official vault mint
  if (verification?.isVaultMint) {
    // Add verification attributes (visible in explorers/wallets)
    attributes.push({ trait_type: 'LuxHub Verified', value: 'Yes' });
    attributes.push({ trait_type: 'Vault Mint', value: 'Official' });

    if (verification.vaultAddress) {
      attributes.push({ trait_type: 'Vault Address', value: verification.vaultAddress });
    }

    // Add collection info
    metadata.collection = {
      name: verification.collectionName || 'LuxHub Verified Timepieces',
      family: 'LuxHub',
    };

    // Add structured verification object
    metadata.luxhub_verification = {
      verified: true,
      vault_address: verification.vaultAddress || walletAddress,
      minted_by: verification.mintedBy || walletAddress,
      minted_at: new Date().toISOString(),
      verification_url: `https://luxhub.io/verify?mint=`, // Mint address appended at runtime
    };
  }

  return metadata;
};

// On-chain update
export const updateNftMetadata = async (
  wallet: WalletAdapter,
  mintAddress: string,
  updatedFields: Partial<{
    name: string;
    uri: string; // this is the new field we pass in
    seller_fee_basis_points: number;
    properties: NFTMetadata['properties'];
  }>
) => {
  const connection = new Connection(
    process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'
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
    sellerFeeBasisPoints: updatedFields.seller_fee_basis_points ?? nft.sellerFeeBasisPoints,
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
