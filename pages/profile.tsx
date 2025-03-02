import { useEffect, useState } from "react";
import styles from "../styles/Profile.module.css";
import { useWallet } from "@solana/wallet-adapter-react";
import { useListings } from "../context/ListingsContext";

export default function Profile() {
  const { publicKey } = useWallet(); // Get wallet address
  const walletAddress = publicKey ? publicKey.toBase58() : "Not Connected";

    return (
        <div className={styles.profileContainer}>
      <h1 className={styles.title}>User Profile</h1>

      <div className={styles.profileCard}>
        <img src="/images/profile-placeholder.png" alt="Profile" className={styles.profilePic} />
        <p><strong>Wallet Address:</strong></p>
        <div className={styles.profileInfo}>
          <p className={styles.walletAddress}>{walletAddress}</p>
          <button className={styles.editButton}>Edit Profile</button>
        </div>
      </div>

      <div className={styles.listingsSection}>
        <h2>Your Listings</h2>
        <p>(Listings will appear here when added)</p>
                    </div>
        </div>
    );
}
