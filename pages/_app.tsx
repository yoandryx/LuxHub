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
import { ListingsProvider } from "../context/ListingsContext";
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
  // A mounted flag to know if the component has mounted on the client
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Always call hooks, regardless of mount state
  const network = clusterApiUrl("devnet"); // Change to "mainnet-beta" if needed
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  // Prepare the full content
  const content = (
    <ErrorBoundary FallbackComponent={Fallback}>
      <ConnectionProvider endpoint={network}>
        <WalletProviderDynamic wallets={wallets} autoConnect>
          <WalletModalProviderDynamic>
            <ListingsProvider>
              <Navbar />
              <UserHeader />
              <Component {...pageProps} />
              <WalletNavbar />
              <Footer />
            </ListingsProvider>
          </WalletModalProviderDynamic>
        </WalletProviderDynamic>
      </ConnectionProvider>
    </ErrorBoundary>
  );

  // Instead of returning null when not mounted, return a minimal div
  return <>{mounted ? content : <div style={{ minHeight: "100vh" }} />}</>;
}
