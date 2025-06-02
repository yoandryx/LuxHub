import { createClient } from "@vercel/edge-config";

const edgeConfig = createClient(process.env.EDGE_CONFIG!);

const NFT_CACHE_KEY = "nfts-data";
const COUNT_CACHE_KEY = "nfts-count";

// fallback local memory (if write not supported)
let inMemoryNFTs: any[] | null = null;
let inMemoryCount: number | null = null;

export const getCachedNFTs = async () => {
  const data = await edgeConfig.get(NFT_CACHE_KEY);
  return (data as any[] | null) || inMemoryNFTs;
};

export const setCachedNFTs = async (data: any[]) => {
  // write to memory only
  inMemoryNFTs = data;
};

export const getCachedTotalCount = async () => {
  const count = await edgeConfig.get(COUNT_CACHE_KEY);
  return (count as number | null) ?? inMemoryCount;
};

export const setCachedTotalCount = async (count: number) => {
  // write to memory only
  inMemoryCount = count;
};
