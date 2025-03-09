import React, { createContext, useContext, useState, ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

// Define listing type with Solana-specific fields
type Listing = {
  id: string; // Eventually a token address or PDA
  title: string;
  description: string;
  priceSol: string; // Display-friendly (e.g., "12 SOL")
  priceLamports: number; // Solana-native (e.g., 12 * 10^9)
  image: string;
  category: string;
  serialNumber?: string; // For luxury watch NFT bonding
  owner: string; // PublicKey as base58 string
};

// Context type
type ListingsContextType = {
  listings: Listing[];
  addListing: (newListing: Omit<Listing, "id" | "owner" | "priceLamports">) => void;
};

const ListingsContext = createContext<ListingsContextType | undefined>(undefined);

export const ListingsProvider = ({ children }: { children: ReactNode }) => {
  const wallet = useWallet();
  const { publicKey } = wallet;

  const [listings, setListings] = useState<Listing[]>([
    {
      id: "1",
      title: "Luxury Rolex Watch",
      priceSol: "12 SOL",
      priceLamports: 12 * 10 ** 9, // Convert SOL to lamports
      image: "/images/rolex.png",
      description: "High-end Rolex with certificate.",
      category: "watches",
      serialNumber: "RLX123456",
      owner: "mockOwnerPublicKey", // Placeholder for testing
    },
    {
      id: "2",
      title: "Limited Edition Sneakers",
      priceSol: "8 SOL",
      priceLamports: 8 * 10 ** 9,
      image: "/sneaker.jpg",
      description: "Rare sneakers from 2023 drop.",
      category: "shoes",
      owner: "mockOwnerPublicKey",
    },
  ]);

  const addListing = (newListing: Omit<Listing, "id" | "owner" | "priceLamports">) => {
    if (!publicKey) {
      alert("Please connect your wallet to add a listing."); // Better UX than console.error
      return;
    }

    const priceLamports = parseFloat(newListing.priceSol) * 10 ** 9; // Convert SOL to lamports
    const newId = (listings.length + 1).toString(); // Temporary ID; replace with PDA later

    const listingWithOwner: Listing = {
      ...newListing,
      id: newId,
      priceLamports,
      owner: publicKey.toBase58(),
    };

    setListings((prevListings) => [...prevListings, listingWithOwner]);

    // TODO: Call Solana program to create escrow/NFT (placeholder for future)
    console.log(`Added listing ${newId} by ${publicKey.toBase58()}`);
  };

  return (
    <ListingsContext.Provider value={{ listings, addListing }}>
      {children}
    </ListingsContext.Provider>
  );
};

export const useListings = () => {
  const context = useContext(ListingsContext);
  if (!context) {
    throw new Error("useListings must be used within a ListingsProvider");
  }
  return context;
};