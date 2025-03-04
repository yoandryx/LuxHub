import React, { useEffect, useState } from "react";
import axios from "axios";

type Listing = {
  _id: string;
  title: string;
  price: string;
  category: string;
  status: string;
  approved: boolean;
};

const AdminDashboard = () => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/listings");
      setListings(data);
    } catch (error) {
      console.error("Failed to fetch listings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (id: string, approved: boolean) => {
    try {
      await axios.post("/api/listings/approve", { listingId: id, approved });
      fetchListings();
    } catch (error) {
      console.error("Approval failed:", error);
    }
  };

  useEffect(() => {
    fetchListings();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl mb-4">Admin Dashboard</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr>
              <th className="border p-2">Title</th>
              <th className="border p-2">Price</th>
              <th className="border p-2">Category</th>
              <th className="border p-2">Status</th>
              <th className="border p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => (
              <tr key={listing._id}>
                <td className="border p-2">{listing.title}</td>
                <td className="border p-2">{listing.price}</td>
                <td className="border p-2">{listing.category}</td>
                <td className="border p-2">{listing.approved ? "Approved" : "Pending"}</td>
                <td className="border p-2">
                  {!listing.approved && (
                    <>
                      <button
                        onClick={() => handleApproval(listing._id, true)}
                        className="px-2 py-1 bg-green-500 text-white mr-2"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleApproval(listing._id, false)}
                        className="px-2 py-1 bg-red-500 text-white"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminDashboard;
