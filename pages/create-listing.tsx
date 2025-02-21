import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useState } from "react";
import styles from "../styles/Form.module.css";

export default function CreateListing() {
    const { connected } = useWallet();
    const router = useRouter();
    const [category, setCategory] = useState("");

    useEffect(() => {
        if (!connected) {
            router.push("/");
        }
    }, [connected]);

    if (!connected) return <p className={styles.restricted}>You must connect your wallet to create a listing.</p>;

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Create a New Listing</h2>
            <form className={styles.form}>
                <input type="text" placeholder="Enter asset title" className={styles.input} />
                <textarea placeholder="Describe your asset" className={styles.textarea}></textarea>
                <input type="number" placeholder="Enter price in SOL" className={styles.input} />
                
                <select className={styles.input} value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">Select Category</option>
                    <option value="watches">Watches</option>
                    <option value="shoes">Shoes</option>
                    <option value="collectibles">Collectibles</option>
                </select>

                <button className={styles.submitButton}>Create Listing</button>
            </form>
        </div>
    );
}

