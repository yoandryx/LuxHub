import React from "react";
import Link from "next/link";
import { useListings } from "../context/ListingsContext"; // Import context

export default function Listings() {
  const { listings } = useListings(); // Get listings from context

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Available Listings</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {listings.map((item) => (
          <div key={item.id} className="bg-white shadow-md p-4 rounded">
            <img src={item.image} alt={item.title} className="w-full h-48 object-cover rounded" />
            <h2 className="text-xl font-semibold mt-2">{item.title}</h2>
            <p className="text-gray-700">{item.price}</p>
            <Link href={`/listing/${item.id}`} className="block mt-3 text-blue-500 font-semibold">
              View Details
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
