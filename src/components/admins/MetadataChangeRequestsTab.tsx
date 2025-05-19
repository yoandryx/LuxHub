// src/components/admins/MetadataChangeRequestsTab.tsx
import React, { useEffect, useState } from "react";
import styles from "../../styles/AdminDashboard.module.css";
import { updateNftMetadata } from "../../utils/metadata";
import { uploadToPinata } from "../../utils/pinata";
import { CiSearch } from "react-icons/ci";

interface ChangeRequest {
  _id: string;
  mintAddress: string;
  seller: string;
  requestedChanges: {
    title?: string;
    description?: string;
    priceSol?: string;
  };
  status: string;
  timestamp: number;
}

export const MetadataChangeRequestsTab = ({ wallet }: { wallet: any }) => {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [sellerFilter, setSellerFilter] = useState("");
  
  const filteredRequests = requests.filter((r) => r.status === activeTab);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await fetch("/api/nft/getMetadataRequests");
        const data = await res.json();
        setRequests(data.requests || []);
      } catch (err) {
        console.error("Error fetching metadata change requests", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, []);

  const approveRequest = async (request: ChangeRequest) => {
    try {
      const res = await fetch(`/api/nft/${request.mintAddress}`);
      const currentMetadata = await res.json();

      const updatedMetadata = {
        ...currentMetadata,
        name: request.requestedChanges?.title ?? currentMetadata.name,
        description: request.requestedChanges?.description ?? currentMetadata.description,
        priceSol:
          request.requestedChanges?.priceSol !== undefined
            ? Number(request.requestedChanges.priceSol)
            : currentMetadata.priceSol,
        updatedAt: new Date().toISOString(),
        attributes: (currentMetadata.attributes || []).map((attr: any) => {
          if (attr.trait_type === "Price" && request.requestedChanges?.priceSol !== undefined) {
            return { ...attr, value: request.requestedChanges.priceSol };
          }
          return attr;
        }),
      };

      const newUri = await uploadToPinata(updatedMetadata, updatedMetadata.name);

      await updateNftMetadata(wallet, request.mintAddress, {
        uri: newUri,
        name: updatedMetadata.name,
      });

      await fetch("/api/nft/markRequestApproved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request._id }),
      });

      setRequests((prev) => prev.filter((r) => r._id !== request._id));
    } catch (err) {
      console.error("Approve metadata change error:", err);
    }
  };

  const rejectRequest = async (request: ChangeRequest) => {
    try {
      const res = await fetch("/api/nft/markRequestRejected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request._id }),
      });

      if (!res.ok) throw new Error("Failed to mark request as rejected");

      setRequests((prev) => prev.filter((r) => r._id !== request._id));
    } catch (err) {
      console.error("Reject metadata change error:", err);
    }
  };

  return (
    <div>
      <div className={styles.subTabWrapper}>
        {["pending", "approved", "rejected"].map((tab) => (
          <button
            key={tab}
            className={`${styles.subTab} ${activeTab === tab ? styles.subTabActive : ""}`}
            onClick={() => setActiveTab(tab as any)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <h2 className={styles.sectionTitle}>Metadata Change Requests</h2>

      <div className={styles.inputGroupContainer}>
        <div className={styles.inputGroup}>

          <div className={styles.searchContainer}>
            <button onClick={() => "fetchSaleRequests(1, sellerFilter)"}><CiSearch className={styles.searchIcon} /></button>
            <input type="text" placeholder="Filter by Seller Wallet" value={sellerFilter} className={styles.searchBar} onChange={(e) => setSellerFilter(e.target.value)} />
          </div>

        </div>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          {filteredRequests.length === 0 ? (
            <p>No {activeTab} requests found.</p>
          ) : (
            filteredRequests.map((req) => (
              <div key={req._id} className={styles.listingCard}>
                {activeTab === "pending" && <p className={styles.statusBadge}>PENDING</p>}
                {activeTab === "approved" && <p className={styles.statusBadge}>APPROVED</p>}
                {activeTab === "rejected" && <p className={styles.statusBadge}>REJECTED</p>}
                <div className={styles.listingCardInfo}>
                  <p><strong>Mint Address:</strong> {req.mintAddress.slice(0,4)} . . . {req.mintAddress.slice(-4)}</p>
                  <p><strong>Seller:</strong> {req.seller.slice(0,4)} . . . {req.seller.slice(-4)}</p>
                  <p><strong>Status:</strong> {req.status}</p>
                  <p><strong>Submitted:</strong> {new Date(req.timestamp).toLocaleString()}</p>
                  <p><strong>Title:</strong> {req.requestedChanges?.title}</p>
                  <p><strong>Description:</strong> {req.requestedChanges?.description}</p>
                  <p><strong>Price (SOL):</strong> {req.requestedChanges?.priceSol}</p>

                  {activeTab === "pending" && (
                    <div className={styles.actions}>
                      <button onClick={() => approveRequest(req)}>Approve & Update</button>
                      <button className={styles.rejectBtn} onClick={() => rejectRequest(req)}>Reject</button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
};
