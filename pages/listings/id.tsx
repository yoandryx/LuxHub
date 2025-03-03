import { useRouter } from "next/router";
import styles from "../../styles/ListingDetails.module.css"; // Import CSS
import { useState, useEffect } from "react";
import axios from "axios";

// Define the Listing type
type Listing = {
  id: string;
  title: string;
  description: string;
  price: string;
  image: string;
  category: string;
  owner?: string;
};

// Component
export default function ListingDetail() {
  const router = useRouter();
  const { id } = router.query;

  // State with proper type
  const [listing, setListing] = useState<Listing | null>(null);

  useEffect(() => {
    if (id) {
      // Fetch listing data from API
      axios.get(`/api/listings/${id}`)
        .then((response) => setListing(response.data))
        .catch((error) => console.error("Failed to fetch listing:", error));
    }
  }, [id]);

  if (!listing) return <p>Listing not found or loading...</p>;

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{listing.title}</h2>
      <img src={listing.image} alt={listing.title} className={styles.image} />
      <p className={styles.description}>{listing.description}</p>
      <p className={styles.price}>{listing.price}</p>
    </div>
  );
}
