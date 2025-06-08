import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/router";
import styles from "../../styles/UserDashboard.module.css"; // Adjust path as needed


interface Listing {
  _id: string;
  title: string;
  description?: string;
  approved?: boolean;
  status?: string;
}

export default function UserDashboard() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const router = useRouter();

  useEffect(() => {
    const fetchListings = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        // Calling the user-specific listings endpoint
        const response = await axios.get("/api/users/listings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setListings(response.data);
      } catch (err: any) {
        setError(err.response?.data?.error || "Failed to fetch listings");
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, [router]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Your Listings</h1>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? (
        <p className={styles.loading}>Loading...</p>
      ) : listings.length === 0 ? (
        <p>No listings found.</p>
      ) : (
        <ul className={styles.listingsList}>
          {listings.map((listing) => (
            <li key={listing._id} className={styles.listingItem}>
              <span className={styles.listingTitle}>{listing.title}</span> -{" "}
              <span className={styles.listingStatus}>
                {listing.approved ? "Approved" : listing.status === "pending" ? "Pending" : "Rejected"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
