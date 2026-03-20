// Polyfill for global crypto and nodeCrypto (needed by noble-ed25519 used in Metaplex)
if (typeof (globalThis as any).crypto === 'undefined') {
  (globalThis as any).crypto = window.crypto;
}
if (typeof (globalThis as any).nodeCrypto === 'undefined') {
  (globalThis as any).nodeCrypto = (globalThis as any).crypto;
}

import { AppProps } from 'next/app';
import Head from 'next/head';
import React, { useEffect, useState, useMemo } from 'react';
// import { EscrowProvider } from "../context/src/EscrowContext";
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import WalletNavbar from '../components/common/WalletNavbar';
import WalletNavbarSimple from '../components/common/WalletNavbarSimple';
import { ErrorBoundary } from 'react-error-boundary';
import { Fallback } from '../components/common/Fallback';
import '../styles/globals.css';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { SolflareWalletAdapter, PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { getClusterConfig } from '../lib/solana/clusterConfig';
import { ClusterErrorBoundary } from '../components/common/ClusterErrorBoundary';
import {
  RemoteSolanaMobileWalletAdapter,
  createDefaultAuthorizationResultCache,
  createDefaultAddressSelector,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-adapter-mobile';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';
// Consolidated to single toast library (react-hot-toast) - saves ~5KB
import LuxuryAssistant from '../components/user/LuxuryAssistant';
import VendorFab from '../components/vendor/VendorFab';
import { Toaster } from 'react-hot-toast';
import { PriceDisplayProvider } from '../components/marketplace/PriceDisplay';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { SpeedInsights } from '@vercel/speed-insights/next';

// Privy Solana wallet connectors for external wallets
const solanaConnectors = toSolanaWalletConnectors({
  // Show Phantom and Solflare in Privy's wallet connect modal
  shouldAutoConnect: true,
});

const App = ({ Component, pageProps }: AppProps) => {
  const [isClient, setIsClient] = useState(false);
  const { network, endpoint, chain } = getClusterConfig();

  useEffect(() => {
    setIsClient(true); // Ensuring everything is loaded on the client side
  }, []);

  // Memoize wallet adapter setup
  const wallets = useMemo(
    () => [
      new RemoteSolanaMobileWalletAdapter({
        appIdentity: {
          name: 'LuxHub',
          uri: process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold',
          icon: `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/images/purpleLGG.png`,
        },
        addressSelector: createDefaultAddressSelector(),
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        chain: chain,
        remoteHostAuthority: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold')
          .hostname,
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    [chain]
  );

  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const hasValidPrivyId = privyAppId && privyAppId.length > 10;

  // Debug: log Privy app ID status
  useEffect(() => {
    if (!hasValidPrivyId) {
      console.warn('[LuxHub] Privy app ID not configured or invalid. Email login disabled.');
    }
  }, [hasValidPrivyId]);

  // Inner content wrapped with providers
  // WalletNavbar uses Privy hooks, so we use WalletNavbarSimple when Privy is not configured
  const createInnerContent = (usePrivyWallet: boolean) => (
    <PriceDisplayProvider>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <Navbar />
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: 'rgba(10, 10, 14, 0.92)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  color: '#ffffff',
                  border: '1px solid rgba(200, 161, 255, 0.15)',
                  borderRadius: '12px',
                  fontSize: '13px',
                  padding: '12px 16px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                },
                success: {
                  iconTheme: { primary: '#26a69a', secondary: '#0a0a0e' },
                  style: { borderColor: 'rgba(38, 166, 154, 0.3)' },
                },
                error: {
                  iconTheme: { primary: '#ef5350', secondary: '#0a0a0e' },
                  style: { borderColor: 'rgba(239, 83, 80, 0.3)' },
                },
                loading: {
                  iconTheme: { primary: '#c8a1ff', secondary: '#0a0a0e' },
                },
              }}
            />
            {usePrivyWallet ? <WalletNavbar /> : <WalletNavbarSimple />}
            <Component {...pageProps} />
            <VendorFab />
            <LuxuryAssistant />
            <Footer />
            <SpeedInsights />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </PriceDisplayProvider>
  );

  const content = (
    <ClusterErrorBoundary>
      <ErrorBoundary
        FallbackComponent={Fallback}
        onError={(error, info) => {
          console.error('[LuxHub] ErrorBoundary caught:', error);
          console.error('[LuxHub] Component stack:', info?.componentStack);
        }}
      >
        <Head>
          <title>LuxHub</title>
          <link rel="icon" href="/images/purpleLGG.png" type="image/luxury-marketplace" />
          <link
            href="https://api.fontshare.com/v2/css?f[]=clash-display@200,300,400,500,600,700,800&display=swap"
            rel="stylesheet"
          />
        </Head>

        {hasValidPrivyId ? (
          <PrivyProvider
            appId={privyAppId}
            config={{
              loginMethods: ['email', 'wallet'],
              appearance: {
                theme: 'dark',
                accentColor: '#c8a1ff',
                logo: '/images/purpleLGG.png',
              },
              // Solana embedded wallet configuration
              embeddedWallets: {
                solana: {
                  createOnLogin: 'users-without-wallets',
                },
              },
              // External wallet connectors (Phantom, Solflare via Privy)
              externalWallets: {
                solana: {
                  connectors: solanaConnectors,
                },
              },
            }}
          >
            {createInnerContent(true)}
          </PrivyProvider>
        ) : (
          createInnerContent(false)
        )}
      </ErrorBoundary>
    </ClusterErrorBoundary>
  );

  return isClient ? content : <div className="text-center mt-10">Loading application...</div>;
};

export default App;
