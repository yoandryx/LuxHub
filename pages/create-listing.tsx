import React, { useState } from 'react';

export default function CreateListing() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [preview, setPreview] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log({ title, description, price });
    // Reset form after submission (optional)
    setTitle('');
    setDescription('');
    setPrice('');
    setPreview(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-6">Create a New Listing</h1>
      
      {/* Form */}
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
        
        {/* Toggle preview mode */}
        <button
          type="button"
          className="w-full bg-gray-500 text-white py-2 rounded mb-2 hover:bg-gray-600 transition"
          onClick={() => setPreview(!preview)}
        >
          {preview ? "Hide Preview" : "Show Preview"}
        </button>

        {/* Submit button */}
        <button
          type="submit"
          className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 transition"
        >
          Create Listing
        </button>
      </form>

      {/* Preview Section */}
      {preview && (
        <div className="mt-6 p-4 border bg-white shadow-md max-w-md w-full">
          <h2 className="text-xl font-bold mb-2">Listing Preview</h2>
          <p><strong>Title:</strong> {title || "Untitled"}</p>
          <p><strong>Description:</strong> {description || "No description provided."}</p>
          <p><strong>Price:</strong> {price ? `${price} SOL` : "Not set"}</p>
        </div>
      )}
    </div>
  );
}
