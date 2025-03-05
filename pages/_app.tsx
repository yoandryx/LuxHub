import { useEffect, useState } from "react";
import type { AppProps } from "next/app";
import { useMemo } from "react";
import { WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import Navbar from "../components/Navbar"; // Import Navbar
import Footer from "../components/Footer";
import UserHeader from "../components/UserHeader";
import { ListingsProvider } from "../context/ListingsContext"; // Import ListingsProvider
import "../styles/globals.css"; // Import global styles

// Import default styles for the wallet modal
import "@solana/wallet-adapter-react-ui/styles.css";

export default function MyApp({ Component, pageProps }: AppProps) {

    // Prevents hydration mismatch by ensuring the component only renders on the client
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    // Memoized list of wallets
    const wallets = useMemo(() => [
        new PhantomWalletAdapter(), 
        new SolflareWalletAdapter()
    ], []);

    if (!isClient) return null; // Avoiding hydration mismatch

    return (
        
        <>
            <WalletProvider wallets={wallets} autoConnect> 
                <WalletModalProvider> {/* Ensures WalletModalContext is available */}
                    
                    <ListingsProvider> {/* Wrap ListingsProvider inside WalletProviders */}
                        
                        <Navbar /> {/* Add Navbar component */}

                        <UserHeader/>
                        
                        <Component {...pageProps} />

                        <Footer /> {/* Add Footer component */}

                    </ListingsProvider>

                </WalletModalProvider>
            </WalletProvider>
        </>

    );
}
