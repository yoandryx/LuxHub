import React from "react";
import dynamic from "next/dynamic";
import ThreeScene from "../components/ThreeScene";
import Link from "next/link";

const WalletMultiButtonDynamic = dynamic(() => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton), { ssr: false });

export default function Home() {
    return (
        <div className="min-h-scren flex flex-col items-center justify-center bg-gray-100">
            
            <Link href="/create-listing">
                <button className="mt-6 bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition">
                    Create a Listing
                </button>
            </Link>

            {/* Use the dynamically imported wallet button */}
            <WalletMultiButtonDynamic />

            <h1 className="text-3xl font-bold mb-4">
                Welcome too the Decentralized Marketplace
            </h1>

            <p className="mb-4">
                Built on Solana with Next.js, Tailwind CSS, and Wallet Adapter.
            </p>

            {/* Use the ThreeScene component */}
            <div className="mt-8 w-full max--w-4xl">
                <ThreeScene />
            </div>

            

        </div>
    );
  }