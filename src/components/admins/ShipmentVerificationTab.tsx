// src/components/admins/ShipmentVerificationTab.tsx
// Admin tab for verifying vendor shipment proofs before releasing escrow funds
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/AdminDashboard.module.css';
import { toast } from 'react-toastify';

interface EscrowShipment {
  _id: string;
  escrowPda: string;
  asset: {
    _id: string;
    model: string;
    imageIpfsUrls?: string[];
    images?: string[];
  };
  buyer: {
    wallet: string;
    username?: string;
  };
  sellerWallet: string;
  listingPriceUSD: number;
  shipmentStatus: string;
  trackingCarrier: string;
  trackingNumber: string;
  shipmentProofUrls: string[];
  shipmentSubmittedAt: string;
  status: string;
}

interface ShipmentVerificationTabProps {
  onStatusChange?: () => void;
}

export const ShipmentVerificationTab: React.FC<ShipmentVerificationTabProps> = ({
  onStatusChange,
}) => {
  const wallet = useWallet();
  const [pendingShipments, setPendingShipments] = useState<EscrowShipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<EscrowShipment | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch escrows with pending shipment verification
  const fetchPendingShipments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/escrow/pending-shipments');
      if (!response.ok) throw new Error('Failed to fetch pending shipments');
      const data = await response.json();
      setPendingShipments(data.escrows || []);
    } catch (error: any) {
      console.error('[ShipmentVerificationTab] Error:', error);
      toast.error('Failed to load pending shipments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingShipments();
  }, [fetchPendingShipments]);

  // Get tracking URL
  const getTrackingUrl = (carrier: string, trackingNumber: string): string | null => {
    const urls: Record<string, string> = {
      fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
      ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
      dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
      usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    };
    return urls[carrier?.toLowerCase()] || null;
  };

  // Handle verification (approve or reject)
  const handleVerification = async (approved: boolean) => {
    if (!selectedShipment || !wallet.publicKey) {
      toast.error('Please select a shipment and connect wallet');
      return;
    }

    if (!approved && !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    setProcessingId(selectedShipment._id);
    try {
      const response = await fetch('/api/escrow/verify-shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowPda: selectedShipment.escrowPda,
          adminWallet: wallet.publicKey.toBase58(),
          approved,
          rejectionReason: approved ? undefined : rejectionReason,
          createConfirmDeliveryProposal: approved,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Verification failed');
      }

      if (approved) {
        toast.success('Shipment verified! confirm_delivery proposal created in Squads.');
        if (result.squadsProposal?.transactionIndex) {
          toast.info(`Squads proposal #${result.squadsProposal.transactionIndex} created`);
        }
      } else {
        toast.success('Shipment rejected. Vendor notified to resubmit.');
      }

      // Reset state and refresh
      setSelectedShipment(null);
      setRejectionReason('');
      fetchPendingShipments();
      onStatusChange?.();
    } catch (error: any) {
      console.error('[handleVerification] Error:', error);
      toast.error(error.message || 'Verification failed');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className={styles.tabContent}>
      <h2>Shipment Verification</h2>
      <p className={styles.description}>
        Review vendor shipment proofs and tracking information before releasing escrow funds.
      </p>

      {loading ? (
        <div className={styles.loading}>Loading pending shipments...</div>
      ) : pendingShipments.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No shipments pending verification</p>
        </div>
      ) : (
        <div className={styles.shipmentGrid}>
          {/* Shipment List */}
          <div className={styles.shipmentList}>
            <h3>Pending Shipments ({pendingShipments.length})</h3>
            {pendingShipments.map((shipment) => (
              <div
                key={shipment._id}
                className={`${styles.shipmentCard} ${selectedShipment?._id === shipment._id ? styles.selected : ''}`}
                onClick={() => setSelectedShipment(shipment)}
              >
                <div className={styles.shipmentHeader}>
                  <span className={styles.assetModel}>
                    {shipment.asset?.model || 'Unknown Asset'}
                  </span>
                  <span className={styles.status}>{shipment.shipmentStatus}</span>
                </div>
                <div className={styles.shipmentDetails}>
                  <p>
                    <strong>Carrier:</strong> {shipment.trackingCarrier?.toUpperCase()}
                  </p>
                  <p>
                    <strong>Tracking:</strong> {shipment.trackingNumber}
                  </p>
                  <p>
                    <strong>Submitted:</strong>{' '}
                    {new Date(shipment.shipmentSubmittedAt).toLocaleDateString()}
                  </p>
                  <p>
                    <strong>Amount:</strong> ${shipment.listingPriceUSD?.toFixed(2) || 'N/A'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Shipment Detail Panel */}
          {selectedShipment && (
            <div className={styles.shipmentDetail}>
              <h3>Verification Details</h3>

              {/* Asset Info */}
              <div className={styles.detailSection}>
                <h4>Asset</h4>
                {selectedShipment.asset?.imageIpfsUrls?.[0] && (
                  <img
                    src={selectedShipment.asset.imageIpfsUrls[0]}
                    alt={selectedShipment.asset.model}
                    className={styles.assetImage}
                  />
                )}
                <p>
                  <strong>Model:</strong> {selectedShipment.asset?.model}
                </p>
                <p>
                  <strong>Escrow PDA:</strong>{' '}
                  <code>{selectedShipment.escrowPda.slice(0, 20)}...</code>
                </p>
              </div>

              {/* Tracking Info */}
              <div className={styles.detailSection}>
                <h4>Tracking Information</h4>
                <p>
                  <strong>Carrier:</strong> {selectedShipment.trackingCarrier?.toUpperCase()}
                </p>
                <p>
                  <strong>Tracking Number:</strong> {selectedShipment.trackingNumber}
                </p>
                {getTrackingUrl(
                  selectedShipment.trackingCarrier,
                  selectedShipment.trackingNumber
                ) && (
                  <a
                    href={
                      getTrackingUrl(
                        selectedShipment.trackingCarrier,
                        selectedShipment.trackingNumber
                      )!
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.trackingLink}
                  >
                    View Tracking
                  </a>
                )}
              </div>

              {/* Proof Images */}
              <div className={styles.detailSection}>
                <h4>Proof Images ({selectedShipment.shipmentProofUrls?.length || 0})</h4>
                <div className={styles.proofImages}>
                  {selectedShipment.shipmentProofUrls?.map((url, index) => (
                    <a
                      key={index}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.proofLink}
                    >
                      <img
                        src={url}
                        alt={`Proof ${index + 1}`}
                        className={styles.proofImage}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder-image.png';
                        }}
                      />
                    </a>
                  ))}
                </div>
              </div>

              {/* Participants */}
              <div className={styles.detailSection}>
                <h4>Participants</h4>
                <p>
                  <strong>Seller:</strong>{' '}
                  <code>{selectedShipment.sellerWallet?.slice(0, 8)}...</code>
                </p>
                <p>
                  <strong>Buyer:</strong>{' '}
                  <code>{selectedShipment.buyer?.wallet?.slice(0, 8) || 'N/A'}...</code>
                </p>
              </div>

              {/* Rejection Reason (shown when rejecting) */}
              <div className={styles.detailSection}>
                <h4>Rejection Reason (if rejecting)</h4>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  className={styles.rejectionInput}
                  rows={3}
                />
              </div>

              {/* Action Buttons */}
              <div className={styles.actionButtons}>
                <button
                  className={styles.approveButton}
                  onClick={() => handleVerification(true)}
                  disabled={processingId === selectedShipment._id}
                >
                  {processingId === selectedShipment._id
                    ? 'Processing...'
                    : 'Approve & Create Proposal'}
                </button>
                <button
                  className={styles.rejectButton}
                  onClick={() => handleVerification(false)}
                  disabled={processingId === selectedShipment._id || !rejectionReason.trim()}
                >
                  Reject
                </button>
              </div>

              <p className={styles.note}>
                Approving will create a Squads proposal to execute confirm_delivery on-chain.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ShipmentVerificationTab;
