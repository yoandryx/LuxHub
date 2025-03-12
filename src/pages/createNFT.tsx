import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useListings } from "../context/src/ListingsContext";
import styles from "../styles/CreateNFT.module.css";

export default function CreateListing() {
    const { connected, publicKey } = useWallet(); // Access both connected status and publicKey
    const router = useRouter();
    const { addListing } = useListings();
    const [listingDetails, setListingDetails] = useState({
        title: "",
        description: "",
        priceSol: 0,
        serialNumber: "",
        image: "",
    });

    useEffect(() => {
        if (!connected || !publicKey) {
            router.push("/createNFT");
        }
    }, [connected, publicKey]);

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
