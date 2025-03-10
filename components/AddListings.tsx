// components/AddListing.tsx

import { useState } from 'react';
import { useListings } from '../context/src/ListingsContext';

const AddListing = () => {
  const [title, setTitle] = useState('');
  const [priceSol, setPriceSol] = useState(0);
  const [serialNumber, setSerialNumber] = useState('');
  const [description, setDescription] = useState('');
  const { addListing } = useListings();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newListing = {
      id: '', // Will be auto-generated in the backend
      title,
      description,
      priceSol,
      serialNumber,
      owner: '', // This will be set later
    };

    addListing(newListing);
    setTitle('');
    setPriceSol(0);
    setSerialNumber('');
    setDescription('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        required
      />
      <input
        type="number"
        value={priceSol}
        onChange={(e) => setPriceSol(Number(e.target.value))}
        placeholder="Price in SOL"
        required
      />
      <input
        type="text"
        value={serialNumber}
        onChange={(e) => setSerialNumber(e.target.value)}
        placeholder="Serial Number"
        required
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        required
      />
      <button type="submit">Add Listing</button>
    </form>
  );
};

export default AddListing;
