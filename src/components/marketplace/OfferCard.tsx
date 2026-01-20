// src/components/marketplace/OfferCard.tsx
// Display an individual offer with actions
import React from 'react';
import styles from '../../styles/OfferCard.module.css';

interface CounterOffer {
  amount: number;
  amountUSD: number;
  from: string;
  fromType: 'buyer' | 'vendor';
  message?: string;
  at: string;
}

interface Offer {
  _id: string;
  escrowPda: string;
  assetModel?: string;
  assetImage?: string;
  escrowListingPrice?: number;
  offerAmount: number;
  offerPriceUSD: number;
  offerCurrency: string;
  message?: string;
  buyerWallet: string;
  buyerUsername?: string;
  vendorWallet: string;
  vendorName?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired' | 'auto_rejected';
  rejectionReason?: string;
  autoRejectedReason?: string;
  counterOffers?: CounterOffer[];
  latestCounterOffer?: CounterOffer;
  createdAt: string;
  respondedAt?: string;
  expiresAt?: string;
}

interface OfferCardProps {
  offer: Offer;
  viewMode: 'buyer' | 'vendor';
  onAccept?: (offerId: string) => void;
  onReject?: (offerId: string) => void;
  onCounter?: (offerId: string) => void;
  onWithdraw?: (offerId: string) => void;
}

const OfferCard: React.FC<OfferCardProps> = ({
  offer,
  viewMode,
  onAccept,
  onReject,
  onCounter,
  onWithdraw,
}) => {
  const statusColors: Record<string, string> = {
    pending: '#ffd700',
    accepted: '#00ff88',
    rejected: '#ff6b6b',
    countered: '#00bfff',
    expired: '#808080',
    auto_rejected: '#808080',
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateWallet = (wallet: string) => `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;

  const getOfferDifference = () => {
    if (!offer.escrowListingPrice) return null;
    const diff = offer.offerPriceUSD - offer.escrowListingPrice;
    const percent = ((diff / offer.escrowListingPrice) * 100).toFixed(1);
    return {
      amount: Math.abs(diff),
      percent: Math.abs(parseFloat(percent)),
      isBelow: diff < 0,
    };
  };

  const priceDiff = getOfferDifference();
  const canRespond = ['pending', 'countered'].includes(offer.status);

  return (
    <div className={styles.offerCard}>
      <div className={styles.header}>
        <div className={styles.assetInfo}>
          {offer.assetImage && (
            <img src={offer.assetImage} alt={offer.assetModel} className={styles.assetImage} />
          )}
          <div className={styles.assetDetails}>
            <h4 className={styles.assetModel}>{offer.assetModel || 'Luxury Watch'}</h4>
            <span className={styles.escrowPda}>{truncateWallet(offer.escrowPda)}</span>
          </div>
        </div>
        <div className={styles.statusBadge} style={{ backgroundColor: statusColors[offer.status] }}>
          {offer.status.replace('_', ' ')}
        </div>
      </div>

      <div className={styles.offerDetails}>
        <div className={styles.priceRow}>
          <div className={styles.priceBlock}>
            <span className={styles.priceLabel}>Offer</span>
            <span className={styles.priceValue}>${offer.offerPriceUSD.toLocaleString()}</span>
          </div>
          {offer.escrowListingPrice && (
            <div className={styles.priceBlock}>
              <span className={styles.priceLabel}>List Price</span>
              <span className={styles.priceValue}>
                ${offer.escrowListingPrice.toLocaleString()}
              </span>
            </div>
          )}
          {priceDiff && (
            <div className={styles.priceDiff}>
              <span
                className={`${styles.diffBadge} ${priceDiff.isBelow ? styles.below : styles.above}`}
              >
                {priceDiff.isBelow ? '-' : '+'}
                {priceDiff.percent}%
              </span>
            </div>
          )}
        </div>

        {offer.message && (
          <div className={styles.messageBox}>
            <span className={styles.messageLabel}>Message:</span>
            <p className={styles.messageText}>{offer.message}</p>
          </div>
        )}

        {offer.latestCounterOffer && (
          <div className={styles.counterOfferBox}>
            <span className={styles.counterLabel}>
              Counter from {offer.latestCounterOffer.fromType}:
            </span>
            <span className={styles.counterAmount}>
              ${offer.latestCounterOffer.amountUSD.toLocaleString()}
            </span>
            {offer.latestCounterOffer.message && (
              <p className={styles.counterMessage}>{offer.latestCounterOffer.message}</p>
            )}
          </div>
        )}

        {offer.rejectionReason && (
          <div className={styles.rejectionBox}>
            <span className={styles.rejectionLabel}>Reason:</span>
            <p className={styles.rejectionText}>{offer.rejectionReason}</p>
          </div>
        )}

        {offer.autoRejectedReason && (
          <div className={styles.rejectionBox}>
            <span className={styles.rejectionLabel}>Auto-rejected:</span>
            <p className={styles.rejectionText}>{offer.autoRejectedReason}</p>
          </div>
        )}
      </div>

      <div className={styles.meta}>
        <div className={styles.participant}>
          {viewMode === 'vendor' ? (
            <>
              <span className={styles.metaLabel}>From:</span>
              <span className={styles.metaValue}>
                {offer.buyerUsername || truncateWallet(offer.buyerWallet)}
              </span>
            </>
          ) : (
            <>
              <span className={styles.metaLabel}>To:</span>
              <span className={styles.metaValue}>
                {offer.vendorName || truncateWallet(offer.vendorWallet)}
              </span>
            </>
          )}
        </div>
        <div className={styles.timestamp}>
          <span>{formatDate(offer.createdAt)}</span>
          {offer.expiresAt && (
            <span className={styles.expires}>Expires: {formatDate(offer.expiresAt)}</span>
          )}
        </div>
      </div>

      {canRespond && (
        <div className={styles.actions}>
          {viewMode === 'vendor' && (
            <>
              <button className={styles.acceptButton} onClick={() => onAccept?.(offer._id)}>
                Accept
              </button>
              <button className={styles.counterButton} onClick={() => onCounter?.(offer._id)}>
                Counter
              </button>
              <button className={styles.rejectButton} onClick={() => onReject?.(offer._id)}>
                Reject
              </button>
            </>
          )}
          {viewMode === 'buyer' && offer.status === 'pending' && (
            <button className={styles.withdrawButton} onClick={() => onWithdraw?.(offer._id)}>
              Withdraw Offer
            </button>
          )}
          {viewMode === 'buyer' && offer.status === 'countered' && (
            <>
              <button className={styles.acceptButton} onClick={() => onAccept?.(offer._id)}>
                Accept Counter
              </button>
              <button className={styles.counterButton} onClick={() => onCounter?.(offer._id)}>
                Counter Again
              </button>
              <button className={styles.rejectButton} onClick={() => onReject?.(offer._id)}>
                Decline
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default OfferCard;
