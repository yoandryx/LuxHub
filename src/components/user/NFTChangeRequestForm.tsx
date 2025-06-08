// src/components/user/NFTChangeRequestForm.tsx
import React, { useState, useEffect } from "react";
import styles from "../../styles/SellerDashboard.module.css";
import { NFT } from "../../pages/sellerDashboard";
import NFTPreviewCard from "../admins/NFTPreviewCard"; // Reuse this preview
import RadixSelect from "../admins/RadixSelect";
import { useWallet } from "@solana/wallet-adapter-react";

interface Props {
  nfts: NFT[];
}

const NFTChangeRequestForm: React.FC<Props> = ({ nfts }) => {
  const [selected, setSelected] = useState<NFT | null>(null);
  const [selectedMint, setSelectedMint] = useState("");
  const [formData, setFormData] = useState({ title: "", description: "", priceSol: "" });
  const [submitted, setSubmitted] = useState(false);
  const [existingRequests, setExistingRequests] = useState<string[]>([]);

  const wallet = useWallet();

  const isFormChanged =
  formData.title !== selected?.title ||
  formData.description !== selected?.description ||
  parseFloat(formData.priceSol) !== selected?.salePrice;

  const refreshUserRequests = async () => {
    if (!wallet.publicKey) return;

    try {
      const res = await fetch(`/api/nft/getMetadataRequests?seller=${wallet.publicKey.toBase58()}`);
      const data = await res.json();
      const pendingMints = data.requests
        .filter((r: any) => r.status === "pending")
        .map((r: any) => r.mintAddress);

      setExistingRequests(pendingMints);
    } catch (err) {
      console.error("Failed to refresh user's requests", err);
    }
  };

  const handleSubmit = async () => {
    if (!selected || !wallet.publicKey) return;

    const payload = {
      mintAddress: selected.mintAddress,
      seller: wallet.publicKey.toBase58(),
      requestedChanges: {
        title: formData.title,
        description: formData.description,
        priceSol: parseFloat(formData.priceSol),
      },
      status: "pending",
      timestamp: Date.now(),
    };

    try {
      const res = await fetch("/api/nft/requestMetadataChange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to submit request");

      setSubmitted(true);
      await refreshUserRequests(); // ✅ Refresh after successful request
    } catch (err) {
      console.error("❌ Failed to submit metadata change request:", err);
      alert("Failed to submit. Please try again.");
    }
  };

  useEffect(() => {
    const fetchUserRequests = async () => {
      if (!wallet.publicKey) return;

      try {
        const res = await fetch(`/api/nft/getMetadataRequests?seller=${wallet.publicKey.toBase58()}`);
        const data = await res.json();
        const pendingMints = data.requests
          .filter((r: any) => r.status === "pending")
          .map((r: any) => r.mintAddress);

        setExistingRequests(pendingMints);
      } catch (err) {
        console.error("Failed to fetch user's existing requests", err);
      }
    };

    fetchUserRequests();
  }, [wallet.publicKey]);

  useEffect(() => {
    if (!selectedMint) return;
    const nft = nfts.find((n) => n.mintAddress === selectedMint);
    if (nft) {
        setSelected(nft);
        setFormData({
            title: nft.title,
            description: nft.description,
            priceSol: nft.salePrice.toString(),
        });
        setSubmitted(false);
    }
  }, [selectedMint]);

  return (
    <div>
      <h2>Request Metadata Change</h2>
        <RadixSelect
        value={selected?.mintAddress || ""}
        onValueChange={(val) => {
            const nft = nfts.find(n => n.mintAddress === val);
            if (nft) {
            setSelected(nft);
            setFormData({
                title: nft.title,
                description: nft.description,
                priceSol: nft.salePrice.toString()
            });
            setSubmitted(false);
            }
        }}
        placeholder="Select NFT"
        options={nfts.map(nft => ({
            label: `${nft.title} (${nft.mintAddress.slice(0, 4)}...)`,
            value: nft.mintAddress
        }))}
        />



      {selected && (
        <>
          <div className={styles.previewContainer}>
            <div className={styles.prevWrapper}>
              <h4>Current</h4>
              <NFTPreviewCard
                fileCid={selected.fileCid}
                title={formData.title}
                description={formData.description}
                priceSol={parseFloat(formData.priceSol)}
                brand={selected.attributes?.find(attr => attr.trait_type === "Brand")?.value}
                />
            </div>

            <div>
              <h4>Details</h4>
              <div className={styles.formSection}>
                <div className={styles.formFieldWrapper}>
                    <label className={styles.formLabel}>Title</label>
                    <small className={styles.formHint}>Enter a new name for this NFT</small>
                    <input
                    className={styles.formInput}
                    type="text"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    />
                </div>

                <div className={styles.formFieldWrapper}>
                    <label className={styles.formLabel}>Description</label>
                    <small className={styles.formHint}>Describe the watch or reason for update</small>
                    <textarea
                    className={styles.formInput}
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    />
                </div>

                <div className={styles.formFieldWrapper}>
                    <label className={styles.formLabel}>Sale Price (SOL)</label>
                    <small className={styles.formHint}>New price in SOL</small>
                    <input
                    className={styles.formInput}
                    type="number"
                    value={formData.priceSol}
                    onChange={e => setFormData({ ...formData, priceSol: e.target.value })}
                    />
                </div>
                </div>

                <button className={styles.submitButton} onClick={handleSubmit} disabled={existingRequests.includes(selected.mintAddress)}>
                  {existingRequests.includes(selected.mintAddress)
                    ? "Request Pending"
                    : "Submit Request"}
                </button>

                {submitted && <p className={styles.successMsg}>Request submitted successfully.</p>}

            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NFTChangeRequestForm;
