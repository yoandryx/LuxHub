import React from "react";
import dynamic from "next/dynamic";
import ThreeScene from "../components/ThreeScene";
import Link from "next/link";
import styles from "../styles/Home.module.css"; // Importing CSS module

const WalletMultiButtonDynamic = dynamic(() =>
  import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

export default function Home() {
  return (
    <div className={styles.container}>
      
      {/* 3D Visual Section */}
      <div className={styles.threeScene}>
        <ThreeScene />
      </div>
    
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.title}>
            Welcome to the <span>Decentralized Marketplace</span>
          </h1>
          <p className={styles.subtitle}>
            Buy and Sell with Crypto. Built on <span>Solana</span> using{" "}
            <span>Next.js</span> & Wallet Adapter.
          </p>

          {/* Buttons */}
          <div className={styles.buttonGroup}>
            <WalletMultiButtonDynamic className={styles.walletButton} />
            <Link href="/create-listing">
              <button className={styles.createButton}>Create a Listing</button>
            </Link>
          </div>
        </div>
      </section>

      
    </div>
  );
}
