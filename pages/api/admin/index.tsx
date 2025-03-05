import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/router";

export default function AdminDashboard() {
  const [listings, setListings] = useState([]);
  const router = useRouter();

  useEffect(() => {
    const fetchListings = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/login");
          return;
        }

        const response = await axios.get("/api/admin/listings", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        setListings(response.data);
      } catch (error) {
        console.error("Authorization error:", error);
        alert("You are not authorized or your session has expired.");
        localStorage.removeItem("token");
        router.push("/login");
      }
    };
    fetchListings();
  }, [router]);

  const handleApproval = async (listingId: string, approved: boolean) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        alert("You are not authorized index.tsx admin dashboard");
        router.push("/login");
        return;
      }

      await axios.post(
        "/api/admin/listings/approve",
        { listingId, approved },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      alert("Listing status updated");
      setListings((prevListings) =>
        prevListings.filter((listing: any) => listing._id !== listingId)
      );
    } catch (error) {
      console.error("Approval error:", error);
      alert("Failed to update listing status");
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-4">Admin Dashboard - Listing Approvals</h1>
      {listings.length > 0 ? (
        listings.map((listing: any) => (
          <div key={listing._id} className="p-4 border mb-2">
            <h2>{listing.title}</h2>
            <p>{listing.description}</p>
            <button
              onClick={() => handleApproval(listing._id, true)}
              className="bg-green-500 text-white p-1 rounded mr-2"
            >
              Approve
            </button>
            <button
              onClick={() => handleApproval(listing._id, false)}
              className="bg-red-500 text-white p-1 rounded"
            >
              Reject
            </button>
          </div>
        ))
      ) : (
        <p>No listings pending approval.</p>
      )}
    </div>
  );
}
