import { useListings } from "../context/src/ListingsContext";

const Listings = () => {
  const { listings } = useListings(); // get listings from context

  return (
    <div>
      {listings.map((listing) => (
        <div key={listing.id}>
          <h3>{listing.title}</h3>
          <p>{listing.description}</p>
          <p>Price: {listing.priceSol} SOL</p>
          <p>Serial Number: {listing.serialNumber}</p>
          <p>Owner: {listing.owner}</p>
        </div>
      ))}
    </div>
  );
};

export default Listings;
