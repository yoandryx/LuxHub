import React, { useState } from "react";
import { useDropzone } from "react-dropzone";
import { CloudArrowUpIcon } from "@heroicons/react/24/outline"; // Import upload icon

export default function CreateListing() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [preview, setPreview] = useState(false);
  const [images, setImages] = useState<File[]>([]);

  const onDrop = (acceptedFiles: File[]) => {
    setImages((prevImages) => [...prevImages, ...acceptedFiles]);
  };

  const { getRootProps, getInputProps } = useDropzone({
    accept: { "image/*": [] },
    onDrop,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log({ title, description, price, images });
    setTitle("");
    setDescription("");
    setPrice("");
    setImages([]);
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

        {/* Styled Drag & Drop Box */}
        <div
          {...getRootProps()}
          className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-400 bg-gray-50 text-center cursor-pointer rounded-lg hover:bg-gray-200 transition w-full max-w-md"
        >
          <input {...getInputProps()} />
          <CloudArrowUpIcon className="w-6 h-6 text-gray-500 mb-2 mx-auto" /> {/* Upload icon */}
          <p className="text-gray-700">Drag & drop images here, or <span className="text-blue-500 font-semibold">click to upload</span></p>
        </div>

        {/* Image Previews */}
        {images.length > 0 && (
          <div className="mt-4">
            <h3 className="text-lg font-semibold">Preview</h3>
            <div className="flex flex-wrap gap-2">
              {images.map((file, index) => (
                <div key={index} className="relative">
                  <img src={URL.createObjectURL(file)} alt="Preview" className="w-24 h-24 object-cover rounded" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preview Toggle */}
        <button
          type="button"
          className="w-full bg-gray-500 text-white py-2 rounded mt-4 hover:bg-gray-600 transition"
          onClick={() => setPreview(!preview)}
        >
          {preview ? "Hide Preview" : "Show Preview"}
        </button>

        {/* Submit Button */}
        <button
          type="submit"
          className="w-full bg-blue-500 text-white py-2 rounded mt-4 hover:bg-blue-600 transition"
        >
          Create Listing
        </button>
      </form>

      {/* Listing Preview Section */}
      {preview && (
        <div className="mt-6 p-4 border bg-white shadow-md max-w-md w-full">
          <h2 className="text-xl font-bold mb-2">Listing Preview</h2>
          <p><strong>Title:</strong> {title || "Untitled"}</p>
          <p><strong>Description:</strong> {description || "No description provided."}</p>
          <p><strong>Price:</strong> {price ? `${price} SOL` : "Not set"}</p>

          {/* Preview Uploaded Images */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {images.map((file, index) => (
                <img key={index} src={URL.createObjectURL(file)} alt="Preview" className="w-24 h-24 object-cover rounded" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
