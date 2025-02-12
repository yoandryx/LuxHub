import React from "react";
import dynamic from "next/dynamic";

const WalletMultiButtonDynamic = dynamic(() => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton), { ssr: false });

export default function Home() {
    return (
        <div className="min-h-scren flex flex-col items-center justify-center bg-gray-100">

            <h1 className="text-3xl font-bold mb-4">
                Welcome too the Decentralized Marketplace
            </h1>

            <p className="mb-4">
                Built on Solana with Next.js, Tailwind CSS, and Wallet Adapter.
            </p>

            {/* Use the dynamically imported wallet button */}
            <WalletMultiButtonDynamic />
            
        </div>
    );
  }