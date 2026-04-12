// src/lib/services/heliusService.ts
// Service for interacting with Helius API for token holder data.
//
// Phase 11 cleanup (11-18): `getTopTokenHolders` was removed. It had an N+1
// getAccountInfo call path that was superseded by `getAllTokenHolders`
// (dasApi.ts) — the canonical paginated snapshot used by pool distribution.
// Call sites (only `pool/finalize.ts`) were deleted in the same commit as the
// Squad-DAO-from-holders orphan sweep.

interface TokenHolder {
  wallet: string;
  balance: number;
  ownershipPercent: number;
}

interface HeliusTokenHolder {
  owner: string;
  balance: number;
  // Helius may return additional fields
  [key: string]: unknown;
}

/**
 * Get token holder data using Helius DAS API (more comprehensive)
 * Useful for getting all holders, not just largest
 *
 * @param mint - SPL token mint address
 * @param cursor - Pagination cursor for large datasets
 * @param limit - Number of holders per page
 */
export async function getTokenHoldersDAS(
  mint: string,
  cursor?: string,
  limit: number = 100
): Promise<{ holders: TokenHolder[]; cursor?: string }> {
  const heliusApiKey = process.env.HELIUS_API_KEY;

  if (!heliusApiKey) {
    throw new Error('HELIUS_API_KEY required for DAS API');
  }

  try {
    const response = await fetch(
      `https://api.helius.xyz/v0/token/holders?api-key=${heliusApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mint,
          cursor,
          limit,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Helius DAS API error: ${response.status}`);
    }

    const data = await response.json();

    const holders: TokenHolder[] = (data.holders || []).map((h: HeliusTokenHolder) => ({
      wallet: h.owner,
      balance: h.balance,
      ownershipPercent: 0, // Calculate after if needed
    }));

    return {
      holders,
      cursor: data.cursor,
    };
  } catch (error) {
    console.error('[heliusService] Error fetching token holders via DAS:', error);
    throw error;
  }
}

/**
 * Get token metadata from Helius
 *
 * @param mint - SPL token mint address
 */
export async function getTokenMetadata(mint: string): Promise<{
  name: string;
  symbol: string;
  decimals: number;
  supply: string;
}> {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;

  const apiBase = heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : rpcUrl;

  try {
    const response = await fetch(apiBase!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-token-supply',
        method: 'getTokenSupply',
        params: [mint],
      }),
    });

    const data = await response.json();
    const supply = data.result?.value;

    return {
      name: '', // Would need additional metadata lookup
      symbol: '',
      decimals: supply?.decimals || 9,
      supply: supply?.amount || '0',
    };
  } catch (error) {
    console.error('[heliusService] Error fetching token metadata:', error);
    throw error;
  }
}

/**
 * Verify that a wallet holds a minimum balance of a token
 *
 * @param wallet - Wallet address to check
 * @param mint - SPL token mint address
 * @param minBalance - Minimum balance required
 */
export async function verifyTokenHolder(
  wallet: string,
  mint: string,
  minBalance: number = 1
): Promise<{ isHolder: boolean; balance: number }> {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;

  const apiBase = heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : rpcUrl;

  try {
    const response = await fetch(apiBase!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-token-accounts',
        method: 'getTokenAccountsByOwner',
        params: [wallet, { mint }, { encoding: 'jsonParsed' }],
      }),
    });

    const data = await response.json();
    const accounts = data.result?.value || [];

    // Sum up all token accounts for this mint
    const totalBalance = accounts.reduce(
      (
        sum: number,
        account: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number } } } } } }
      ) => {
        const amount = account.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
        return sum + amount;
      },
      0
    );

    return {
      isHolder: totalBalance >= minBalance,
      balance: totalBalance,
    };
  } catch (error) {
    console.error('[heliusService] Error verifying token holder:', error);
    return { isHolder: false, balance: 0 };
  }
}
