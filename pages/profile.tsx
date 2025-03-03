import { useEffect, useState } from "react";
import styles from "../styles/Profile.module.css";
import { useWallet } from "@solana/wallet-adapter-react";
import { useListings } from "../context/ListingsContext";

export default function Profile() {
  const { publicKey } = useWallet(); // Get wallet address
  const { listings } = useListings(); // Get all listings from context
  const walletAddress = publicKey ? publicKey.toBase58() : "Not Connected";

  // Filter listings owned by the connected wallet
  const userListings = publicKey
    ? listings.filter((listing) => listing.owner === publicKey.toBase58())
    : [];

  return (
    <div className={styles.profileContainer}>
      <h1 className={styles.title}>User Profile</h1>

      <div className={styles.profileCard}>
        <img
          src="/images/cryptoRender.png"
          alt="Profile"
          className={styles.profilePic}
        />
        <p>
          <strong>Wallet Address:</strong>
        </p>
        <div className={styles.profileInfo}>
          <p className={styles.walletAddress}>{walletAddress}</p>
          <button className={styles.editButton}>Edit Profile</button>
        </div>
      </div>

      <div className={styles.listingsSection}>
        <h2>Your Listings</h2>
        {userListings.length > 0 ? (
          <div className={styles.grid}>
            {userListings.map((listing) => (
              <div key={listing.id} className={styles.card}>
                <img
                  src={listing.image}
                  alt={listing.title}
                  className={styles.image}
                />
                <h3 className={styles.title}>{listing.title}</h3>
                <h4 className={styles.description}>{listing.description}</h4>
                <p className={styles.price}>{listing.price} SOL</p>
              </div>
            ))}
          </div>
        ) : (
          <p>No listings found.</p>
        )}
      </div>
    </div>
  );
}
