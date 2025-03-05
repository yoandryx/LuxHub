import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/router";

interface Listing {
  _id: string;
  title: string;
  status?: string;
  approved?: boolean;
}

export default function UserDashboard() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchListings = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          // If no token, redirect to login
          router.push("/login");
          return;
        }

        // Fetch user-specific listings
        const response = await axios.get("/api/user/listings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setListings(response.data);
      } catch (err: any) {
        setError(err?.response?.data?.error || "Failed to fetch listings");
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, [router]);

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <h2>Your Listings</h2>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {listings.length === 0 ? (
        <p>No listings found.</p>
      ) : (
        <ul>
          {listings.map((listing) => {
            // Decide the display label
            let statusLabel: string;
            if (listing.approved) {
              statusLabel = "Approved";
            } else if (listing.status === "pending") {
              statusLabel = "Pending";
            } else {
              statusLabel = "Rejected";
            }

            return (
              <li key={listing._id}>
                <strong>{listing.title}</strong> - {statusLabel}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
