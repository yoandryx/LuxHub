import React from "react";
import { useState } from "react";
import { useListings } from "../context/ListingsContext";
import styles from "../styles/Listings.module.css";
import Link from "next/link";

export default function Listings() {
  
  const { listings } = useListings(); // Fetch listings from context
  const [searchQuery, setSearchQuery] = useState("");
  console.log("Listings on Listings Page:", listings); // Log listings to console
  // Filter listings based on search query
  const filteredListings = listings.filter((listing) =>
    listing.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    
    <div className={styles.listingsContainer}>
      <h1 className={styles.title}>Explore Listings</h1>

      {/* 🔍 Search Input */}
      <input
        type="text"
        placeholder="Search listings..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className={styles.searchBar}
      />

      {/* Listings Grid */}
      <div className={styles.grid}>
        {filteredListings.length > 0 ? (
          filteredListings.map((listing) => (
            <div key={listing.id} className={styles.card}>
              <img src={listing.image} alt={listing.title} className={styles.image} />
              <h3 className={styles.title}>{listing.title}</h3>
              <h4 className={styles.description}>{listing.description}</h4>
              <p className={styles.price}>${listing.price}</p>
            </div>
          ))
        ) : (
          <p className={styles.noResults}>No listings found.</p>
        )}
      </div>
    </div>
  );
}
