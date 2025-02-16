import { useRouter } from "next/router";
import React from "react";

// Mock data for now (will replace with real data)
const mockListings = {
  "1": { title: "Luxury Watch", price: "12 SOL", image: "/watch1.jpg", description: "High-end Rolex watch, brand new." },
  "2": { title: "Limited Edition Sneaker", price: "8 SOL", image: "/sneaker.jpg", description: "Rare Jordan sneakers in mint condition." },
  "3": { title: "Antique Gold Coin", price: "20 SOL", image: "/goldcoin.jpg", description: "A vintage gold coin from 1900." },
};

export default function ListingDetail() {
  const router = useRouter();
  const { id } = router.query;
  const listing = id ? mockListings[id as string] : null;

  if (!listing) {
    return <div className="min-h-screen flex items-center justify-center text-xl">Listing not found</div>;
  }

  return (
    <div className="min-h-screen p-6 bg-gray-100 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-4">{listing.title}</h1>
      <img src={listing.image} alt={listing.title} className="w-96 h-96 object-cover rounded shadow-md" />
      <p className="text-gray-700 mt-4">{listing.description}</p>
      <p className="text-xl font-semibold mt-2">{listing.price}</p>
      <button className="mt-4 bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition">Buy Now</button>
    </div>
  );
}
