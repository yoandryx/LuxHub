import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/router";
import styles from "../../../styles/AdminDashboard.module.css";

interface Listing {
  _id: string;
  title: string;
  description: string;
  owner: string;
  approved: boolean;
  status: string;
  category: string;
}

export default function AdminDashboard() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const router = useRouter();

  useEffect(() => {
    const fetchListings = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }
      try {
        const response = await axios.get("/api/admin/listings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setListings(response.data);
        setFilteredListings(response.data);
      } catch (error: any) {
        console.error("Authorization error:", error);
        alert("You are not authorized or your session has expired.");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, [router]);

  // Filter listings based on the search term
  useEffect(() => {
    const lowerTerm = searchTerm.toLowerCase();
    const filtered = listings.filter((listing) =>
      listing.title.toLowerCase().includes(lowerTerm)
    );
    setFilteredListings(filtered);
  }, [searchTerm, listings]);

  const handleApproval = async (listingId: string, approved: boolean) => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    try {
      await axios.post(
        "/api/admin/listings/approve",
        { listingId, approved },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert("Listing status updated");
      // Remove updated listing from the list
      setListings((prev) => prev.filter((listing) => listing._id !== listingId));
      setFilteredListings((prev) => prev.filter((listing) => listing._id !== listingId));
    } catch (error: any) {
      console.error("Approval error:", error);
      alert("Failed to update listing status");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Admin Dashboard - Listing Approvals</h1>
        <button onClick={handleLogout} className={styles.logoutButton}>
          Logout
        </button>
      </header>

      <div className={styles.searchContainer}>
        <input
          type="text"
          placeholder="Search listings..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {filteredListings.length === 0 ? (
        <p>No listings pending approval.</p>
      ) : (
        <div className={styles.listingsGrid}>
          {filteredListings.map((listing) => (
            <div key={listing._id} className={styles.listingCard}>
              <div className={styles.cardTitle}>{listing.title}</div>
              <div className={styles.cardDescription}>{listing.description}</div>
              <div className={styles.cardOwner}>Owner: {listing.owner}</div>
              <div className={styles.cardStatus}>
                {listing.approved
                  ? "Approved"
                  : listing.status === "pending"
                  ? "Pending"
                  : "Rejected"}
              </div>
              <div className={styles.actions}>
                <button
                  onClick={() => handleApproval(listing._id, true)}
                  className={styles.actionButton}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleApproval(listing._id, false)}
                  className={styles.actionButton}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
