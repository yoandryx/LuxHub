// src/components/marketplace/BuyModal.tsx
// Modal for buyers to purchase an escrow listing with shipping address
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { FaShoppingCart, FaShippingFast, FaCheckCircle, FaLock } from 'react-icons/fa';
import { HiOutlineX } from 'react-icons/hi';
import { LuSparkles } from 'react-icons/lu';
import styles from '../../styles/BuyModal.module.css';

interface Escrow {
  escrowPda: string;
  nftMint?: string;
  listingPrice?: number;
  listingPriceUSD: number;
  asset?: {
    model?: string;
    brand?: string;
    imageUrl?: string;
    title?: string;
  };
  vendor?: {
    businessName?: string;
  };
}

interface ShippingAddress {
  fullName: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  deliveryInstructions: string;
}

interface BuyModalProps {
  escrow: Escrow;
  solPrice?: number;
  onClose: () => void;
  onSuccess?: () => void;
}

const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Germany',
  'France',
  'Switzerland',
  'Japan',
  'Australia',
  'Singapore',
  'Hong Kong',
  'United Arab Emirates',
];

const BuyModal: React.FC<BuyModalProps> = ({ escrow, solPrice = 100, onClose, onSuccess }) => {
  const { publicKey, connected } = useWallet();
  const [step, setStep] = useState<'details' | 'shipping' | 'confirm' | 'success'>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shipping, setShipping] = useState<ShippingAddress>({
    fullName: '',
    street1: '',
    street2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'United States',
    phone: '',
    email: '',
    deliveryInstructions: '',
  });

  const priceUSD = escrow.listingPriceUSD || 0;
  const priceSol = (priceUSD / solPrice).toFixed(2);
  const platformFee = priceUSD * 0.03; // 3% platform fee
  const totalUSD = priceUSD + platformFee;

  const isShippingValid =
    shipping.fullName.trim() &&
    shipping.street1.trim() &&
    shipping.city.trim() &&
    shipping.state.trim() &&
    shipping.postalCode.trim() &&
    shipping.country;

  const handlePurchase = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet');
      return;
    }

    if (!isShippingValid) {
      setError('Please complete all required shipping fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/escrow/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowPda: escrow.escrowPda,
          mintAddress: escrow.nftMint,
          buyerWallet: publicKey.toBase58(),
          shippingAddress: {
            fullName: shipping.fullName.trim(),
            street1: shipping.street1.trim(),
            street2: shipping.street2.trim() || undefined,
            city: shipping.city.trim(),
            state: shipping.state.trim(),
            postalCode: shipping.postalCode.trim(),
            country: shipping.country,
            phone: shipping.phone.trim() || undefined,
            email: shipping.email.trim() || undefined,
            deliveryInstructions: shipping.deliveryInstructions.trim() || undefined,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process purchase');
      }

      setStep('success');
      setTimeout(() => {
        onSuccess?.();
      }, 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>
          <HiOutlineX />
        </button>

        {/* Progress Steps */}
        <div className={styles.progressBar}>
          <div
            className={`${styles.progressStep} ${step !== 'success' ? styles.active : styles.completed}`}
          >
            <span className={styles.stepIcon}>1</span>
            <span className={styles.stepLabel}>Details</span>
          </div>
          <div className={styles.progressLine} />
          <div
            className={`${styles.progressStep} ${step === 'shipping' || step === 'confirm' ? styles.active : ''} ${step === 'success' ? styles.completed : ''}`}
          >
            <span className={styles.stepIcon}>2</span>
            <span className={styles.stepLabel}>Shipping</span>
          </div>
          <div className={styles.progressLine} />
          <div
            className={`${styles.progressStep} ${step === 'confirm' ? styles.active : ''} ${step === 'success' ? styles.completed : ''}`}
          >
            <span className={styles.stepIcon}>3</span>
            <span className={styles.stepLabel}>Confirm</span>
          </div>
        </div>

        {/* Step: Details */}
        {step === 'details' && (
          <div className={styles.stepContent}>
            <div className={styles.header}>
              <h2 className={styles.title}>
                <FaShoppingCart /> Purchase Item
              </h2>
              <p className={styles.subtitle}>Review item details before proceeding</p>
            </div>

            {/* Asset Preview */}
            <div className={styles.assetPreview}>
              <img
                src={escrow.asset?.imageUrl || '/images/purpleLGG.png'}
                alt={escrow.asset?.model}
                className={styles.assetImage}
              />
              <div className={styles.assetInfo}>
                <span className={styles.assetBrand}>{escrow.asset?.brand}</span>
                <h3 className={styles.assetModel}>{escrow.asset?.title || escrow.asset?.model}</h3>
                {escrow.vendor?.businessName && (
                  <span className={styles.vendorName}>Sold by {escrow.vendor.businessName}</span>
                )}
              </div>
            </div>

            {/* Price Breakdown */}
            <div className={styles.priceSection}>
              <div className={styles.priceRow}>
                <span>Item Price</span>
                <span className={styles.priceValue}>${priceUSD.toLocaleString()}</span>
              </div>
              <div className={styles.priceRow}>
                <span>Platform Fee (3%)</span>
                <span>${platformFee.toFixed(2)}</span>
              </div>
              <div className={`${styles.priceRow} ${styles.totalRow}`}>
                <span>Total</span>
                <div className={styles.totalValue}>
                  <span className={styles.totalUSD}>${totalUSD.toLocaleString()}</span>
                  <span className={styles.totalSol}>
                    <LuSparkles /> ~{(totalUSD / solPrice).toFixed(2)} SOL
                  </span>
                </div>
              </div>
            </div>

            <button className={styles.primaryBtn} onClick={() => setStep('shipping')}>
              Continue to Shipping
            </button>
          </div>
        )}

        {/* Step: Shipping */}
        {step === 'shipping' && (
          <div className={styles.stepContent}>
            <div className={styles.header}>
              <h2 className={styles.title}>
                <FaShippingFast /> Shipping Address
              </h2>
              <p className={styles.subtitle}>Where should we ship your item?</p>
            </div>

            <div className={styles.form}>
              <div className={styles.formRow}>
                <label className={styles.label}>
                  Full Name *
                  <input
                    type="text"
                    className={styles.input}
                    value={shipping.fullName}
                    onChange={(e) => setShipping({ ...shipping, fullName: e.target.value })}
                    placeholder="John Doe"
                  />
                </label>
              </div>

              <div className={styles.formRow}>
                <label className={styles.label}>
                  Street Address *
                  <input
                    type="text"
                    className={styles.input}
                    value={shipping.street1}
                    onChange={(e) => setShipping({ ...shipping, street1: e.target.value })}
                    placeholder="123 Main St"
                  />
                </label>
              </div>

              <div className={styles.formRow}>
                <label className={styles.label}>
                  Apt, Suite, Unit (Optional)
                  <input
                    type="text"
                    className={styles.input}
                    value={shipping.street2}
                    onChange={(e) => setShipping({ ...shipping, street2: e.target.value })}
                    placeholder="Apt 4B"
                  />
                </label>
              </div>

              <div className={styles.formGrid}>
                <label className={styles.label}>
                  City *
                  <input
                    type="text"
                    className={styles.input}
                    value={shipping.city}
                    onChange={(e) => setShipping({ ...shipping, city: e.target.value })}
                    placeholder="New York"
                  />
                </label>
                <label className={styles.label}>
                  State *
                  <input
                    type="text"
                    className={styles.input}
                    value={shipping.state}
                    onChange={(e) => setShipping({ ...shipping, state: e.target.value })}
                    placeholder="NY"
                  />
                </label>
              </div>

              <div className={styles.formGrid}>
                <label className={styles.label}>
                  Postal Code *
                  <input
                    type="text"
                    className={styles.input}
                    value={shipping.postalCode}
                    onChange={(e) => setShipping({ ...shipping, postalCode: e.target.value })}
                    placeholder="10001"
                  />
                </label>
                <label className={styles.label}>
                  Country *
                  <select
                    className={styles.select}
                    value={shipping.country}
                    onChange={(e) => setShipping({ ...shipping, country: e.target.value })}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className={styles.formGrid}>
                <label className={styles.label}>
                  Phone (for delivery)
                  <input
                    type="tel"
                    className={styles.input}
                    value={shipping.phone}
                    onChange={(e) => setShipping({ ...shipping, phone: e.target.value })}
                    placeholder="+1 555-123-4567"
                  />
                </label>
                <label className={styles.label}>
                  Email (for tracking)
                  <input
                    type="email"
                    className={styles.input}
                    value={shipping.email}
                    onChange={(e) => setShipping({ ...shipping, email: e.target.value })}
                    placeholder="john@example.com"
                  />
                </label>
              </div>

              <label className={styles.label}>
                Delivery Instructions (Optional)
                <textarea
                  className={styles.textarea}
                  value={shipping.deliveryInstructions}
                  onChange={(e) =>
                    setShipping({ ...shipping, deliveryInstructions: e.target.value })
                  }
                  placeholder="Leave at door, ring doorbell, etc."
                  rows={2}
                />
              </label>
            </div>

            <div className={styles.buttonRow}>
              <button className={styles.secondaryBtn} onClick={() => setStep('details')}>
                Back
              </button>
              <button
                className={styles.primaryBtn}
                onClick={() => setStep('confirm')}
                disabled={!isShippingValid}
              >
                Review Order
              </button>
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && (
          <div className={styles.stepContent}>
            <div className={styles.header}>
              <h2 className={styles.title}>
                <FaLock /> Confirm Purchase
              </h2>
              <p className={styles.subtitle}>Review and complete your order</p>
            </div>

            {/* Order Summary */}
            <div className={styles.summarySection}>
              <h4 className={styles.summaryTitle}>Order Summary</h4>
              <div className={styles.summaryItem}>
                <img
                  src={escrow.asset?.imageUrl || '/images/purpleLGG.png'}
                  alt={escrow.asset?.model}
                  className={styles.summaryImage}
                />
                <div className={styles.summaryInfo}>
                  <span className={styles.summaryModel}>
                    {escrow.asset?.title || escrow.asset?.model}
                  </span>
                  <span className={styles.summaryPrice}>${priceUSD.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className={styles.summarySection}>
              <h4 className={styles.summaryTitle}>Ship To</h4>
              <div className={styles.addressBlock}>
                <p>{shipping.fullName}</p>
                <p>{shipping.street1}</p>
                {shipping.street2 && <p>{shipping.street2}</p>}
                <p>
                  {shipping.city}, {shipping.state} {shipping.postalCode}
                </p>
                <p>{shipping.country}</p>
              </div>
            </div>

            {/* Escrow Protection Notice */}
            <div className={styles.escrowNotice}>
              <FaLock className={styles.escrowIcon} />
              <div className={styles.escrowText}>
                <strong>Escrow Protected</strong>
                <span>
                  Funds held securely until you confirm delivery. You have 7 days to inspect the
                  item.
                </span>
              </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.buttonRow}>
              <button className={styles.secondaryBtn} onClick={() => setStep('shipping')}>
                Back
              </button>
              <button className={styles.confirmBtn} onClick={handlePurchase} disabled={loading}>
                {loading ? 'Processing...' : `Pay $${totalUSD.toLocaleString()}`}
              </button>
            </div>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <div className={styles.stepContent}>
            <div className={styles.successContent}>
              <div className={styles.successIcon}>
                <FaCheckCircle />
              </div>
              <h2 className={styles.successTitle}>Purchase Successful!</h2>
              <p className={styles.successMessage}>
                Your order has been placed. The vendor will ship the item to your address.
              </p>
              <div className={styles.nextSteps}>
                <h4>What happens next?</h4>
                <ul>
                  <li>Vendor will prepare and ship your item</li>
                  <li>You'll receive tracking information via email</li>
                  <li>Confirm delivery once you receive the item</li>
                  <li>Funds released to vendor after confirmation</li>
                </ul>
              </div>
              <button className={styles.primaryBtn} onClick={onClose}>
                View My Orders
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BuyModal;
