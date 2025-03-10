import { AppProps } from "next/app";
import React, { useEffect, useState, useMemo } from "react";

import { ListingsProvider } from "../context/src/ListingsContext";

import Navbar from "../components/Navbar";
import UserHeader from "../components/UserHeader";
import Footer from "../components/Footer";
import WalletNavbar from "../components/WalletNavbar";
import { ErrorBoundary } from "react-error-boundary";
import { Fallback } from "../components/Fallback";
import "../styles/globals.css"

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { Keypair } from "@solana/web3.js";
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';

// Network URL (you can change to 'testnet' or 'mainnet' if needed)
const network = WalletAdapterNetwork.Devnet;
const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT ?? "https://api.devnet.solana.com";
const secretKey = process.env.NEXT_PUBLIC_DEVNET_KEYPAIR ? JSON.parse(process.env.NEXT_PUBLIC_DEVNET_KEYPAIR) : [];
const keypair = secretKey.length > 0 ? Keypair.fromSecretKey(new Uint8Array(secretKey)) : null;

const App = ({ Component, pageProps }: AppProps) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true); 
  }, []);

  if (keypair) {
    console.log("Public Key:", keypair.publicKey.toBase58());
}

  const wallets = useMemo(() => [
    new SolflareWalletAdapter()
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