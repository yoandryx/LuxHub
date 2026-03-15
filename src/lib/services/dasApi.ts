// src/lib/services/dasApi.ts
// Helius DAS (Digital Asset Standard) API service
// Unified interface for all Solana digital assets: NFTs, cNFTs, tokens
// Docs: https://www.helius.dev/docs/das-api

const getRpcUrl = (): string => {
  return process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com';
};

// ========== TYPES ==========

export interface DASAsset {
  id: string;
  interface: string; // 'V1_NFT' | 'V1_PRINT' | 'FungibleAsset' | 'FungibleToken' | etc
  content: {
    $schema?: string;
    json_uri?: string;
    files?: { uri: string; mime: string; cdn_uri?: string }[];
    metadata: {
      name: string;
      symbol: string;
      description?: string;
      attributes?: { trait_type: string; value: string }[];
    };
    links?: {
      image?: string;
      external_url?: string;
      animation_url?: string;
    };
  };
  authorities?: { address: string; scopes: string[] }[];
  compression?: {
    eligible: boolean;
    compressed: boolean;
    data_hash?: string;
    creator_hash?: string;
    asset_hash?: string;
    tree?: string;
    seq?: number;
    leaf_id?: number;
  };
  grouping?: { group_key: string; group_value: string }[];
  royalty?: {
    royalty_model: string;
    target?: string;
    percent: number;
    basis_points: number;
    primary_sale_happened: boolean;
    locked: boolean;
  };
  creators?: { address: string; share: number; verified: boolean }[];
  ownership: {
    frozen: boolean;
    delegated: boolean;
    delegate?: string;
    ownership_model: string;
    owner: string;
  };
  supply?: {
    print_max_supply?: number;
    print_current_supply?: number;
    edition_nonce?: number;
  };
  mutable: boolean;
  burnt: boolean;
  token_info?: {
    symbol?: string;
    balance?: number;
    supply?: number;
    decimals?: number;
    token_program?: string;
    associated_token_address?: string;
    price_info?: {
      price_per_token?: number;
      total_price?: number;
      currency?: string;
    };
  };
}

export interface DASPageResult {
  total: number;
  limit: number;
  page: number;
  items: DASAsset[];
  nativeBalance?: {
    lamports: number;
    price_per_sol?: number;
    total_price?: number;
  };
  grand_total?: boolean;
}

export interface DASTokenAccount {
  address: string;
  mint: string;
  owner: string;
  amount: number;
  delegated_amount?: number;
  frozen: boolean;
  token_extensions?: Record<string, unknown>;
}

export interface DASTokenAccountResult {
  total: number;
  limit: number;
  page?: number;
  cursor?: string;
  token_accounts: DASTokenAccount[];
}

// ========== CORE RPC HELPER ==========

async function dasRpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const rpcUrl = getRpcUrl();

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `das-${method}-${Date.now()}`,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`DAS API HTTP error: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`DAS API error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return data.result;
}

// ========== ASSET QUERIES ==========

/**
 * Get a single asset by mint address.
 * Returns full metadata, ownership, compression status, royalties, etc.
 * Replaces: Metaplex findByMint() + IPFS fetch (3 calls → 1)
 */
export async function getAsset(mintAddress: string): Promise<DASAsset> {
  return dasRpc<DASAsset>('getAsset', {
    id: mintAddress,
    options: {
      showCollectionMetadata: true,
      showFungible: false,
    },
  });
}

/**
 * Get up to 1000 assets in a single batch call.
 */
export async function getAssetBatch(mintAddresses: string[]): Promise<DASAsset[]> {
  if (mintAddresses.length === 0) return [];
  if (mintAddresses.length > 1000) {
    throw new Error('getAssetBatch supports max 1000 assets per call');
  }
  return dasRpc<DASAsset[]>('getAssetBatch', { ids: mintAddresses });
}

/**
 * Get ALL assets owned by a wallet address.
 * Returns NFTs, cNFTs, and optionally fungible tokens + SOL balance.
 * Replaces: MongoDB-only queries for user holdings
 */
export async function getAssetsByOwner(
  ownerAddress: string,
  options?: {
    page?: number;
    limit?: number;
    showFungible?: boolean;
    showNativeBalance?: boolean;
    showCollectionMetadata?: boolean;
    sortBy?: { sortBy: 'created' | 'updated' | 'recent_action'; sortDirection: 'asc' | 'desc' };
  }
): Promise<DASPageResult> {
  return dasRpc<DASPageResult>('getAssetsByOwner', {
    ownerAddress,
    page: options?.page || 1,
    limit: options?.limit || 100,
    sortBy: options?.sortBy || { sortBy: 'recent_action', sortDirection: 'desc' },
    displayOptions: {
      showFungible: options?.showFungible ?? false,
      showNativeBalance: options?.showNativeBalance ?? true,
      showCollectionMetadata: options?.showCollectionMetadata ?? true,
      showUnverifiedCollections: false,
    },
  });
}

/**
 * Get all assets in a collection.
 */
export async function getAssetsByCollection(
  collectionAddress: string,
  page: number = 1,
  limit: number = 100
): Promise<DASPageResult> {
  return dasRpc<DASPageResult>('getAssetsByGroup', {
    groupKey: 'collection',
    groupValue: collectionAddress,
    page,
    limit,
  });
}

/**
 * Search assets with flexible criteria.
 * Supports filtering by owner, creator, collection, burnt status, compressed, token type.
 */
export async function searchAssets(params: {
  ownerAddress?: string;
  creatorAddress?: string;
  creatorVerified?: boolean;
  collection?: string;
  burnt?: boolean;
  compressed?: boolean;
  tokenType?: 'fungible' | 'nonFungible' | 'regularNft' | 'compressedNft' | 'all';
  page?: number;
  limit?: number;
  sortBy?: { sortBy: string; sortDirection: 'asc' | 'desc' };
}): Promise<DASPageResult> {
  const rpcParams: Record<string, unknown> = {
    page: params.page || 1,
    limit: params.limit || 100,
  };

  if (params.ownerAddress) rpcParams.ownerAddress = params.ownerAddress;
  if (params.creatorAddress) rpcParams.creatorAddress = params.creatorAddress;
  if (params.creatorVerified !== undefined) rpcParams.creatorVerified = params.creatorVerified;
  if (params.collection) rpcParams.grouping = ['collection', params.collection];
  if (params.burnt !== undefined) rpcParams.burnt = params.burnt;
  if (params.compressed !== undefined) rpcParams.compressed = params.compressed;
  if (params.tokenType) rpcParams.tokenType = params.tokenType;
  if (params.sortBy) rpcParams.sortBy = params.sortBy;

  return dasRpc<DASPageResult>('searchAssets', rpcParams);
}

/**
 * Get token accounts for a mint or owner.
 * Replaces: getTokenLargestAccounts + getMultipleAccountsInfo (N+1 calls → 1)
 */
export async function getTokenAccounts(params: {
  mint?: string;
  owner?: string;
  page?: number;
  limit?: number;
}): Promise<DASTokenAccountResult> {
  if (!params.mint && !params.owner) {
    throw new Error('Either mint or owner is required');
  }

  const rpcParams: Record<string, unknown> = {
    page: params.page || 1,
    limit: params.limit || 100,
  };

  if (params.mint) rpcParams.mint = params.mint;
  if (params.owner) rpcParams.owner = params.owner;

  return dasRpc<DASTokenAccountResult>('getTokenAccounts', rpcParams);
}

/**
 * Get merkle proof for a compressed NFT (needed for cNFT transfers).
 */
export async function getAssetProof(
  assetId: string
): Promise<{ root: string; proof: string[]; node_index: number; leaf: string; tree_id: string }> {
  return dasRpc('getAssetProof', { id: assetId });
}

// ========== HELPERS ==========

/**
 * Extract the best image URL from a DAS asset.
 */
export function getAssetImage(asset: DASAsset): string {
  return (
    asset.content?.links?.image ||
    asset.content?.files?.[0]?.cdn_uri ||
    asset.content?.files?.[0]?.uri ||
    ''
  );
}

/**
 * Check if a DAS asset is an NFT (not fungible).
 */
export function isNFT(asset: DASAsset): boolean {
  return (
    asset.interface === 'V1_NFT' ||
    asset.interface === 'V1_PRINT' ||
    asset.interface === 'ProgrammableNFT'
  );
}

/**
 * Get token holders for an SPL mint via DAS.
 * Returns sorted by balance descending with ownership percentages.
 * Replaces: heliusService.getTopTokenHolders (N+1 RPC calls → 1 DAS call)
 */
export async function getTokenHolders(
  mint: string,
  limit: number = 100
): Promise<{ wallet: string; balance: number; ownershipPercent: number }[]> {
  const result = await getTokenAccounts({ mint, limit });

  const holders = result.token_accounts
    .filter((ta) => ta.amount > 0)
    .map((ta) => ({
      wallet: ta.owner,
      balance: ta.amount,
      ownershipPercent: 0,
    }));

  // Calculate ownership percentages
  const totalBalance = holders.reduce((sum, h) => sum + h.balance, 0);
  holders.forEach((h) => {
    h.ownershipPercent = totalBalance > 0 ? (h.balance / totalBalance) * 100 : 0;
  });

  // Sort descending
  holders.sort((a, b) => b.balance - a.balance);

  return holders.slice(0, limit);
}
