//
//
//
// Polyfill for global crypto and nodeCrypto (needed by noble-ed25519 used in Metaplex)
if (typeof (globalThis as any).crypto === 'undefined') {
  (globalThis as any).crypto = window.crypto;
}
if (typeof (globalThis as any).nodeCrypto === 'undefined') {
  (globalThis as any).nodeCrypto = (globalThis as any).crypto;
}


import { AppProps } from "next/app";
import React, { useEffect, useState, useMemo } from "react";
import { EscrowProvider } from "../context/src/EscrowContext"; 
import Navbar from "../components/common/Navbar";
import UserHeader from "../components/user/UserHeader";
import Footer from "../components/common/Footer";
import WalletNavbar from "../components/common/WalletNavbar";
import { ErrorBoundary } from "react-error-boundary";
import { Fallback } from "../components/common/Fallback";
import "../styles/globals.css";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { SolflareWalletAdapter, PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';

// Network URL
const network = WalletAdapterNetwork.Devnet;
const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT ?? "https://api.devnet.solana.com";

const App = ({ Component, pageProps }: AppProps) => {
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true); // Ensuring everything is loaded on the client side
  }, []);
  
  // Memoize wallet adapter setup
  const wallets = useMemo(() => [
    new SolflareWalletAdapter(),
    new PhantomWalletAdapter(),
  ], []);

  const content = (
    <ErrorBoundary FallbackComponent={Fallback}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <EscrowProvider>
              <Navbar />
              <UserHeader />
              <WalletNavbar />
              <Component {...pageProps} />
              <Footer />
            </EscrowProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ErrorBoundary>
  );

  return isClient ? content : <div className="text-center mt-10">Loading application...</div>;
};

export default App;

//
//
//