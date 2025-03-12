import React, { useState } from "react";
import styles from "../styles/Home.module.css"; // Importing CSS module
import dynamic from "next/dynamic";

const ThreeScene = dynamic(() => import("../components/marketplace/ThreeScene"), { ssr: false });

export default function Home() {

  return (
    <>
      <div className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            {/* Main header*/}
            <h1 className={styles.title}>
              LuxHub <br /> The Decentralized Marketplace for Luxury Goods
            </h1>

            {/* Main Subtitle */}
            <p className={styles.subtitle}>
              Buy and Sell Luxury Timee Pieces with Crypto. Built on <span>Solana</span> using <span>Next.js </span>& Wallet Adapter.
            </p>

            {/* Grouping Three.js Scene and Buttons */}
            <div className={styles.landingGroup}>
              {/* Three.js Scene */}
              <div className={styles.threeScene}>
                <ThreeScene />
              </div>
            </div>

          </div>
        </section>
      </div>
    </>
  );
}
