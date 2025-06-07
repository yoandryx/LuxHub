import React, { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../../styles/VendorManagementPanel.module.css";

interface VendorProfile {
  wallet: string;
  name: string;
  username: string;
  avatarUrl?: string;
  bannerUrl?: string;
  verified?: boolean;
}

interface Props {
  wallet?: any;
}

const VendorManagementPanel: React.FC<Props> = ({ wallet }) => {
  const [pendingVendors, setPendingVendors] = useState<VendorProfile[]>([]);
  const [approvedVendors, setApprovedVendors] = useState<VendorProfile[]>([]);
  const [vendorWalletInput, setVendorWalletInput] = useState("");
  const [expirationInput, setExpirationInput] = useState("");
  const [vendorMessage, setVendorMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [latestInvite, setLatestInvite] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPendingVendors();
    fetchApprovedVendors();
  }, []);

  useEffect(() => {
    if (vendorMessage) {
      const timer = setTimeout(() => setVendorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [vendorMessage]);

  const fetchPendingVendors = async () => {
    const res = await fetch("/api/vendor/pending");
    const data = await res.json();
    setPendingVendors(data.vendors || []);
  };

  const fetchApprovedVendors = async () => {
    const res = await fetch("/api/vendor/approved");
    const data = await res.json();
    setApprovedVendors(data.vendors || []);
  };

  const isValidBase58 = (str: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str);

  const toggleVerification = async (wallet: string, verified: boolean) => {
    setLoading(true);
    const res = await fetch("/api/vendor/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet, verified: !verified }),
    });
    if (res.ok) {
      setVendorMessage({
        type: "success",
        text: `Vendor ${!verified ? "verified" : "unverified"}.`,
      });
      fetchApprovedVendors();
    }
    setLoading(false);
  };

  const approveVendor = async (wallet: string) => {
    setLoading(true);
    const res = await fetch("/api/vendor/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    const data = await res.json();
    if (res.ok) {
      navigator.clipboard.writeText(`${window.location.origin}/vendor/${wallet}`);
      setVendorMessage({ type: "success", text: `Approved!\nCopied link.` });
      fetchPendingVendors();
    } else {
      setVendorMessage({ type: "error", text: data.error || "Failed to approve vendor." });
    }
    setLoading(false);
  };

  const rejectVendor = async (wallet: string) => {
    setLoading(true);
    const res = await fetch("/api/vendor/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    if (res.ok) {
      setVendorMessage({ type: "success", text: "Rejected vendor." });
      fetchPendingVendors();
    }
    setLoading(false);
  };

  const deleteVendor = async (wallet: string) => {
    setLoading(true);
    const res = await fetch("/api/vendor/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    if (res.ok) {
      setVendorMessage({ type: "success", text: "Deleted vendor." });
      fetchApprovedVendors();
    }
    setLoading(false);
  };

  const handleGenerateInvite = async () => {
    if (!vendorWalletInput || !wallet?.publicKey) {
      setVendorMessage({ type: "error", text: "Missing wallet info." });
      return;
    }

    if (!isValidBase58(vendorWalletInput)) {
      setVendorMessage({ type: "error", text: "Invalid wallet address format." });
      return;
    }

    setLoading(true);

    const res = await fetch("/api/vendor/generateInvite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorWallet: vendorWalletInput,
        expiresAt: expirationInput || null,
        adminWallet: wallet.publicKey.toBase58(),
      }),
    });

    const data = await res.json();

    if (data.code) {
      const link = `${window.location.origin}/vendor/onboard?v=${data.code}`;
      navigator.clipboard.writeText(link);
      setLatestInvite(link);
      setVendorMessage({ type: "success", text: `Invite copied!\n${link}` });
      setVendorWalletInput("");
      setExpirationInput("");
    } else {
      setVendorMessage({ type: "error", text: "Failed to generate invite." });
    }

    setLoading(false);
  };

  return (
    <div className={styles.panelWrapper}>
      <h1 className={styles.sectionTitle}>Vendor Approvals</h1>

      {vendorMessage && (
        <div className={`${styles.notification} ${styles[vendorMessage.type]}`}>
          {vendorMessage.text}
        </div>
      )}

      <h2 className={styles.subTitle}>Pending Vendors</h2>
      <div className={styles.grid}>
        {pendingVendors.map((vendor, idx) => (
          <div key={idx} className={styles.card}>
            {vendor.bannerUrl && <img src={vendor.bannerUrl} className={styles.banner} />}
            <div className={styles.cardInfo}>
              <p className={styles.username}>@{vendor.username}</p>
              <p className={styles.name}>{vendor.name}</p>
            </div>
            <div className={styles.buttonGroup}>
              <button disabled={loading} onClick={() => approveVendor(vendor.wallet)}>Approve</button>
              <button className={styles.rejectButton} disabled={loading} onClick={() => rejectVendor(vendor.wallet)}>Reject</button>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.inviteCard}>
        <h3>Generate Invite</h3>
        <div className={styles.inputGroup}>
          <input
            type="text"
            placeholder="Vendor wallet address"
            value={vendorWalletInput}
            onChange={(e) => setVendorWalletInput(e.target.value)}
          />
          <input
            type="datetime-local"
            value={expirationInput}
            onChange={(e) => setExpirationInput(e.target.value)}
          />
          <button disabled={loading} onClick={handleGenerateInvite}>Generate Invite</button>
          {latestInvite && (
            <div
              className={styles.latestInvite}
              onClick={() => {
                navigator.clipboard.writeText(latestInvite);
                setVendorMessage({ type: "success", text: "Invite copied again!" });
              }}
            >
              📎 <strong>Latest Invite:</strong> {latestInvite} <br />
              <small>Tap to copy</small>
            </div>
          )}
        </div>
      </div>

      <h2 className={styles.subTitle}>Approved Vendors</h2>
      <div className={styles.grid}>
        {approvedVendors.map((vendor, idx) => (
          <div key={idx} className={styles.card}>
            {vendor.bannerUrl && <img src={vendor.bannerUrl} className={styles.banner} />}
            <div className={styles.cardInfo}>
              <p className={styles.username}>@{vendor.username}</p>
              <p className={styles.name}>{vendor.name}</p>
            </div>
            <div className={styles.buttonGroup}>
              <Link href={`/vendor/${vendor.wallet}`}>
                <button>View</button>
              </Link>
              <button
                className={styles.verifyButton}
                disabled={loading}
                onClick={() => toggleVerification(vendor.wallet, vendor.verified || false)}
              >
                {vendor.verified ? "Unverify" : "Verify"}
              </button>
              <button
                className={styles.rejectButton}
                disabled={loading}
                onClick={() => deleteVendor(vendor.wallet)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VendorManagementPanel;
