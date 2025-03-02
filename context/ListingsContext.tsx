import React, { createContext, useContext, useState, ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

// Define listing type
type Listing = {
  id: string;
  title: string;
  description: string;
  price: string;
  image: string;
  category: string;
  owner?: string;
};

// Context type
type ListingsContextType = {
  listings: Listing[];
  addListing: (newListing: Omit<Listing, "id" | "owner">) => void;
};

// Create Context
const ListingsContext = createContext<ListingsContextType | undefined>(undefined);

// Provider Component
export const ListingsProvider = ({ children }: { children: ReactNode }) => {
  const { publicKey } = useWallet();

  const [listings, setListings] = useState<Listing[]>([
    {
      id: "1",
      title: "Luxury Watch",
      price: "12 SOL",
      image: "/images/watch.png",
      description: "High-end Rolex watch.",
      category: "watches",
      owner: "System", // Placeholder for testing
    },
    {
      id: "2",
      title: "Sneakers",
      price: "8 SOL",
      image: "/sneaker.jpg",
      description: "Limited edition sneakers.",
      category: "shoes",
      owner: "System", // Placeholder for testing
    },
  ]);

  const addListing = (newListing: Omit<Listing, "id" | "owner">) => {
    if (!publicKey) {
      console.error("Wallet not connected");
      return;
    }

    setListings((prevListings) => [
      ...prevListings,
      {
        ...newListing,
        id: (prevListings.length + 1).toString(), // Ensure it's a string
        owner: publicKey.toBase58(), // Assign wallet address as owner
      },
    ]);
  };

  return (
    <ListingsContext.Provider value={{ listings, addListing }}>
      {children}
    </ListingsContext.Provider>
  );
};

// Custom hook to use the listings context
export const useListings = () => {
  const context = useContext(ListingsContext);
  if (!context) {
    throw new Error("useListings must be used within a ListingsProvider");
  }
  return context;
};
