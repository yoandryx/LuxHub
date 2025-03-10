import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useListings } from "../context/src/ListingsContext";
import styles from "../styles/CreateNFT.module.css";

export default function CreateListing() {
    const { connected, publicKey } = useWallet(); // Access both connected status and publicKey
    const router = useRouter();
    const { addListing } = useListings();
    const [category, setCategory] = useState("");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("");
    const [image, setImage] = useState("");
    const [listingDetails, setListingDetails] = useState({
        title: "",
        description: "",
        priceSol: 0,
        serialNumber: "",
        image: "",
    });

    useEffect(() => {
        if (!connected || !publicKey) {
            router.push("/create-listing");
        }
    }, [connected, publicKey]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !description || !price || !category || !image) {
            alert("Please fill in all fields.");
            return;
        }

        if (!publicKey) {
            alert("Wallet is not connected.");
            return;
        }

        // Create new listing object
        const newListing = {
            id: Date.now().toString(), // Generate unique ID
            title,
            description,
            priceSol: parseFloat(price),
            serialNumber: "some-serial-number", // Replace with actual serial number generation or input
            image,
            owners: [publicKey.toBase58()], // Safely access publicKey and call toBase58()
        };

        addListing(newListing); // Add listing to context or database
        setTitle("");
        setDescription("");
        setPrice("");
        setImage("");
        setCategory("");
        router.push("/listings"); // Redirect to listings page after submission
    };

    // NFT Minting logic
    const handleAddListing = () => {
        if (!connected || !publicKey) {
            alert("Please connect your wallet.");
            return;
        }

        const newListing = {
            ...listingDetails,
            id: Date.now().toString(),  // Generate a temporary ID
            owner: publicKey ? publicKey.toBase58() : "",  // Check for publicKey being null
        };

        addListing(newListing); // Add the new listing with the required fields
    };

    if (!connected || !publicKey) {
        return (
            <p className={styles.restricted}>
                You must connect your wallet to create a listing.
            </p>
        );
    }

    return (
        <div className={styles.container}>

            {/* NFT Minting Section */}
            <div className={styles.addListing}>
                <h2>Create NFT Listing</h2>
                <input
                    type="text"
                    placeholder="Title"
                    onChange={(e) => setListingDetails({ ...listingDetails, title: e.target.value })}
                />
                <textarea
                    placeholder="Description"
                    onChange={(e) => setListingDetails({ ...listingDetails, description: e.target.value })}
                />
                <input
                    type="number"
                    placeholder="Price (SOL)"
                    onChange={(e) => setListingDetails({ ...listingDetails, priceSol: +e.target.value })}
                />
                <input
                    type="text"
                    placeholder="Serial Number"
                    onChange={(e) => setListingDetails({ ...listingDetails, serialNumber: e.target.value })}
                />
                <input
                    type="file"
                    onChange={(e) => setListingDetails({ ...listingDetails, image: e.target.value })}
                />
                <button onClick={handleAddListing}>Mint NFT & Create Listing</button>
            </div>
        </div>
    );
}
