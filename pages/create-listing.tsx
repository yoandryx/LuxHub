import React, { useState } from "react";
import { useListings } from "../context/ListingsContext";
import { useRouter } from "next/router";

export default function CreateListing() {
  const { addListing } = useListings(); // Get function to add listings
  const router = useRouter();
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Generate a random ID for now (replace with DB ID later)
    const newListing = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      description,
      price: `${price} SOL`,
      image: image || "/placeholder.jpg", // Use placeholder if no image
    };

    addListing(newListing); // Save to global state
    router.push("/listings"); // Redirect to listings page
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-6">Create a New Listing</h1>
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow-md w-full max-w-md">
        <div className="mb-4">
          <label className="block text-gray-700 mb-2">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            placeholder="Enter asset title"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-gray-700 mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            placeholder="Describe your asset"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-gray-700 mb-2">Price (in SOL)</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            placeholder="Enter price in SOL"
            required
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-500 text-white py-2 rounded mt-4 hover:bg-blue-600 transition"
        >
          Create Listing
        </button>
      </form>
    </div>
  );
}
