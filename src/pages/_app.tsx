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
import { ErrorBoundary } from 'react-error-boundary';
import { Fallback } from '../components/common/Fallback';
import '../styles/globals.css';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { SolflareWalletAdapter, PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import {
  RemoteSolanaMobileWalletAdapter,
  createDefaultAuthorizationResultCache,
  createDefaultAddressSelector,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-adapter-mobile';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';
import LuxuryAssistant from '../components/user/LuxuryAssistant';
import { Toaster } from 'react-hot-toast';
import { PriceDisplayProvider } from '../components/marketplace/PriceDisplay';
import { PrivyProvider } from '@privy-io/react-auth';

// Network URL
const network = WalletAdapterNetwork.Devnet;
const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT ?? 'https://api.devnet.solana.com';

const App = ({ Component, pageProps }: AppProps) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true); // Ensuring everything is loaded on the client side
  }, []);

  // Memoize wallet adapter setup
  const wallets = useMemo(
    () => [
      new RemoteSolanaMobileWalletAdapter({
        appIdentity: {
          name: 'LuxHub',
          uri: 'https://luxhub-gamma.vercel.app',
          icon: 'https://luxhub-gamma.vercel.app/purpleLGG.png',
        },
        addressSelector: createDefaultAddressSelector(),
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        chain: 'devnet',
        remoteHostAuthority: 'luxhub-gamma.vercel.app',
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

  const content = (
    <ErrorBoundary FallbackComponent={Fallback}>
      <Head>
        <title>LuxHub</title>
        <link rel="icon" href="/images/purpleLGG.png" type="image/luxury-marketplace" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-display@200,300,400,500,600,700,800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <PrivyProvider
        appId={privyAppId}
        config={{
          loginMethods: ['email', 'wallet'],
          appearance: {
            theme: 'dark',
            accentColor: '#c8a1ff',
            logo: '/images/purpleLGG.png',
          },
          embeddedWallets: {
            solana: {
              createOnLogin: 'users-without-wallets',
            },
          },
        }}
      >
        <PriceDisplayProvider>
          <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
              <WalletModalProvider>
                {/* <EscrowProvider> */}
                <Navbar />
                <ToastContainer position="top-right" autoClose={4000} />
                <Toaster position="top-right" />
                <WalletNavbar />
                <Component {...pageProps} />
                <LuxuryAssistant />
                <Footer />
                {/* </EscrowProvider> */}
              </WalletModalProvider>
            </WalletProvider>
          </ConnectionProvider>
        </PriceDisplayProvider>
      </PrivyProvider>
    </ErrorBoundary>
  );

  return isClient ? content : <div className="text-center mt-10">Loading application...</div>;
};

export default App;
