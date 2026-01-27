// src/lib/services/heliusService.ts
// Service for interacting with Helius API for token holder data

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
 * Get the top token holders for a given SPL token mint
 * Uses Helius DAS API for efficient holder lookup
 *
 * @param mint - SPL token mint address
 * @param limit - Maximum number of holders to return (default 100)
 * @returns Array of TokenHolder objects sorted by balance descending
 */
export async function getTopTokenHolders(
  mint: string,
  limit: number = 100
): Promise<TokenHolder[]> {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;

  if (!heliusApiKey && !rpcUrl?.includes('helius')) {
    throw new Error('HELIUS_API_KEY or Helius RPC endpoint required');
  }

  // Determine the API base URL
  const apiBase = heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : rpcUrl;

  try {
    // Use Helius getTokenLargestAccounts for top holders
    const response = await fetch(apiBase!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-token-holders',
        method: 'getTokenLargestAccounts',
        params: [mint],
      }),
    });

    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Helius RPC error: ${data.error.message}`);
    }

    const accounts = data.result?.value || [];

    // Get owner addresses for each token account
    const holdersWithOwners = await Promise.all(
      accounts.slice(0, limit).map(async (account: { address: string; amount: string }) => {
        try {
          // Fetch account info to get owner
          const accountInfoResponse = await fetch(apiBase!, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'get-account-info',
              method: 'getAccountInfo',
              params: [account.address, { encoding: 'jsonParsed' }],
            }),
          });

          const accountData = await accountInfoResponse.json();
          const parsedInfo = accountData.result?.value?.data?.parsed?.info;

          return {
            wallet: parsedInfo?.owner || account.address,
            balance: parseInt(account.amount, 10),
          };
        } catch {
          return {
            wallet: account.address,
            balance: parseInt(account.amount, 10),
          };
        }
      })
    );

    // Calculate total supply for ownership percentage
    const totalBalance = holdersWithOwners.reduce((sum, h) => sum + h.balance, 0);

    // Map to TokenHolder format with ownership percentage
    const holders: TokenHolder[] = holdersWithOwners.map((holder) => ({
      wallet: holder.wallet,
      balance: holder.balance,
      ownershipPercent: totalBalance > 0 ? (holder.balance / totalBalance) * 100 : 0,
    }));

    // Sort by balance descending
    holders.sort((a, b) => b.balance - a.balance);

    return holders;
  } catch (error) {
    console.error('[heliusService] Error fetching token holders:', error);
    throw error;
  }
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
