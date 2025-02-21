import type { AppProps } from "next/app";
import { useMemo } from "react";
import { WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import Navbar from "../components/Navbar"; // Import Navbar
import { ListingsProvider } from "../context/ListingsContext"; // Import ListingsProvider
import "../styles/globals.css"; // Import global styles

// import default styles for the wallet modal
import "@solana/wallet-adapter-react-ui/styles.css";

export default function MyApp({ Component, pageProps }: AppProps) {
    //create a memoized list of wallets to use.
    const wallets = useMemo(() => [
        new PhantomWalletAdapter, 
        new SolflareWalletAdapter
    ], []);

    return (
        <>

            <ListingsProvider> {/* Add ListingsProvider */}

                <Navbar /> {/* Add Navbar component */}

                <WalletProvider wallets = {wallets} autoConnect>
                    <WalletModalProvider>
                        <Component {...pageProps} />
                    </WalletModalProvider>
                </WalletProvider>

            </ListingsProvider>

        </>
    );
}
