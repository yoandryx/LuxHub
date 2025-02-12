import type { AppProps } from "next/app";
import { useMemo } from "react";
import { WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";

// import default styles for the wallet modal
import "@solana/wallet-adapter-react-ui/styles.css";

export default function MyApp({ Component, pageProps }: AppProps) {
    //create a memoized list of wallets to use.
    const wallets = useMemo(() => [
        new PhantomWalletAdapter, 
        new SolflareWalletAdapter
    ], []);

    return (
        <WalletProvider wallets = {wallets} autoConnect>
            <WalletModalProvider>
                <Component {...pageProps} />
            </WalletModalProvider>
        </WalletProvider>
    );
}
