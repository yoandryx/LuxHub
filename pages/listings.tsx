import React from "react";
import { useState } from "react";
import { useListings } from "../context/src/ListingsContext";
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

  const handleBuyWithCard = async (listing: any) => {
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: listing.title,
          price: listing.price,
          quantity: 1,
        }),
      });
  
      if (!res.ok) {
        console.error("API Error:", await res.text());
        return;
      }
  
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };
  

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
              <p className={styles.price}>${listing.priceSol}</p>
              <button onClick={() => handleBuyWithCard(listing)} className={styles.cardButton}>
                Buy with Stripe
              </button>
            </div>
          ))
        ) : (
          <p className={styles.noResults}>No listings found.</p>
        )}
      </div>
    </div>
  );
}
