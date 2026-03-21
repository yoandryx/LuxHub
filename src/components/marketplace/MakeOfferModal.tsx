// src/components/marketplace/MakeOfferModal.tsx
// Multi-step modal for buyers to make offers on escrow listings
// Steps: Offer Details → Shipping Address → Confirm & Submit
import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { SiSolana } from 'react-icons/si';
import { resolveImageUrl, handleImageError, PLACEHOLDER_IMAGE } from '../../utils/imageUtils';
import SavedAddressSelector, { SavedAddress } from '../common/SavedAddressSelector';
import styles from '../../styles/MakeOfferModal.module.css';

interface Escrow {
  escrowPda: string;
  listingPriceUSD: number;
  minimumOfferUSD?: number;
  asset?: {
    model?: string;
    imageUrl?: string;
  };
  vendor?: {
    businessName?: string;
  };
}

interface MakeOfferModalProps {
  escrow: Escrow;
  solPrice?: number; // USD per SOL for conversion display
  onClose: () => void;
  onSuccess?: () => void;
}

interface ShippingForm {
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

type Step = 'offer' | 'shipping' | 'confirm';

const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Australia',
  'Germany',
  'France',
  'Japan',
  'Switzerland',
  'Singapore',
  'United Arab Emirates',
  'Hong Kong',
  'Netherlands',
  'Italy',
  'Spain',
  'Sweden',
];

const emptyShipping: ShippingForm = {
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
};

const MakeOfferModal: React.FC<MakeOfferModalProps> = ({
  escrow,
  solPrice,
  onClose,
  onSuccess,
}) => {
  const { publicKey, connected } = useWallet();
  const [step, setStep] = useState<Step>('offer');

  // Offer state
  const [offerAmount, setOfferAmount] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'SOL'>('USD');
  const [message, setMessage] = useState('');
  const [expiresInHours, setExpiresInHours] = useState('24');

  // Shipping state
  const [selectedSavedAddress, setSelectedSavedAddress] = useState<SavedAddress | null>(null);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [shipping, setShipping] = useState<ShippingForm>(emptyShipping);
  const [saveNewAddress, setSaveNewAddress] = useState(false);
  const [addressLabel, setAddressLabel] = useState('Home');

  // Submission state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const rawAmount = parseFloat(offerAmount) || 0;
  const effectiveSolPrice = solPrice || 0;

  // Calculate USD amount regardless of input currency
  const amountUSD = currency === 'USD' ? rawAmount : rawAmount * effectiveSolPrice;
  const amountSOL =
    currency === 'SOL' ? rawAmount : effectiveSolPrice > 0 ? rawAmount / effectiveSolPrice : 0;

  const listPrice = escrow.listingPriceUSD;
  const difference = listPrice > 0 ? ((amountUSD - listPrice) / listPrice) * 100 : 0;
  // Platform minimum: 50% of listing price or vendor-set minimum, whichever is higher
  const platformMinUSD = listPrice * 0.5;
  const effectiveMinUSD = Math.max(platformMinUSD, escrow.minimumOfferUSD || 0);
  const isOfferValid = amountUSD >= effectiveMinUSD;

  // Display conversion in the other currency
  const conversionDisplay =
    currency === 'USD'
      ? amountSOL > 0
        ? `${amountSOL.toFixed(4)} SOL`
        : '---'
      : amountUSD > 0
        ? `$${amountUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '---';

  // Shipping validation
  const isNewAddressValid =
    shipping.fullName.trim() &&
    shipping.street1.trim() &&
    shipping.city.trim() &&
    shipping.state.trim() &&
    shipping.postalCode.trim() &&
    shipping.country;

  const isShippingValid =
    selectedSavedAddress !== null || (showNewAddressForm && isNewAddressValid);

  // When saved address selector auto-selects default, hide new form
  useEffect(() => {
    if (selectedSavedAddress) {
      setShowNewAddressForm(false);
    }
  }, [selectedSavedAddress]);

  const handleShippingChange = (field: keyof ShippingForm, value: string) => {
    setShipping((prev) => ({ ...prev, [field]: value }));
  };

  const getShippingAddress = () => {
    if (selectedSavedAddress) {
      return {
        fullName: selectedSavedAddress.fullName,
        street1: selectedSavedAddress.street1,
        street2: selectedSavedAddress.street2 || '',
        city: selectedSavedAddress.city,
        state: selectedSavedAddress.state,
        postalCode: selectedSavedAddress.postalCode,
        country: selectedSavedAddress.country,
        phone: selectedSavedAddress.phone || '',
        email: selectedSavedAddress.email || '',
        deliveryInstructions: selectedSavedAddress.deliveryInstructions || '',
      };
    }
    return {
      fullName: shipping.fullName.trim(),
      street1: shipping.street1.trim(),
      street2: shipping.street2.trim(),
      city: shipping.city.trim(),
      state: shipping.state.trim(),
      postalCode: shipping.postalCode.trim(),
      country: shipping.country,
      phone: shipping.phone.trim(),
      email: shipping.email.trim(),
      deliveryInstructions: shipping.deliveryInstructions.trim(),
    };
  };

  const handleSubmit = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet');
      return;
    }

    if (!isOfferValid || !isShippingValid) {
      setError('Please complete all required fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const shippingAddress = getShippingAddress();

      // Calculate lamports from USD amount
      const offerAmountLamports = Math.floor(amountSOL * 1e9);

      const response = await fetch('/api/offers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowPda: escrow.escrowPda,
          buyerWallet: publicKey.toBase58(),
          offerAmount: offerAmountLamports,
          offerPriceUSD: amountUSD,
          offerCurrency: 'SOL',
          message: message.trim() || undefined,
          expiresInHours: parseInt(expiresInHours) || 24,
          shippingAddress,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create offer');
      }

      // Save new address if checkbox is checked
      if (saveNewAddress && !selectedSavedAddress && isNewAddressValid) {
        try {
          await fetch('/api/addresses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet: publicKey.toBase58(),
              label: addressLabel || 'Home',
              ...shippingAddress,
            }),
          });
        } catch {
          // Fail gracefully - offer was already submitted
        }
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const goToStep = (nextStep: Step) => {
    setError(null);
    setStep(nextStep);
  };

  const steps: Step[] = ['offer', 'shipping', 'confirm'];
  const stepIndex = steps.indexOf(step);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.dragHandle} />
        <button className={styles.closeButton} onClick={onClose}>
          &times;
        </button>

        <div className={styles.header}>
          <h2 className={styles.title}>Make an Offer</h2>
          <p className={styles.subtitle}>
            {step === 'offer' && 'Set your offer price'}
            {step === 'shipping' && 'Where should we ship?'}
            {step === 'confirm' && 'Review and submit'}
          </p>
        </div>

        {/* Step Indicator */}
        <div className={styles.stepIndicator}>
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div
                className={`${styles.stepDot} ${i <= stepIndex ? styles.stepActive : ''} ${i < stepIndex ? styles.stepComplete : ''}`}
              >
                {i < stepIndex ? '✓' : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`${styles.stepLine} ${i < stepIndex ? styles.stepLineActive : ''}`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className={styles.stepLabels}>
          <span className={stepIndex >= 0 ? styles.stepLabelActive : ''}>Offer</span>
          <span className={stepIndex >= 1 ? styles.stepLabelActive : ''}>Shipping</span>
          <span className={stepIndex >= 2 ? styles.stepLabelActive : ''}>Confirm</span>
        </div>

        {/* Asset Preview — only show on offer step */}
        {step === 'offer' && (
          <div className={styles.assetPreview}>
            <img
              src={resolveImageUrl(escrow.asset?.imageUrl) || PLACEHOLDER_IMAGE}
              alt={escrow.asset?.model || 'Watch'}
              className={styles.assetImage}
              onError={handleImageError}
            />
            <div className={styles.assetInfo}>
              <h3 className={styles.assetModel}>{escrow.asset?.model || 'Luxury Watch'}</h3>
              {escrow.vendor?.businessName && (
                <span className={styles.vendorName}>by {escrow.vendor.businessName}</span>
              )}
              <div className={styles.listPrice}>
                <span className={styles.listPriceLabel}>List Price</span>
                <span className={styles.listPriceValue}>${listPrice.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {success ? (
          <div className={styles.successMessage}>
            <div className={styles.successIcon}>✓</div>
            <h3>Offer Submitted!</h3>
            <p>Your offer has been sent to the vendor.</p>
          </div>
        ) : (
          <>
            {/* ====== STEP 1: Offer Details ====== */}
            {step === 'offer' && (
              <>
                <div className={styles.inputSection}>
                  <div className={styles.labelRow}>
                    <label className={styles.inputLabel}>Your Offer</label>
                    <div className={styles.currencyToggle}>
                      <button
                        className={`${styles.currencyBtn} ${currency === 'USD' ? styles.currencyActive : ''}`}
                        onClick={() => {
                          setOfferAmount('');
                          setCurrency('USD');
                        }}
                        type="button"
                      >
                        USD
                      </button>
                      <button
                        className={`${styles.currencyBtn} ${currency === 'SOL' ? styles.currencyActive : ''}`}
                        onClick={() => {
                          setOfferAmount('');
                          setCurrency('SOL');
                        }}
                        type="button"
                      >
                        SOL
                      </button>
                    </div>
                  </div>
                  <div className={styles.amountInputWrapper}>
                    <span className={styles.currencySymbol}>
                      {currency === 'USD' ? '$' : <SiSolana size={18} />}
                    </span>
                    <input
                      type="number"
                      className={styles.amountInput}
                      placeholder="0.00"
                      value={offerAmount}
                      onChange={(e) => setOfferAmount(e.target.value)}
                      min="0"
                      step={currency === 'USD' ? '0.01' : '0.0001'}
                    />
                  </div>
                  {rawAmount > 0 && (
                    <span className={styles.solConversion}>
                      ≈ {conversionDisplay}{' '}
                      {effectiveSolPrice ? `@ $${effectiveSolPrice.toLocaleString()}/SOL` : ''}
                    </span>
                  )}
                  <span className={styles.minimumNote}>
                    Minimum offer: ${effectiveMinUSD.toLocaleString()} (50% of list price)
                  </span>
                  {amountUSD > 0 && amountUSD < effectiveMinUSD && (
                    <span className={styles.minimumNote} style={{ color: '#ef5350' }}>
                      Offer too low — must be at least ${effectiveMinUSD.toLocaleString()}
                    </span>
                  )}
                  {rawAmount > 0 && (
                    <div
                      className={`${styles.diffIndicator} ${difference < 0 ? styles.below : styles.above}`}
                    >
                      {difference < 0 ? '' : '+'}
                      {difference.toFixed(1)}% {difference < 0 ? 'below' : 'above'} list price
                    </div>
                  )}
                </div>

                <div className={styles.inputSection}>
                  <label className={styles.inputLabel}>Message (Optional)</label>
                  <textarea
                    className={styles.messageInput}
                    placeholder="Add a message to the vendor..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className={styles.inputSection}>
                  <label className={styles.inputLabel}>Offer Expires In</label>
                  <select
                    className={styles.select}
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(e.target.value)}
                  >
                    <option value="12">12 hours</option>
                    <option value="24">24 hours</option>
                    <option value="48">48 hours</option>
                    <option value="72">72 hours</option>
                    <option value="168">7 days</option>
                  </select>
                </div>

                {error && <p className={styles.error}>{error}</p>}

                {!connected ? (
                  <button className={styles.submitButton} disabled>
                    Connect Wallet to Make Offer
                  </button>
                ) : (
                  <button
                    className={styles.submitButton}
                    onClick={() => goToStep('shipping')}
                    disabled={!isOfferValid}
                  >
                    Continue to Shipping
                  </button>
                )}
              </>
            )}

            {/* ====== STEP 2: Shipping Address ====== */}
            {step === 'shipping' && (
              <>
                {/* Saved Address Selector */}
                <SavedAddressSelector
                  wallet={publicKey?.toBase58() || null}
                  onSelectAddress={(addr) => {
                    setSelectedSavedAddress(addr);
                    if (addr) setShowNewAddressForm(false);
                  }}
                  onAddNewClick={() => {
                    setSelectedSavedAddress(null);
                    setShowNewAddressForm(true);
                  }}
                  selectedAddressId={selectedSavedAddress?._id || null}
                  compact
                />

                {/* New Address Form */}
                {showNewAddressForm && (
                  <div className={styles.addressForm}>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Full Name *</label>
                        <input
                          className={styles.formInput}
                          value={shipping.fullName}
                          onChange={(e) => handleShippingChange('fullName', e.target.value)}
                          placeholder="John Doe"
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Phone</label>
                        <input
                          className={styles.formInput}
                          value={shipping.phone}
                          onChange={(e) => handleShippingChange('phone', e.target.value)}
                          placeholder="+1 (555) 123-4567"
                        />
                      </div>
                    </div>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup} style={{ flex: 3 }}>
                        <label className={styles.inputLabel}>Street Address *</label>
                        <input
                          className={styles.formInput}
                          value={shipping.street1}
                          onChange={(e) => handleShippingChange('street1', e.target.value)}
                          placeholder="123 Main St"
                        />
                      </div>
                      <div className={styles.formGroup} style={{ flex: 1 }}>
                        <label className={styles.inputLabel}>Apt/Unit</label>
                        <input
                          className={styles.formInput}
                          value={shipping.street2}
                          onChange={(e) => handleShippingChange('street2', e.target.value)}
                          placeholder="4B"
                        />
                      </div>
                    </div>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>City *</label>
                        <input
                          className={styles.formInput}
                          value={shipping.city}
                          onChange={(e) => handleShippingChange('city', e.target.value)}
                          placeholder="New York"
                        />
                      </div>
                      <div className={styles.formGroup} style={{ flex: '0 0 80px' }}>
                        <label className={styles.inputLabel}>State *</label>
                        <input
                          className={styles.formInput}
                          value={shipping.state}
                          onChange={(e) => handleShippingChange('state', e.target.value)}
                          placeholder="NY"
                        />
                      </div>
                      <div className={styles.formGroup} style={{ flex: '0 0 100px' }}>
                        <label className={styles.inputLabel}>Zip *</label>
                        <input
                          className={styles.formInput}
                          value={shipping.postalCode}
                          onChange={(e) => handleShippingChange('postalCode', e.target.value)}
                          placeholder="10001"
                        />
                      </div>
                    </div>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Country *</label>
                        <select
                          className={styles.select}
                          value={shipping.country}
                          onChange={(e) => handleShippingChange('country', e.target.value)}
                        >
                          {COUNTRIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Email</label>
                        <input
                          className={styles.formInput}
                          type="email"
                          value={shipping.email}
                          onChange={(e) => handleShippingChange('email', e.target.value)}
                          placeholder="you@email.com"
                        />
                      </div>
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Delivery Instructions</label>
                      <input
                        className={styles.formInput}
                        value={shipping.deliveryInstructions}
                        onChange={(e) =>
                          handleShippingChange('deliveryInstructions', e.target.value)
                        }
                        placeholder="Ring doorbell, leave at concierge, etc."
                      />
                    </div>

                    {/* Save Address Checkbox */}
                    <div className={styles.saveAddressRow}>
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={saveNewAddress}
                          onChange={(e) => setSaveNewAddress(e.target.checked)}
                        />
                        <span>Save this address</span>
                      </label>
                      {saveNewAddress && (
                        <input
                          className={styles.formInput}
                          value={addressLabel}
                          onChange={(e) => setAddressLabel(e.target.value)}
                          placeholder="Label (Home, Office)"
                          style={{ marginTop: 6, maxWidth: 180 }}
                        />
                      )}
                    </div>
                  </div>
                )}

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.stepButtons}>
                  <button className={styles.backButton} onClick={() => goToStep('offer')}>
                    Back
                  </button>
                  <button
                    className={styles.submitButton}
                    onClick={() => goToStep('confirm')}
                    disabled={!isShippingValid}
                  >
                    Review Offer
                  </button>
                </div>
              </>
            )}

            {/* ====== STEP 3: Confirm & Submit ====== */}
            {step === 'confirm' && (
              <>
                <div className={styles.summary}>
                  <div className={styles.summaryRow}>
                    <span>Your Offer</span>
                    <span className={styles.summaryValue}>
                      $
                      {amountUSD.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>SOL Equivalent</span>
                    <span>{amountSOL.toFixed(4)} SOL</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>List Price</span>
                    <span>${listPrice.toLocaleString()}</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Difference</span>
                    <span className={difference < 0 ? styles.negative : styles.positive}>
                      {difference < 0 ? '' : '+'}${Math.abs(amountUSD - listPrice).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Expires</span>
                    <span>{expiresInHours}h</span>
                  </div>
                </div>

                {/* Shipping Summary */}
                <div className={styles.shippingSummary}>
                  <h4 className={styles.shippingSummaryTitle}>Shipping To</h4>
                  {(() => {
                    const addr = getShippingAddress();
                    return (
                      <div className={styles.shippingSummaryContent}>
                        <p className={styles.shippingSummaryName}>{addr.fullName}</p>
                        <p>{addr.street1}</p>
                        {addr.street2 && <p>{addr.street2}</p>}
                        <p>
                          {addr.city}, {addr.state} {addr.postalCode}
                        </p>
                        <p>{addr.country}</p>
                      </div>
                    );
                  })()}
                </div>

                {message && (
                  <div className={styles.messageSummary}>
                    <span className={styles.messageSummaryLabel}>Your Message</span>
                    <p>{message}</p>
                  </div>
                )}

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.stepButtons}>
                  <button
                    className={styles.backButton}
                    onClick={() => goToStep('shipping')}
                    disabled={loading}
                  >
                    Back
                  </button>
                  <button className={styles.submitButton} onClick={handleSubmit} disabled={loading}>
                    {loading
                      ? 'Submitting...'
                      : `Submit Offer - $${amountUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MakeOfferModal;
