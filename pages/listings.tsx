import styles from "../styles/Listings.module.css";

export default function Listings() {
  const listings = [
    { title: "Luxury Watch", price: "12 SOL", image: "/watch.jpg" },
    { title: "Sneakers", price: "8 SOL", image: "/sneakers.jpg" },
  ];

  return (
    <div className={styles.container}>
      <h1>Available Listings</h1>
      <div className={styles.grid}>
        {listings.map((listing, index) => (
          <div key={index} className={styles.card}>
            <img src={listing.image} alt={listing.title} />
            <h2>{listing.title}</h2>
            <p>{listing.price}</p>
            <button>View Details</button>
          </div>
        ))}
      </div>
    </div>
  );
}
