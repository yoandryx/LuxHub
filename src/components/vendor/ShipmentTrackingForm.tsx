// src/components/vendor/ShipmentTrackingForm.tsx
// Form for vendors to submit shipment tracking and proof for funded escrows
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/ShipmentTrackingForm.module.css';
import { FaTruck, FaCamera, FaCheckCircle, FaSpinner, FaExternalLinkAlt } from 'react-icons/fa';

interface Asset {
  _id: string;
  model?: string;
  priceUSD?: number;
  imageIpfsUrls?: string[];
  images?: string[];
}

interface EscrowItem {
  _id: string;
  escrowPda: string;
  asset?: Asset;
  status: string;
  shipmentStatus?: string;
  trackingCarrier?: string;
  trackingNumber?: string;
  shipmentProofUrls?: string[];
  amountUSD?: number;
  listingPriceUSD?: number;
}

const CARRIERS = [
  { value: 'fedex', label: 'FedEx' },
  { value: 'ups', label: 'UPS' },
  { value: 'dhl', label: 'DHL' },
  { value: 'usps', label: 'USPS' },
  { value: 'ontrac', label: 'OnTrac' },
  { value: 'lasership', label: 'LaserShip' },
  { value: 'purolator', label: 'Purolator' },
  { value: 'canada_post', label: 'Canada Post' },
  { value: 'royal_mail', label: 'Royal Mail' },
  { value: 'australia_post', label: 'Australia Post' },
  { value: 'japan_post', label: 'Japan Post' },
  { value: 'other', label: 'Other' },
];

const ShipmentTrackingForm: React.FC = () => {
  const wallet = useWallet();
  const [escrows, setEscrows] = useState<EscrowItem[]>([]);
  const [selectedEscrow, setSelectedEscrow] = useState<EscrowItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [trackingCarrier, setTrackingCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [uploadingProof, setUploadingProof] = useState(false);

  // Fetch vendor's escrows that need shipment tracking
  const fetchEscrows = useCallback(async () => {
    if (!wallet.publicKey) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/escrow/list?vendorWallet=${wallet.publicKey.toBase58()}&status=funded,shipped`
      );
      const data = await res.json();

      if (data.success) {
        // Filter to show only escrows that need tracking or have pending verification
        const relevantEscrows = (data.listings || []).filter(
          (e: EscrowItem) =>
            e.status === 'funded' || (e.status === 'shipped' && e.shipmentStatus !== 'verified')
        );
        setEscrows(relevantEscrows);
      } else {
        setError(data.error || 'Failed to fetch escrows');
      }
    } catch (err) {
      console.error('Error fetching escrows:', err);
      setError('Failed to load your escrows');
    } finally {
      setIsLoading(false);
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    fetchEscrows();
  }, [fetchEscrows]);

  // Handle proof image selection
  const handleProofSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const fileArray = Array.from(files).slice(0, 5); // Max 5 images
      setProofFiles(fileArray);
    }
  };

  // Upload proof images to IPFS
  const uploadProofToIPFS = async (): Promise<string[]> => {
    const urls: string[] = [];

    for (const file of proofFiles) {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/pinata/uploadImage', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Failed to upload proof image');
      }

      const data = await res.json();
      const ipfsUrl = `${process.env.NEXT_PUBLIC_GATEWAY_URL}${data.IpfsHash}`;
      urls.push(ipfsUrl);
    }

    return urls;
  };

  // Submit shipment tracking
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedEscrow || !wallet.publicKey) {
      setError('Please select an escrow and connect your wallet');
      return;
    }

    if (!trackingCarrier || !trackingNumber) {
      setError('Please enter carrier and tracking number');
      return;
    }

    if (proofFiles.length === 0) {
      setError('Please upload at least one proof image');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // Upload proof images to IPFS
      setUploadingProof(true);
      const proofUrls = await uploadProofToIPFS();
      setUploadingProof(false);

      // Submit shipment tracking
      const res = await fetch('/api/escrow/submit-shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowPda: selectedEscrow.escrowPda,
          vendorWallet: wallet.publicKey.toBase58(),
          trackingCarrier,
          trackingNumber,
          shipmentProofUrls: proofUrls,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Shipment tracking submitted successfully! Awaiting admin verification.');
        // Reset form
        setSelectedEscrow(null);
        setTrackingCarrier('');
        setTrackingNumber('');
        setProofFiles([]);
        // Refresh escrows
        fetchEscrows();
      } else {
        setError(data.error || 'Failed to submit shipment tracking');
      }
    } catch (err) {
      console.error('Error submitting shipment:', err);
      setError('Failed to submit shipment tracking');
    } finally {
      setIsSubmitting(false);
      setUploadingProof(false);
    }
  };

  // Get tracking link for carrier
  const getTrackingLink = (carrier: string, number: string): string | null => {
    const links: Record<string, string> = {
      fedex: `https://www.fedex.com/fedextrack/?trknbr=${number}`,
      ups: `https://www.ups.com/track?tracknum=${number}`,
      dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${number}`,
      usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`,
    };
    return links[carrier] || null;
  };

  if (!wallet.connected) {
    return (
      <div className={styles.container}>
        <p className={styles.connectPrompt}>Connect your wallet to manage shipments</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <FaTruck className={styles.headerIcon} />
        <h2>Shipment Tracking</h2>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {isLoading ? (
        <div className={styles.loading}>
          <FaSpinner className={styles.spinner} />
          <span>Loading escrows...</span>
        </div>
      ) : escrows.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No escrows requiring shipment tracking</p>
          <span>When a buyer purchases your listing, it will appear here for you to ship.</span>
        </div>
      ) : (
        <>
          {/* Escrow selection */}
          <div className={styles.escrowList}>
            <h3>Select an Escrow to Ship</h3>
            <div className={styles.escrowGrid}>
              {escrows.map((escrow) => (
                <div
                  key={escrow._id}
                  className={`${styles.escrowCard} ${
                    selectedEscrow?._id === escrow._id ? styles.selected : ''
                  }`}
                  onClick={() => setSelectedEscrow(escrow)}
                >
                  <div className={styles.escrowImage}>
                    {escrow.asset?.imageIpfsUrls?.[0] || escrow.asset?.images?.[0] ? (
                      <img
                        src={escrow.asset.imageIpfsUrls?.[0] || escrow.asset.images?.[0]}
                        alt={escrow.asset?.model || 'Asset'}
                      />
                    ) : (
                      <div className={styles.noImage}>No Image</div>
                    )}
                  </div>
                  <div className={styles.escrowInfo}>
                    <h4>{escrow.asset?.model || 'Unnamed Asset'}</h4>
                    <p className={styles.price}>
                      ${(escrow.listingPriceUSD || escrow.amountUSD || 0).toLocaleString()}
                    </p>
                    <span className={`${styles.statusBadge} ${styles[escrow.status]}`}>
                      {escrow.status}
                    </span>
                    {escrow.shipmentStatus && (
                      <span className={`${styles.shipmentBadge} ${styles[escrow.shipmentStatus]}`}>
                        {escrow.shipmentStatus.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  {escrow.trackingNumber && (
                    <div className={styles.existingTracking}>
                      <strong>{escrow.trackingCarrier?.toUpperCase()}</strong>
                      <span>{escrow.trackingNumber}</span>
                      {getTrackingLink(escrow.trackingCarrier || '', escrow.trackingNumber) && (
                        <a
                          href={
                            getTrackingLink(escrow.trackingCarrier || '', escrow.trackingNumber)!
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Track <FaExternalLinkAlt />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Shipment form */}
          {selectedEscrow && selectedEscrow.status === 'funded' && (
            <form onSubmit={handleSubmit} className={styles.form}>
              <h3>Submit Shipment Details</h3>
              <p className={styles.formDescription}>
                Ship the item to LuxHub custody and provide tracking information below.
              </p>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>Shipping Carrier *</label>
                  <select
                    value={trackingCarrier}
                    onChange={(e) => setTrackingCarrier(e.target.value)}
                    required
                  >
                    <option value="">Select carrier...</option>
                    {CARRIERS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Tracking Number *</label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="Enter tracking number"
                    required
                  />
                </div>

                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label>
                    <FaCamera /> Proof of Shipment * (max 5 images)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleProofSelect}
                    className={styles.fileInput}
                  />
                  <span className={styles.hint}>
                    Upload photos of the shipping label, receipt, and package
                  </span>
                  {proofFiles.length > 0 && (
                    <div className={styles.fileList}>
                      {proofFiles.map((file, idx) => (
                        <span key={idx} className={styles.fileName}>
                          {file.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <FaSpinner className={styles.spinner} />
                    {uploadingProof ? 'Uploading proof...' : 'Submitting...'}
                  </>
                ) : (
                  <>
                    <FaCheckCircle /> Submit Shipment
                  </>
                )}
              </button>
            </form>
          )}

          {selectedEscrow && selectedEscrow.status === 'shipped' && (
            <div className={styles.pendingVerification}>
              <FaCheckCircle className={styles.pendingIcon} />
              <h3>Awaiting Verification</h3>
              <p>
                Your shipment proof has been submitted. Our team will verify delivery and release
                funds once the item arrives at LuxHub custody.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ShipmentTrackingForm;
