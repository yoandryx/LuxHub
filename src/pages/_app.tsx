import { AppProps } from "next/app";
import React, { useEffect, useState, useMemo } from "react";
import { ListingsProvider } from "../context/src/ListingsContext"; 
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
            <ListingsProvider>
              <Navbar />
              <UserHeader />
              <WalletNavbar />
              <Component {...pageProps} />
              <Footer />
            </ListingsProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ErrorBoundary>
  );

  return isClient ? content : <div>Loading...</div>;
};

export default App;
