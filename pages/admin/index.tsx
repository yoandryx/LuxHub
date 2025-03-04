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
        const response = await axios.get("/api/listings", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setListings(response.data);
      } catch (error) {
        alert("You are not authorized");
        router.push("/login");
      }
    };
    fetchListings();
  }, [router]);

  const handleApproval = async (listingId: string, approved: boolean) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        "/api/listings/approve",
        { listingId, approved },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      alert("Listing status updated");
      setListings(listings.filter((listing: any) => listing._id !== listingId));
    } catch (error) {
      alert("Failed to update listing status");
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-4">Admin Dashboard - Listing Approvals</h1>
      {listings.map((listing: any) => (
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
      ))}
    </div>
  );
}
