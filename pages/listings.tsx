import { useState } from "react";
import Link from "next/link";
import styles from "../styles/Listings.module.css";

const listings = [
  { id: "1", 
    title: "Luxury Watch", 
    price: 12, image: "/watch.png", 
    category: "watches" 
  },
  { id: "2", 
    title: "Sneakers", 
    price: 8, 
    image: "/sneakers.png", 
    category: "shoes" 
  },
];

export default function Listings() {

  const handleCheckout = async () => {
    const res = await fetch("/api/checkout", {method: "POST"});
    const { url } = await res.json();
    window.location.href = url;
  };

  const [category, setCategory] = useState("");

  const filteredListings = category
      ? listings.filter((listing) => listing.category === category)
      : listings;

  return (
      <div className={styles.container}>
          <h2 className={styles.title}>Available Listings</h2>

          <select className={styles.sortButton} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All Categories</option>
              <option value="watches">Watches</option>
              <option value="shoes">Shoes</option>
              <option value="collectibles">Collectibles</option>
          </select> 

          <div className={styles.grid}>
              {filteredListings.map((listing) => (
                  <Link key={listing.id} href={`/listing/${listing.id}`}>
                      <div className={styles.card}>
                          <img src={listing.image} alt={listing.title} className={styles.image} />
                          <h3 className={styles.cardTitle}>{listing.title}</h3>
                          <p className={styles.price}>{listing.price} SOL</p>
                          <p className={styles.details}>View Details →</p>
                          <button onClick={handleCheckout} className={styles.buyButton}>Buy Wtih Card</button>
                      </div>
                  </Link>
              ))}
          </div>
      </div>
  );
}
