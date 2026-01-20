// src/pages/escrow/[pda].tsx
// Escrow Detail Page - Shows complete escrow information and available actions
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/EscrowDetail.module.css';
import {
  FaArrowLeft,
  FaExternalLinkAlt,
  FaTruck,
  FaCheckCircle,
  FaClock,
  FaExclamationCircle,
  FaHandHoldingUsd,
  FaUsers,
} from 'react-icons/fa';
import WalletGuide from '../../components/common/WalletGuide';
import MakeOfferModal from '../../components/marketplace/MakeOfferModal';

interface Asset {
  _id: string;
  model?: string;
  serial?: string;
  brand?: string;
  priceUSD?: number;
  description?: string;
  imageUrl?: string;
  imageIpfsUrls?: string[];
  images?: string[];
  category?: string;
}

interface Participant {
  _id: string;
  wallet?: string;
  username?: string;
  email?: string;
  businessName?: string;
  verified?: boolean;
}

interface EscrowData {
  _id: string;
  escrowPda: string;
  nftMint?: string;
  status: string;
  saleMode?: string;
  acceptingOffers?: boolean;
  listingPrice?: number;
  listingPriceUSD?: number;
  minimumOffer?: number;
  minimumOfferUSD?: number;
  amountUSD?: number;
  royaltyAmount?: number;
  asset?: Asset;
  buyer?: Participant;
  seller?: Participant;
  sellerWallet?: string;
  shipmentStatus?: string;
  trackingCarrier?: string;
  trackingNumber?: string;
  shipmentProofUrls?: string[];
  shipmentSubmittedAt?: string;
  shipmentVerifiedAt?: string;
  convertedToPool?: boolean;
  poolId?: string;
  activeOfferCount?: number;
  highestOffer?: number;
  squadsTransactionIndex?: string;
  createdAt?: string;
  updatedAt?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  initiated: { label: 'Initiated', color: '#3b82f6', icon: <FaClock /> },
  listed: { label: 'Listed', color: '#8b5cf6', icon: <FaHandHoldingUsd /> },
  offer_accepted: { label: 'Offer Accepted', color: '#f59e0b', icon: <FaCheckCircle /> },
  funded: { label: 'Funded', color: '#10b981', icon: <FaCheckCircle /> },
  shipped: { label: 'Shipped', color: '#3b82f6', icon: <FaTruck /> },
  delivered: { label: 'Delivered', color: '#22c55e', icon: <FaCheckCircle /> },
  released: { label: 'Released', color: '#22c55e', icon: <FaCheckCircle /> },
  cancelled: { label: 'Cancelled', color: '#ef4444', icon: <FaExclamationCircle /> },
  failed: { label: 'Failed', color: '#ef4444', icon: <FaExclamationCircle /> },
  converted: { label: 'Converted to Pool', color: '#8b5cf6', icon: <FaUsers /> },
};

const EscrowDetailPage: React.FC = () => {
  const router = useRouter();
  const { pda } = router.query;
  const wallet = useWallet();

  const [escrow, setEscrow] = useState<EscrowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);

  const fetchEscrow = useCallback(async () => {
    if (!pda) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/escrow/${pda}`);
      const data = await res.json();

      if (data.success) {
        setEscrow(data.escrow);
      } else {
        setError(data.error || 'Failed to load escrow');
      }
    } catch (err) {
      console.error('Error fetching escrow:', err);
      setError('Failed to load escrow details');
    } finally {
      setLoading(false);
    }
  }, [pda]);

  useEffect(() => {
    fetchEscrow();
  }, [fetchEscrow]);

  const getTrackingUrl = (carrier: string, trackingNumber: string): string | null => {
    const urls: Record<string, string> = {
      fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
      ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
      dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
      usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    };
    return urls[carrier?.toLowerCase()] || null;
  };

  const getAssetImage = (): string => {
    if (escrow?.asset?.imageIpfsUrls?.[0]) return escrow.asset.imageIpfsUrls[0];
    if (escrow?.asset?.images?.[0]) return escrow.asset.images[0];
    if (escrow?.asset?.imageUrl) return escrow.asset.imageUrl;
    return '/placeholder-watch.png';
  };

  const handleMakeOffer = () => {
    if (!wallet.connected) {
      setShowWalletModal(true);
      return;
    }
    setShowOfferModal(true);
  };

  const statusConfig = escrow ? STATUS_CONFIG[escrow.status] || STATUS_CONFIG.initiated : null;

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>Loading escrow details...</p>
      </div>
    );
  }

  if (error || !escrow) {
    return (
      <div className={styles.errorContainer}>
        <FaExclamationCircle className={styles.errorIcon} />
        <h2>Escrow Not Found</h2>
        <p>{error || 'The requested escrow could not be found.'}</p>
        <Link href="/watchMarket" className={styles.backLink}>
          <FaArrowLeft /> Back to Marketplace
        </Link>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{escrow.asset?.model || 'Escrow'} | LuxHub</title>
        <meta
          name="description"
          content={`View escrow details for ${escrow.asset?.model || 'luxury asset'}`}
        />
      </Head>

      <div className={styles.pageContainer}>
        {/* Back Navigation */}
        <Link href="/watchMarket" className={styles.backLink}>
          <FaArrowLeft /> Back to Marketplace
        </Link>

        <div className={styles.contentGrid}>
          {/* Left Column - Asset Image & Info */}
          <div className={styles.leftColumn}>
            <div className={styles.imageCard}>
              <img
                src={getAssetImage()}
                alt={escrow.asset?.model || 'Asset'}
                className={styles.assetImage}
              />
              {escrow.asset?.imageIpfsUrls && escrow.asset.imageIpfsUrls.length > 1 && (
                <div className={styles.thumbnails}>
                  {escrow.asset.imageIpfsUrls.slice(0, 4).map((url, i) => (
                    <img key={i} src={url} alt={`View ${i + 1}`} className={styles.thumbnail} />
                  ))}
                </div>
              )}
            </div>

            {/* Asset Details */}
            <div className={styles.detailCard}>
              <h3>Asset Details</h3>
              <div className={styles.detailGrid}>
                {escrow.asset?.brand && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Brand</span>
                    <span className={styles.detailValue}>{escrow.asset.brand}</span>
                  </div>
                )}
                {escrow.asset?.model && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Model</span>
                    <span className={styles.detailValue}>{escrow.asset.model}</span>
                  </div>
                )}
                {escrow.asset?.serial && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Serial</span>
                    <span className={styles.detailValue}>{escrow.asset.serial}</span>
                  </div>
                )}
                {escrow.asset?.category && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Category</span>
                    <span className={styles.detailValue}>{escrow.asset.category}</span>
                  </div>
                )}
              </div>
              {escrow.asset?.description && (
                <div className={styles.description}>
                  <span className={styles.detailLabel}>Description</span>
                  <p>{escrow.asset.description}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Escrow Status & Actions */}
          <div className={styles.rightColumn}>
            {/* Title & Status */}
            <div className={styles.headerCard}>
              <h1>{escrow.asset?.model || 'Luxury Asset'}</h1>
              {escrow.seller?.businessName && (
                <p className={styles.vendorName}>
                  by {escrow.seller.businessName}
                  {escrow.seller.verified && <span className={styles.verifiedBadge}>Verified</span>}
                </p>
              )}

              <div className={styles.statusRow}>
                <span
                  className={styles.statusBadge}
                  style={{ backgroundColor: statusConfig?.color }}
                >
                  {statusConfig?.icon} {statusConfig?.label}
                </span>
                {escrow.saleMode && (
                  <span className={styles.modeBadge}>
                    {escrow.saleMode === 'accepting_offers'
                      ? 'Accepting Offers'
                      : escrow.saleMode === 'crowdfunded'
                        ? 'Crowdfunded'
                        : 'Fixed Price'}
                  </span>
                )}
              </div>
            </div>

            {/* Pricing Card */}
            <div className={styles.priceCard}>
              <div className={styles.priceRow}>
                <span className={styles.priceLabel}>Listing Price</span>
                <span className={styles.priceValue}>
                  ${(escrow.listingPriceUSD || escrow.amountUSD || 0).toLocaleString()}
                </span>
              </div>
              {escrow.acceptingOffers && escrow.minimumOfferUSD && (
                <div className={styles.priceRow}>
                  <span className={styles.priceLabel}>Minimum Offer</span>
                  <span className={styles.priceMinOffer}>
                    ${escrow.minimumOfferUSD.toLocaleString()}
                  </span>
                </div>
              )}
              {escrow.highestOffer && (
                <div className={styles.priceRow}>
                  <span className={styles.priceLabel}>Highest Offer</span>
                  <span className={styles.priceHighOffer}>
                    ${escrow.highestOffer.toLocaleString()}
                  </span>
                </div>
              )}
              {escrow.royaltyAmount && (
                <div className={styles.priceRow}>
                  <span className={styles.priceLabel}>Platform Fee (3%)</span>
                  <span className={styles.priceFee}>${escrow.royaltyAmount.toLocaleString()}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className={styles.actionButtons}>
                {(escrow.status === 'listed' || escrow.status === 'initiated') && (
                  <>
                    {escrow.acceptingOffers ? (
                      <button className={styles.primaryButton} onClick={handleMakeOffer}>
                        Make an Offer
                      </button>
                    ) : (
                      <button
                        className={styles.primaryButton}
                        onClick={() => !wallet.connected && setShowWalletModal(true)}
                      >
                        Buy Now
                      </button>
                    )}
                  </>
                )}
                {escrow.convertedToPool && escrow.poolId && (
                  <Link href={`/pool/${escrow.poolId}`} className={styles.poolButton}>
                    <FaUsers /> View Investment Pool
                  </Link>
                )}
              </div>
            </div>

            {/* Escrow Info Card */}
            <div className={styles.detailCard}>
              <h3>Escrow Information</h3>
              <div className={styles.infoList}>
                <div className={styles.infoRow}>
                  <span>Escrow PDA</span>
                  <a
                    href={`https://solscan.io/account/${escrow.escrowPda}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.addressLink}
                  >
                    {escrow.escrowPda.slice(0, 8)}...{escrow.escrowPda.slice(-8)}
                    <FaExternalLinkAlt />
                  </a>
                </div>
                {escrow.nftMint && (
                  <div className={styles.infoRow}>
                    <span>NFT Mint</span>
                    <a
                      href={`https://solscan.io/token/${escrow.nftMint}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.addressLink}
                    >
                      {escrow.nftMint.slice(0, 8)}...{escrow.nftMint.slice(-8)}
                      <FaExternalLinkAlt />
                    </a>
                  </div>
                )}
                {escrow.sellerWallet && (
                  <div className={styles.infoRow}>
                    <span>Seller Wallet</span>
                    <span className={styles.address}>
                      {escrow.sellerWallet.slice(0, 8)}...{escrow.sellerWallet.slice(-8)}
                    </span>
                  </div>
                )}
                {escrow.buyer?.wallet && (
                  <div className={styles.infoRow}>
                    <span>Buyer Wallet</span>
                    <span className={styles.address}>
                      {escrow.buyer.wallet.slice(0, 8)}...{escrow.buyer.wallet.slice(-8)}
                    </span>
                  </div>
                )}
                <div className={styles.infoRow}>
                  <span>Created</span>
                  <span>
                    {escrow.createdAt ? new Date(escrow.createdAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Shipment Tracking (if applicable) */}
            {(escrow.shipmentStatus || escrow.trackingNumber) && (
              <div className={styles.detailCard}>
                <h3>
                  <FaTruck /> Shipment Tracking
                </h3>
                <div className={styles.infoList}>
                  <div className={styles.infoRow}>
                    <span>Status</span>
                    <span className={styles.shipmentStatus}>
                      {escrow.shipmentStatus?.replace('_', ' ')}
                    </span>
                  </div>
                  {escrow.trackingCarrier && (
                    <div className={styles.infoRow}>
                      <span>Carrier</span>
                      <span>{escrow.trackingCarrier.toUpperCase()}</span>
                    </div>
                  )}
                  {escrow.trackingNumber && (
                    <div className={styles.infoRow}>
                      <span>Tracking #</span>
                      {getTrackingUrl(escrow.trackingCarrier || '', escrow.trackingNumber) ? (
                        <a
                          href={
                            getTrackingUrl(escrow.trackingCarrier || '', escrow.trackingNumber)!
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.trackingLink}
                        >
                          {escrow.trackingNumber} <FaExternalLinkAlt />
                        </a>
                      ) : (
                        <span>{escrow.trackingNumber}</span>
                      )}
                    </div>
                  )}
                  {escrow.shipmentVerifiedAt && (
                    <div className={styles.infoRow}>
                      <span>Verified</span>
                      <span>{new Date(escrow.shipmentVerifiedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
                {escrow.shipmentProofUrls && escrow.shipmentProofUrls.length > 0 && (
                  <div className={styles.proofSection}>
                    <span className={styles.detailLabel}>Proof Images</span>
                    <div className={styles.proofGrid}>
                      {escrow.shipmentProofUrls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`Proof ${i + 1}`} className={styles.proofImage} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Wallet Modal */}
        {showWalletModal && (
          <div className={styles.modalOverlay} onClick={() => setShowWalletModal(false)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <button className={styles.modalClose} onClick={() => setShowWalletModal(false)}>
                &times;
              </button>
              <p className={styles.modalMessage}>Connect your wallet to continue</p>
              <WalletGuide onConnected={() => setShowWalletModal(false)} showSteps={false} />
            </div>
          </div>
        )}

        {/* Make Offer Modal */}
        {showOfferModal && escrow && (
          <MakeOfferModal
            nft={{
              mintAddress: escrow.nftMint || '',
              title: escrow.asset?.model || 'Asset',
              escrowPda: escrow.escrowPda,
              minimumOfferUSD: escrow.minimumOfferUSD,
            }}
            onClose={() => setShowOfferModal(false)}
            onOfferSubmitted={() => {
              setShowOfferModal(false);
              fetchEscrow();
            }}
          />
        )}
      </div>
    </>
  );
};

export default EscrowDetailPage;
