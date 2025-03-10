import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useListings } from "../context/src/ListingsContext";
import styles from "../styles/Form.module.css";

export default function CreateListing() {

    const { connected } = useWallet();
    const router = useRouter();
    const { addListing } = useListings();
    const [category, setCategory] = useState("");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("");
    const [image, setImage] = useState("");

    useEffect(() => {
        if (!connected) {
            router.push("/create-listing");
        }
    }, [connected]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!title || !description || !price || !category || !image) {
            alert("Please fill in all fields.");
            return;
        }

        // Call addListing with the new listing data
        addListing({
            title,
            description,
            price,
            image,
            category,
        });

        // Clear form after submission
        setTitle("");
        setDescription("");
        setPrice("");
        setImage("");
        setCategory("");

        // Redirect to listings page
        router.push("/listings");
    };

    if (!connected)
        return (
            <p className={styles.restricted}>
                You must connect your wallet to create a listing.
            </p>
        );

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Create a New Listing</h2>
            <form className={styles.form} onSubmit={handleSubmit}>
                <input
                    type="text"
                    placeholder="Enter asset title"
                    className={styles.input}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
                <textarea
                    placeholder="Describe your asset"
                    className={styles.textarea}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                ></textarea>
                <input
                    type="number"
                    placeholder="Enter price in SOL"
                    className={styles.input}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Enter image URL"
                    className={styles.input}
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                />
                <select
                    className={styles.input}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                >
                    <option value="">Select Category</option>
                    <option value="watches">Watches</option>
                    <option value="shoes">Shoes</option>
                    <option value="collectibles">Collectibles</option>
                </select>
                <button className={styles.submitButton} type="submit">
                    Create Listing
                </button>
            </form>
        </div>
    );
}

