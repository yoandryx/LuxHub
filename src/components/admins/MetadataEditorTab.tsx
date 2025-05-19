import { useState } from "react";
import { PublicKey, Connection } from "@solana/web3.js";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import { uploadToPinata } from "../../utils/pinata";
import { updateNftMetadata } from "../../utils/metadata";
import { useWallet } from "@solana/wallet-adapter-react";
import styles from "../../styles/MetadataEditorTab.module.css";
// import styles from "../../styles/AdminDashboard.module.css";

export const MetadataEditorTab = () => {
  const { connected, publicKey, signTransaction, sendTransaction, wallet } = useWallet();

  const [mintAddress, setMintAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [attributes, setAttributes] = useState<{ trait_type: string; value: string }[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [rawJson, setRawJson] = useState<object | null>(null);

  const fetchMetadata = async () => {
    try {
      setLoading(true);
      setError("");
      setRawJson(null);

      const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
      if (!endpoint?.startsWith("http")) throw new Error("Invalid Solana endpoint.");

      const connection = new Connection(endpoint);
      const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet!.adapter));
      const pubkey = new PublicKey(mintAddress.trim());
      const nft = await metaplex.nfts().findByMint({ mintAddress: pubkey });

      const res = await fetch(nft.uri);
      if (!res.ok) throw new Error("Failed to fetch metadata from URI");

      const json = await res.json();
      setRawJson(json);
      setName(json.name || "");
      setDescription(json.description || "");
      setImage(json.image || "");
      setAttributes(json.attributes || []);
    } catch (e) {
      console.error("❌ Fetch Error:", e);
      setError("❌ Failed to fetch metadata. Check the mint address.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (!connected || !publicKey || !wallet?.adapter) {
        setStatus("❌ Wallet not connected or adapter missing.");
        return;
      }

      // Step 1: Parse updated price from attributes
      let updatedPrice = 0;
      const priceAttr = attributes.find((a) => a.trait_type === "Price");
      if (priceAttr) {
        updatedPrice = parseFloat(priceAttr.value);
        if (isNaN(updatedPrice)) updatedPrice = 0;
      }

      // Step 2: Ensure attributes includes latest Price
      let updatedAttributes = attributes.map((a) =>
        a.trait_type === "Price"
          ? { ...a, value: updatedPrice.toString() }
          : a
      );

      if (!updatedAttributes.some((a) => a.trait_type === "Price")) {
        updatedAttributes.push({ trait_type: "Price", value: updatedPrice.toString() });
      }

      // Step 3: Build updated metadata
      const updatedMetadata = {
        name,
        description,
        image,
        attributes: updatedAttributes,
        priceSol: updatedPrice, // ✅ root-level field
        updatedAt: new Date().toISOString(),
        mintAddress: mintAddress.trim(),
      };

      // Step 4: Upload to Pinata and update on-chain
      setStatus("Uploading updated metadata to Pinata...");
      const newUri = await uploadToPinata(updatedMetadata, `Updated Metadata: ${name}`);
      console.log("New URI:", newUri);

      await updateNftMetadata(wallet.adapter, mintAddress, { uri: newUri });

      setStatus("Metadata updated on-chain!");
    } catch (e) {
      console.error("❌ Update Error:", e);
      setStatus("❌ Failed to update metadata.");
    }
  };


  const handleAttrChange = (index: number, field: string, value: string) => {
    const updated = [...attributes];
    updated[index] = { ...updated[index], [field]: value };
    setAttributes(updated);
  };

  const addAttribute = () => setAttributes([...attributes, { trait_type: "", value: "" }]);
  const removeAttribute = (index: number) => setAttributes(attributes.filter((_, i) => i !== index));

  return (
    <div className={styles.metadataEditorWrapper}>

      <div className={styles.metadataEditorContainer}>
        <h2 className={styles.sectionTitle}>Edit NFT Metadata</h2>

        <input
          className={styles.metadataInput}
          placeholder="Enter Mint Address..."
          value={mintAddress}
          onChange={(e) => setMintAddress(e.target.value)}
        />
        <button onClick={fetchMetadata} disabled={!mintAddress || loading}>
          {loading ? "Loading..." : "Fetch Metadata"}
        </button>

        {error && <p style={{ color: "red" }}>{error}</p>}
        {status && <p style={{ marginTop: "8px", color: status.includes("✅") ? "#00ffcc" : "salmon" }}>{status}</p>}

        {name && (
          <div className={styles.metadataEditorContent}>
            <input
              className={styles.metadataInput}
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <textarea
              className={styles.metadataInput}
              rows={3}
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <input
              className={styles.metadataInput}
              placeholder="Image URL"
              value={image}
              onChange={(e) => setImage(e.target.value)}
            />

            <h4 style={{ marginTop: "20px", color: "#fff" }}>Attributes</h4>
            {attributes.map((attr, i) => (
              <div key={i} className={styles.attributeRow}>
                <input
                  placeholder="Trait Type"
                  value={attr.trait_type}
                  onChange={(e) => handleAttrChange(i, "trait_type", e.target.value)}
                />
                <input
                  placeholder="Value"
                  value={attr.value}
                  onChange={(e) => handleAttrChange(i, "value", e.target.value)}
                />
                <button onClick={() => removeAttribute(i)}>✕</button>
              </div>
            ))}
            <button onClick={addAttribute}>+ Add Attribute</button>

            <button className={styles.saveButton} onClick={handleSave}>
              Save Metadata
            </button>

            {rawJson && (
              <details style={{ marginTop: "1rem" }}>
                <summary style={{ cursor: "pointer" }}>View Raw Metadata JSON</summary>
                <pre className={styles.jsonViewer}>{JSON.stringify(rawJson, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
