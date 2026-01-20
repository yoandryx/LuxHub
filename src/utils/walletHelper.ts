// src/utils/walletHelper.ts
// Utility functions for wallet detection and connection guidance

export interface WalletInfo {
  name: string;
  icon: string;
  downloadUrl: string;
  chromeUrl: string;
  detected: boolean;
}

// Wallet provider information
export const SUPPORTED_WALLETS: Record<string, Omit<WalletInfo, 'detected'>> = {
  phantom: {
    name: 'Phantom',
    icon: 'https://phantom.app/img/logo.svg',
    downloadUrl: 'https://phantom.app/download',
    chromeUrl: 'https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa',
  },
  solflare: {
    name: 'Solflare',
    icon: 'https://solflare.com/favicon.ico',
    downloadUrl: 'https://solflare.com/download',
    chromeUrl:
      'https://chrome.google.com/webstore/detail/solflare-wallet/bhhhlbepdkbapadjdnnojkbgioiodbic',
  },
  backpack: {
    name: 'Backpack',
    icon: 'https://backpack.app/favicon.ico',
    downloadUrl: 'https://backpack.app/download',
    chromeUrl:
      'https://chrome.google.com/webstore/detail/backpack/aflkmfhebedbjioipglgcbcmnbpgliof',
  },
};

/**
 * Detect if a wallet provider is installed in the browser
 */
export function detectWalletProvider(walletName: string): boolean {
  if (typeof window === 'undefined') return false;

  switch (walletName.toLowerCase()) {
    case 'phantom':
      return !!(window as any).phantom?.solana?.isPhantom;
    case 'solflare':
      return !!(window as any).solflare?.isSolflare;
    case 'backpack':
      return !!(window as any).backpack?.isBackpack;
    default:
      return false;
  }
}

/**
 * Get all supported wallets with detection status
 */
export function getDetectedWallets(): WalletInfo[] {
  return Object.entries(SUPPORTED_WALLETS).map(([key, wallet]) => ({
    ...wallet,
    detected: detectWalletProvider(key),
  }));
}

/**
 * Check if any wallet is detected
 */
export function hasAnyWallet(): boolean {
  return Object.keys(SUPPORTED_WALLETS).some(detectWalletProvider);
}

/**
 * Get the first detected wallet name
 */
export function getFirstDetectedWallet(): string | null {
  const detected = Object.keys(SUPPORTED_WALLETS).find(detectWalletProvider);
  return detected ? SUPPORTED_WALLETS[detected].name : null;
}

/**
 * Format wallet address for display (truncated)
 */
export function formatWalletAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Validate Solana wallet address format
 */
export function isValidSolanaAddress(address: string): boolean {
  // Basic validation: base58 characters, 32-44 chars length
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

/**
 * Get wallet connection steps for onboarding
 */
export function getWalletOnboardingSteps(): { step: number; title: string; description: string }[] {
  return [
    {
      step: 1,
      title: 'Install a Wallet',
      description: 'Download Phantom or Solflare browser extension from their official website.',
    },
    {
      step: 2,
      title: 'Create Your Wallet',
      description:
        'Follow the setup wizard to create a new wallet. Save your recovery phrase securely!',
    },
    {
      step: 3,
      title: 'Fund Your Wallet',
      description:
        'Add SOL to your wallet. You can buy SOL on exchanges or receive it from friends.',
    },
    {
      step: 4,
      title: 'Connect to LuxHub',
      description: 'Click "Connect Wallet" and approve the connection in your wallet extension.',
    },
  ];
}

/**
 * Check if we're on mobile
 */
export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Get appropriate wallet download link based on platform
 */
export function getWalletDownloadLink(walletName: string): string {
  const wallet = SUPPORTED_WALLETS[walletName.toLowerCase()];
  if (!wallet) return '#';

  // On mobile, use general download page which has app store links
  if (isMobile()) {
    return wallet.downloadUrl;
  }

  // On desktop, prefer Chrome extension
  return wallet.chromeUrl;
}
