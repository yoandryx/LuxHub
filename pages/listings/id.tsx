import { useRouter } from "next/router";
import styles from "../../styles/ListingDetails.module.css"; // Import CSS Module

const mockListings = {
  "1": { title: "Luxury Watch", price: "12 SOL", image: "/public/images/watch.png", description: "High-end luxury watch with premium build." },
  "2": { title: "Sneakers", price: "8 SOL", image: "/sneakers.png", description: "Limited edition sneakers with great comfort." }
};

export default function ListingDetail() {
  const router = useRouter();
  const { id } = router.query;
  const listing = mockListings[id as string];

  if (!listing) return <p>Listing not found.</p>;

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{listing.title}</h2>
      <img src={listing.image} alt={listing.title} className={styles.image} />
      <p className={styles.description}>{listing.description}</p>
      <p className={styles.price}>{listing.price}</p>
    </div>
  );
}
