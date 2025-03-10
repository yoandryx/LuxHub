import { useState, useEffect, useMemo } from "react";
import type { AppProps } from "next/app";
import dynamic from "next/dynamic";
import { ErrorBoundary } from "react-error-boundary";
import { ConnectionProvider } from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import UserHeader from "../components/UserHeader";
import WalletNavbar from "../components/WalletNavbar";
import { ListingsProvider } from "../context/src/ListingsContext";  // Your Listings Context

import "../styles/globals.css";

// Dynamically import wallet-related components to load only on the client
const WalletProviderDynamic = dynamic(
  () =>
    import("@solana/wallet-adapter-react").then((mod) => mod.WalletProvider),
  { ssr: false }
);
const WalletModalProviderDynamic = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletModalProvider),
  { ssr: false }
);

function Fallback({ error }: { error: Error }) {
  return <div style={{ padding: "20px", color: "red" }}>Error: {error.message}</div>;
}

export default function MyApp({ Component, pageProps }: AppProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const network = clusterApiUrl("devnet");
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  const content = (
    <ListingsProvider>
      <ErrorBoundary FallbackComponent={Fallback}>
        <ConnectionProvider endpoint={network}>
          <WalletProviderDynamic wallets={wallets} autoConnect>
            <WalletModalProviderDynamic>
              <Navbar />
              <UserHeader />
              <Component {...pageProps} />
              <WalletNavbar />
              <Footer />
            </WalletModalProviderDynamic>
          </WalletProviderDynamic>
        </ConnectionProvider>
      </ErrorBoundary>
    </ListingsProvider>
  );

  return <>{mounted ? content : <div style={{ minHeight: "100vh" }} />}</>;
}
