// src/lib/solana/clusterConfig.ts
// Single source of truth for Solana network configuration.
// Every Connection, every explorer link, every network-aware constant comes from here.

import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import type { Connection as ConnectionType } from '@solana/web3.js';

// Network-aware USDC mint addresses
const USDC_MINTS: Record<string, string> = {
  devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  'mainnet-beta': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

const VALID_NETWORKS = ['devnet', 'mainnet-beta'] as const;
type SolanaChain = (typeof VALID_NETWORKS)[number];

export interface ClusterConfig {
  /** WalletAdapterNetwork enum value for wallet adapter providers */
  network: WalletAdapterNetwork;
  /** RPC endpoint URL (from NEXT_PUBLIC_SOLANA_ENDPOINT) */
  endpoint: string;
  /** String network name for non-wallet-adapter usage */
  chain: SolanaChain;
  /** Generates a Solscan account URL with correct cluster param */
  explorerUrl: (address: string) => string;
  /** Generates a Solscan transaction URL with correct cluster param */
  explorerTxUrl: (txSignature: string) => string;
  /** Network-aware USDC mint address */
  usdcMint: string;
}

/**
 * Returns the centralized Solana cluster configuration.
 * Throws descriptive [LuxHub] errors if required env vars are missing.
 */
export function getClusterConfig(): ClusterConfig {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      '[LuxHub] NEXT_PUBLIC_SOLANA_ENDPOINT is not configured. Set this environment variable to your Helius RPC URL.'
    );
  }

  const networkStr = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
  if (!networkStr || !VALID_NETWORKS.includes(networkStr as SolanaChain)) {
    throw new Error('[LuxHub] NEXT_PUBLIC_SOLANA_NETWORK must be "devnet" or "mainnet-beta".');
  }

  const chain = networkStr as SolanaChain;
  const network =
    chain === 'mainnet-beta' ? WalletAdapterNetwork.Mainnet : WalletAdapterNetwork.Devnet;
  const clusterSuffix = chain === 'devnet' ? '?cluster=devnet' : '';

  return {
    network,
    endpoint,
    chain,
    explorerUrl: (address: string) => `https://solscan.io/account/${address}${clusterSuffix}`,
    explorerTxUrl: (txSignature: string) => `https://solscan.io/tx/${txSignature}${clusterSuffix}`,
    usdcMint: USDC_MINTS[chain],
  };
}

/**
 * Returns a Connection instance using the centralized cluster config.
 * Convenience helper for server-side usage (API routes, services).
 */
export function getConnection(): ConnectionType {
  // Dynamic require to avoid pulling @solana/web3.js into test/client bundles unnecessarily

  const { Connection } = require('@solana/web3.js');
  return new Connection(getClusterConfig().endpoint, 'confirmed');
}
