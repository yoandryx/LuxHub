import React, { createContext, useContext, useState, ReactNode } from "react";

// Define listing type
type Listing = {
  id: string;
  title: string;
  description: string;
  price: string;
  image: string;
  category: string;
};

// Context type
type ListingsContextType = {
  listings: Listing[];
  addListing: (newListing: Listing) => void;
};

// Create Context
const ListingsContext = createContext<ListingsContextType | undefined>(undefined);

// Provider Component
export const ListingsProvider = ({ children }: { children: ReactNode }) => {
  const [listings, setListings] = useState<Listing[]>([
    { id: "1", title: "Luxury Watch", price: "12 SOL", image: "/images/watch.png", description: "High-end Rolex watch.", category: "watches" },
    { id: "2", title: "Sneakers", price: "8 SOL", image: "/sneaker.jpg", description: "Limited edition sneakers." , category: "shoes"},
  ]);

  const addListing = (newListing: Listing) => {
    setListings((prevListings) => [...prevListings, newListing]);
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
