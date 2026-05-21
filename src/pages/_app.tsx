// Polyfill for global crypto and nodeCrypto (needed by noble-ed25519 used in Metaplex)
if (typeof (globalThis as any).crypto === 'undefined') {
  (globalThis as any).crypto = window.crypto;
}
if (typeof (globalThis as any).nodeCrypto === 'undefined') {
  (globalThis as any).nodeCrypto = (globalThis as any).crypto;
}

import { AppProps } from 'next/app';
import Head from 'next/head';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
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
import type { WalletError } from '@solana/wallet-adapter-base';
import '@solana/wallet-adapter-react-ui/styles.css';
import LuxuryAssistant from '../components/user/LuxuryAssistant';
import VendorFab from '../components/vendor/VendorFab';
import { Toaster, toast } from 'react-hot-toast';
import { PriceDisplayProvider } from '../components/marketplace/PriceDisplay';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';

const App = ({ Component, pageProps }: AppProps) => {
  const [isClient, setIsClient] = useState(false);
  const { endpoint, chain } = getClusterConfig();

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('luxhub_testing_notice_shown')) return;
    sessionStorage.setItem('luxhub_testing_notice_shown', '1');
    setTimeout(() => {
      toast(
        '⚠️ LuxHub is live on mainnet and currently in active testing. Real transactions use real SOL. Please proceed with caution.',
        {
          duration: 10000,
          icon: null,
          style: {
            background: 'rgba(13, 13, 13, 0.95)',
            color: '#ffffff',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderLeft: '3px solid #fbbf24',
            padding: '14px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            maxWidth: '420px',
            backdropFilter: 'blur(20px)',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          },
        }
      );
    }, 1200);
  }, []);

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

  const handleWalletError = useCallback((error: WalletError) => {
    console.error('[LuxHub wallet]', error);
  }, []);

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

        <PriceDisplayProvider>
          <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect onError={handleWalletError}>
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
                <Component {...pageProps} />
                <VendorFab />
                <LuxuryAssistant />
                <Footer />
                <SpeedInsights />
                <Analytics />
              </WalletModalProvider>
            </WalletProvider>
          </ConnectionProvider>
        </PriceDisplayProvider>
      </ErrorBoundary>
    </ClusterErrorBoundary>
  );

  return isClient ? content : <div className="text-center mt-10">Loading application...</div>;
};

export default App;
