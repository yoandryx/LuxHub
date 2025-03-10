import React, { useEffect } from 'react';
import { useListings } from '../context/src/ListingsContext'; // Import the context

const Listings = () => {
  const { listings, commitToBuy, settleEscrow } = useListings(); // Use listings from context
  
  useEffect(() => {
    // Any additional logic to load the listings, if needed
  }, [listings]);

  return (
    <div className="listings-container">
      {listings.length > 0 ? (
        listings.map((listing) => (
          <div key={listing.id} className="listing-item">
            <h3>{listing.title}</h3>
            <p>{listing.description}</p>
            <p>Price: {listing.priceSol} SOL</p>
            <p>Serial Number: {listing.serialNumber}</p>
            <div className="buttons">
              <button onClick={() => commitToBuy(listing.id)}>Buy</button>
              <button onClick={() => settleEscrow(listing.id)}>Confirm Delivery</button>
            </div>
          </div>
        ))
      ) : (
        <p>No listings available</p>
      )}
    </div>
  );
};

export default Listings;
