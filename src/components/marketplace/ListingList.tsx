// components/ListingList.tsx

import { useListings } from '../../context/src/ListingsContext';

const ListingList = () => {
  const { listings } = useListings();

  return (
    <div>
      <h2>Listings</h2>
      {listings.length === 0 ? (
        <p>No listings available</p>
      ) : (
        listings.map((listing) => (
          <div key={listing.id}>
            <h3>{listing.title}</h3>
            <p>{listing.description}</p>
            <p>Price: {listing.priceSol} SOL</p>
            <p>Serial Number: {listing.serialNumber}</p>
          </div>
        ))
      )}
    </div>
  );
};

export default ListingList;
