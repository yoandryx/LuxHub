// src/components/marketplace/BuyModal.tsx
// Modal for buyers to purchase an escrow listing with USDC-based escrow
// Supports paying with USDC directly or SOL (auto-swapped via Jupiter)
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getClusterConfig } from '@/lib/solana/clusterConfig';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { FaShoppingCart, FaShippingFast, FaCheckCircle, FaLock, FaWallet } from 'react-icons/fa';
import { HiOutlineX } from 'react-icons/hi';
import { SiSolana } from 'react-icons/si';
import { FiSave, FiEdit2 } from 'react-icons/fi';
import { addPriorityFee } from '../../lib/solana/priorityFees';
import { getProgram } from '../../utils/programUtils';
import { resolveImageUrl, handleImageError, PLACEHOLDER_IMAGE } from '../../utils/imageUtils';
import {
  USDC_MINT,
  SOL_MINT,
  USDC_DECIMALS,
  usdToUsdcAtomic,
  usdcAtomicToUsd,
  getUSDCBalance,
  getSOLBalance,
  getSOLtoUSDCQuote,
  buildSwapTransaction,
  ensureUsdcAta,
  type JupiterQuote,
} from '../../utils/jupiterSwap';
import SavedAddressSelector, { SavedAddress } from '../common/SavedAddressSelector';
import styles from '../../styles/BuyModal.module.css';

// Constants
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

type PaymentToken = 'USDC' | 'SOL';

interface Escrow {
  escrowPda: string;
  nftMint?: string;
  listingPrice?: number; // USDC atomic units (new) or lamports (legacy)
  listingPriceUSD: number;
  paymentMint?: 'SOL' | 'USDC'; // new field
  seed?: number;
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
  solPrice?: number; // USD per SOL
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
  const wallet = useWallet(); // kept for getProgram(wallet)
  const { connection } = useConnection();
  const { publicKey, connected, signTransaction } = useEffectiveWallet();

  const [step, setStep] = useState<'details' | 'shipping' | 'confirm' | 'signing' | 'success'>(
    'details'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [swapTxSignature, setSwapTxSignature] = useState<string | null>(null);

  // Payment token selection
  const [paymentToken, setPaymentToken] = useState<PaymentToken>('USDC');

  // Balances
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);

  // Jupiter quote (for SOL payments)
  const [jupiterQuote, setJupiterQuote] = useState<JupiterQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

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

  // Saved address state
  const [selectedSavedAddress, setSelectedSavedAddress] = useState<SavedAddress | null>(null);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [saveNewAddress, setSaveNewAddress] = useState(false);
  const [addressLabel, setAddressLabel] = useState('Home');

  // Email nudge state
  const [hasEmail, setHasEmail] = useState<boolean | null>(null);

  // Calculate prices
  const priceUSD = escrow.listingPriceUSD || 0;
  const priceUsdcAtomic = usdToUsdcAtomic(priceUSD);
  const platformFeePercent = 3; // 3% taken at confirm_delivery, not purchase

  // SOL equivalent (for display)
  const solEquivalent = priceUSD / solPrice;

  // Fetch balances
  useEffect(() => {
    const fetchBalances = async () => {
      if (publicKey && connection) {
        try {
          const [usdc, sol] = await Promise.all([
            getUSDCBalance(connection, publicKey),
            getSOLBalance(connection, publicKey),
          ]);
          setUsdcBalance(usdc);
          setSolBalance(sol);
        } catch (err) {
          console.error('Failed to fetch balances:', err);
        }
      }
    };
    fetchBalances();
  }, [publicKey, connection]);

  // Check if user has email for nudge display
  useEffect(() => {
    if (!publicKey) return;
    const checkEmail = async () => {
      try {
        const res = await fetch(`/api/users/notification-prefs?wallet=${publicKey.toBase58()}`);
        const data = await res.json();
        setHasEmail(!!data.email);
      } catch {
        setHasEmail(true); // hide nudge on error
      }
    };
    checkEmail();
  }, [publicKey]);

  // Fetch Jupiter quote when SOL is selected
  useEffect(() => {
    if (paymentToken !== 'SOL' || !priceUsdcAtomic) {
      setJupiterQuote(null);
      return;
    }

    let cancelled = false;
    const fetchQuote = async () => {
      setQuoteLoading(true);
      try {
        const quote = await getSOLtoUSDCQuote(priceUsdcAtomic, 100);
        if (!cancelled) setJupiterQuote(quote);
      } catch (err) {
        console.error('Jupiter quote failed:', err);
        if (!cancelled) setJupiterQuote(null);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    };

    fetchQuote();
    return () => {
      cancelled = true;
    };
  }, [paymentToken, priceUsdcAtomic]);

  // Check if shipping is valid
  const isNewAddressValid =
    shipping.fullName.trim() &&
    shipping.street1.trim() &&
    shipping.city.trim() &&
    shipping.state.trim() &&
    shipping.postalCode.trim() &&
    shipping.country;

  const isShippingValid =
    selectedSavedAddress !== null || (showNewAddressForm && isNewAddressValid);

  // Balance checks
  const hasEnoughUSDC = usdcBalance !== null && usdcBalance >= priceUsdcAtomic;
  const solNeeded = jupiterQuote ? Number(jupiterQuote.inAmount) + 10_000_000 : 0; // +0.01 SOL for fees
  const hasEnoughSOL = solBalance !== null && solNeeded > 0 && solBalance >= solNeeded;
  const hasEnoughBalance = paymentToken === 'USDC' ? hasEnoughUSDC : hasEnoughSOL;

  // Format balance display
  const balanceDisplay =
    paymentToken === 'USDC'
      ? `${usdcBalance !== null ? (usdcBalance / 10 ** USDC_DECIMALS).toFixed(2) : '...'} USDC`
      : `${solBalance !== null ? (solBalance / LAMPORTS_PER_SOL).toFixed(4) : '...'} SOL`;

  const neededDisplay =
    paymentToken === 'USDC'
      ? `${priceUSD.toLocaleString()} USDC`
      : jupiterQuote
        ? `~${(Number(jupiterQuote.inAmount) / LAMPORTS_PER_SOL).toFixed(4)} SOL`
        : `~${solEquivalent.toFixed(4)} SOL`;

  // Execute on-chain exchange instruction (USDC flow)
  const executeExchange = async (): Promise<string> => {
    if (!publicKey || !connected || !signTransaction) {
      throw new Error('Wallet not connected');
    }

    const program = getProgram(wallet);
    const escrowPda = new PublicKey(escrow.escrowPda);
    const nftMint = escrow.nftMint ? new PublicKey(escrow.nftMint) : null;

    if (!nftMint) {
      throw new Error('NFT mint address not found');
    }

    // Derive buyer's USDC ATA
    const buyerUsdcAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);

    // Derive USDC vault PDA (escrow's USDC holding account)
    const [usdcVault] = PublicKey.findProgramAddressSync(
      [escrowPda.toBuffer(), TOKEN_PROGRAM.toBuffer(), USDC_MINT.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM
    );

    // Execute exchange instruction — deposits USDC into escrow vault
    const tx = await program.methods
      .exchange()
      .accounts({
        taker: publicKey,
        escrow: escrowPda,
        mintA: USDC_MINT,
        mintB: nftMint,
        takerFundsAta: buyerUsdcAta,
        wsolVault: usdcVault, // named wsolVault in program but holds USDC
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  };

  // Handle purchase flow
  const handlePurchase = async () => {
    if (!connected || !publicKey || !signTransaction) {
      setError('Please connect your wallet');
      return;
    }

    if (!isShippingValid) {
      setError('Please complete all required shipping fields');
      return;
    }

    if (!hasEnoughBalance) {
      const tokenName = paymentToken === 'USDC' ? 'USDC' : 'SOL';
      setError(`Insufficient ${tokenName} balance. You need ${neededDisplay}`);
      return;
    }

    setLoading(true);
    setError(null);
    setStep('signing');

    try {
      let swapSig: string | undefined;

      // Step 1: If paying with SOL, swap to USDC via Jupiter first
      if (paymentToken === 'SOL') {
        if (!jupiterQuote) {
          throw new Error('Jupiter quote not available. Please try again.');
        }

        // Ensure buyer has USDC ATA
        const { instruction: createAtaIx } = await ensureUsdcAta(connection, publicKey, publicKey);
        if (createAtaIx) {
          // Build and send ATA creation tx separately
          const { Transaction } = await import('@solana/web3.js');
          const ataTx = new Transaction().add(createAtaIx);
          addPriorityFee(ataTx);
          const { blockhash } = await connection.getLatestBlockhash();
          ataTx.recentBlockhash = blockhash;
          ataTx.feePayer = publicKey;
          const signedAtaTx = await signTransaction(ataTx);
          await connection.sendRawTransaction(signedAtaTx.serialize());
        }

        // Build and execute Jupiter swap
        const swapTx = await buildSwapTransaction(jupiterQuote, publicKey);
        const signedSwapTx = await signTransaction(swapTx);
        swapSig = await connection.sendTransaction(signedSwapTx, {
          skipPreflight: false,
          maxRetries: 3,
        });

        // Wait for swap confirmation
        const latestBlockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction({
          signature: swapSig,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        });

        setSwapTxSignature(swapSig);
      }

      // Step 2: Execute on-chain exchange (deposit USDC to escrow vault)
      const signature = await executeExchange();
      setTxSignature(signature);

      // Verify exchange transaction confirmed on-chain
      const exchangeBlockhash = await connection.getLatestBlockhash();
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: exchangeBlockhash.blockhash,
        lastValidBlockHeight: exchangeBlockhash.lastValidBlockHeight,
      });

      if (confirmation.value.err) {
        throw new Error('Exchange transaction failed on-chain. Please try again.');
      }

      // Determine shipping address (saved or new)
      const shippingAddress = selectedSavedAddress
        ? {
            fullName: selectedSavedAddress.fullName,
            street1: selectedSavedAddress.street1,
            street2: selectedSavedAddress.street2 || undefined,
            city: selectedSavedAddress.city,
            state: selectedSavedAddress.state,
            postalCode: selectedSavedAddress.postalCode,
            country: selectedSavedAddress.country,
            phone: selectedSavedAddress.phone || undefined,
            email: selectedSavedAddress.email || undefined,
            deliveryInstructions: selectedSavedAddress.deliveryInstructions || undefined,
          }
        : {
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
          };

      // Step 3: Update MongoDB with buyer info and shipping address
      const response = await fetch('/api/escrow/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowPda: escrow.escrowPda,
          mintAddress: escrow.nftMint,
          buyerWallet: publicKey.toBase58(),
          txSignature: signature,
          swapTxSignature: swapSig,
          paymentToken,
          shippingAddress,
        }),
      });

      // Step 4: Save new address if checkbox is checked
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
        } catch (saveErr) {
          console.warn('Failed to save address:', saveErr);
        }
      }

      const data = await response.json();

      if (!response.ok) {
        console.warn('MongoDB update failed but on-chain succeeded:', data.error);
        // Retry once — on-chain tx already landed, we must sync the DB
        try {
          const retryResponse = await fetch('/api/escrow/purchase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              escrowPda: escrow.escrowPda,
              mintAddress: escrow.nftMint,
              buyerWallet: publicKey.toBase58(),
              txSignature: signature,
              swapTxSignature: swapSig,
              paymentToken,
              shippingAddress,
            }),
          });
          if (!retryResponse.ok) {
            console.error('MongoDB retry also failed — admin sync required');
          }
        } catch (retryErr) {
          console.error('MongoDB retry error:', retryErr);
        }
      }

      setStep('success');
      setTimeout(() => {
        onSuccess?.();
      }, 3000);
    } catch (err: any) {
      console.error('Purchase failed:', err);
      setError(err.message || 'Transaction failed. Please try again.');
      setStep('confirm');
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
            className={`${styles.progressStep} ${['details', 'shipping', 'confirm', 'signing'].includes(step) ? styles.active : ''} ${step === 'success' ? styles.completed : ''}`}
          >
            <span className={styles.stepIcon}>1</span>
            <span className={styles.stepLabel}>Details</span>
          </div>
          <div className={styles.progressLine} />
          <div
            className={`${styles.progressStep} ${['shipping', 'confirm', 'signing'].includes(step) ? styles.active : ''} ${step === 'success' ? styles.completed : ''}`}
          >
            <span className={styles.stepIcon}>2</span>
            <span className={styles.stepLabel}>Shipping</span>
          </div>
          <div className={styles.progressLine} />
          <div
            className={`${styles.progressStep} ${['confirm', 'signing'].includes(step) ? styles.active : ''} ${step === 'success' ? styles.completed : ''}`}
          >
            <span className={styles.stepIcon}>3</span>
            <span className={styles.stepLabel}>Pay</span>
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
                src={resolveImageUrl(escrow.asset?.imageUrl) || PLACEHOLDER_IMAGE}
                alt={escrow.asset?.model}
                className={styles.assetImage}
                onError={handleImageError}
              />
              <div className={styles.assetInfo}>
                <span className={styles.assetBrand}>{escrow.asset?.brand}</span>
                <h3 className={styles.assetModel}>{escrow.asset?.title || escrow.asset?.model}</h3>
                {escrow.vendor?.businessName && (
                  <span className={styles.vendorName}>Sold by {escrow.vendor.businessName}</span>
                )}
              </div>
            </div>

            {/* Payment Token Selector */}
            <div className={styles.tokenSelector}>
              <span className={styles.tokenSelectorLabel}>Pay with</span>
              <div className={styles.tokenOptions}>
                <button
                  className={`${styles.tokenOption} ${paymentToken === 'USDC' ? styles.tokenOptionActive : ''}`}
                  onClick={() => setPaymentToken('USDC')}
                >
                  <span className={styles.tokenIcon}>$</span>
                  USDC
                </button>
                <button
                  className={`${styles.tokenOption} ${paymentToken === 'SOL' ? styles.tokenOptionActive : ''}`}
                  onClick={() => setPaymentToken('SOL')}
                >
                  <span className={styles.tokenIcon}>
                    <SiSolana />
                  </span>
                  SOL
                </button>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className={styles.priceSection}>
              <div className={styles.priceRow}>
                <span>Item Price</span>
                <span className={styles.priceValue}>${priceUSD.toLocaleString()} USDC</span>
              </div>
              <div className={styles.priceRow}>
                <span>Platform Fee</span>
                <span className={styles.feeNote}>Included, deducted at delivery</span>
              </div>

              {paymentToken === 'SOL' && (
                <div className={styles.priceRow}>
                  <span>Swap Rate</span>
                  <span className={styles.feeNote}>
                    {quoteLoading
                      ? 'Fetching...'
                      : jupiterQuote
                        ? `1 SOL ≈ $${(priceUSD / (Number(jupiterQuote.inAmount) / LAMPORTS_PER_SOL)).toFixed(2)}`
                        : 'Unavailable'}
                  </span>
                </div>
              )}

              <div className={`${styles.priceRow} ${styles.totalRow}`}>
                <span>You Pay</span>
                <div className={styles.totalValue}>
                  {paymentToken === 'USDC' ? (
                    <>
                      <span className={styles.totalSol}>${priceUSD.toLocaleString()} USDC</span>
                    </>
                  ) : (
                    <>
                      <span className={styles.totalSol}>
                        <SiSolana />{' '}
                        {quoteLoading
                          ? '...'
                          : jupiterQuote
                            ? `~${(Number(jupiterQuote.inAmount) / LAMPORTS_PER_SOL).toFixed(4)} SOL`
                            : `~${solEquivalent.toFixed(4)} SOL`}
                      </span>
                      <span className={styles.totalUSD}>→ ${priceUSD.toLocaleString()} USDC</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Balance Check */}
            {connected && (
              <div
                className={`${styles.balanceCheck} ${hasEnoughBalance ? styles.sufficient : styles.insufficient}`}
              >
                <FaWallet />
                <span>
                  Your balance: {balanceDisplay}
                  {!hasEnoughBalance && ` (Need ${neededDisplay})`}
                </span>
              </div>
            )}

            {paymentToken === 'SOL' && !quoteLoading && jupiterQuote && (
              <div className={styles.swapNotice}>
                SOL will be automatically swapped to USDC via Jupiter before depositing to escrow.
                Slippage tolerance: 1%
              </div>
            )}

            <button
              className={styles.primaryBtn}
              onClick={() => setStep('shipping')}
              disabled={!hasEnoughBalance}
            >
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

            {/* Saved Address Selector */}
            {!showNewAddressForm && (
              <SavedAddressSelector
                wallet={publicKey?.toBase58() || null}
                selectedAddressId={selectedSavedAddress?._id || null}
                onSelectAddress={(addr) => {
                  setSelectedSavedAddress(addr);
                  if (addr) {
                    setShowNewAddressForm(false);
                  }
                }}
                onAddNewClick={() => {
                  setShowNewAddressForm(true);
                  setSelectedSavedAddress(null);
                }}
                compact
              />
            )}

            {/* New Address Form */}
            {showNewAddressForm && (
              <>
                <div className={styles.formHeader}>
                  <span>New Address</span>
                  <button
                    className={styles.editBtn}
                    onClick={() => {
                      setShowNewAddressForm(false);
                    }}
                  >
                    <FiEdit2 /> Use Saved
                  </button>
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

                  {/* Save Address Checkbox */}
                  <div className={styles.saveAddressRow}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={saveNewAddress}
                        onChange={(e) => setSaveNewAddress(e.target.checked)}
                        className={styles.checkbox}
                      />
                      <FiSave />
                      <span>Save this address for future purchases</span>
                    </label>
                    {saveNewAddress && (
                      <input
                        type="text"
                        className={styles.labelInput}
                        value={addressLabel}
                        onChange={(e) => setAddressLabel(e.target.value)}
                        placeholder="Label (e.g., Home)"
                        maxLength={20}
                      />
                    )}
                  </div>
                </div>
              </>
            )}

            {hasEmail === false && (
              <div className={styles.emailNudge}>
                <span>Want order updates via email?</span>
                <a
                  href="/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.emailNudgeLink}
                >
                  Add your email in Settings
                </a>
              </div>
            )}

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
              <p className={styles.subtitle}>Review and sign transaction</p>
            </div>

            {/* Order Summary */}
            <div className={styles.summarySection}>
              <h4 className={styles.summaryTitle}>Order Summary</h4>
              <div className={styles.summaryItem}>
                <img
                  src={resolveImageUrl(escrow.asset?.imageUrl) || PLACEHOLDER_IMAGE}
                  alt={escrow.asset?.model}
                  className={styles.summaryImage}
                  onError={handleImageError}
                />
                <div className={styles.summaryInfo}>
                  <span className={styles.summaryModel}>
                    {escrow.asset?.title || escrow.asset?.model}
                  </span>
                  <span className={styles.summaryPrice}>${priceUSD.toLocaleString()} USDC</span>
                  {paymentToken === 'SOL' && jupiterQuote && (
                    <span className={styles.summarySwapNote}>
                      Paying ~{(Number(jupiterQuote.inAmount) / LAMPORTS_PER_SOL).toFixed(4)} SOL →
                      swapped to USDC
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.summarySection}>
              <h4 className={styles.summaryTitle}>Ship To</h4>
              <div className={styles.addressBlock}>
                {selectedSavedAddress ? (
                  <>
                    <p>{selectedSavedAddress.fullName}</p>
                    <p>{selectedSavedAddress.street1}</p>
                    {selectedSavedAddress.street2 && <p>{selectedSavedAddress.street2}</p>}
                    <p>
                      {selectedSavedAddress.city}, {selectedSavedAddress.state}{' '}
                      {selectedSavedAddress.postalCode}
                    </p>
                    <p>{selectedSavedAddress.country}</p>
                  </>
                ) : (
                  <>
                    <p>{shipping.fullName}</p>
                    <p>{shipping.street1}</p>
                    {shipping.street2 && <p>{shipping.street2}</p>}
                    <p>
                      {shipping.city}, {shipping.state} {shipping.postalCode}
                    </p>
                    <p>{shipping.country}</p>
                  </>
                )}
              </div>
            </div>

            {/* Escrow Protection Notice */}
            <div className={styles.escrowNotice}>
              <FaLock className={styles.escrowIcon} />
              <div className={styles.escrowText}>
                <strong>Escrow Protected</strong>
                <span>
                  Your ${priceUSD.toLocaleString()} USDC is held in escrow until you confirm
                  delivery. Funds are released to the vendor after confirmation. If rejected, funds
                  are returned to you automatically.
                </span>
              </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.buttonRow}>
              <button
                className={styles.secondaryBtn}
                onClick={() => setStep('shipping')}
                disabled={loading}
              >
                Back
              </button>
              <button
                className={styles.confirmBtn}
                onClick={handlePurchase}
                disabled={loading || !hasEnoughBalance}
              >
                {loading
                  ? 'Processing...'
                  : paymentToken === 'USDC'
                    ? `Pay $${priceUSD.toLocaleString()} USDC`
                    : `Pay ~${jupiterQuote ? (Number(jupiterQuote.inAmount) / LAMPORTS_PER_SOL).toFixed(4) : solEquivalent.toFixed(4)} SOL`}
              </button>
            </div>
          </div>
        )}

        {/* Step: Signing */}
        {step === 'signing' && (
          <div className={styles.stepContent}>
            <div className={styles.signingContent}>
              <div className={styles.signingSpinner}>
                <div className={styles.spinner}></div>
              </div>
              <h2 className={styles.signingTitle}>
                {paymentToken === 'SOL' && !swapTxSignature
                  ? 'Swapping SOL → USDC'
                  : 'Depositing to Escrow'}
              </h2>
              <p className={styles.signingMessage}>
                Please approve the transaction in your wallet...
              </p>
              <div className={styles.signingDetails}>
                <p>Amount: ${priceUSD.toLocaleString()} USDC</p>
                <p>To: Escrow Vault</p>
                {paymentToken === 'SOL' && (
                  <p className={styles.swapStep}>
                    {!swapTxSignature ? 'Step 1/2: Jupiter Swap' : 'Step 2/2: Escrow Deposit'}
                  </p>
                )}
              </div>
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
                ${priceUSD.toLocaleString()} USDC has been deposited to escrow.
              </p>
              {txSignature && (
                <a
                  href={getClusterConfig().explorerTxUrl(txSignature)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.txLink}
                >
                  View Transaction ↗
                </a>
              )}
              {swapTxSignature && (
                <a
                  href={getClusterConfig().explorerTxUrl(swapTxSignature)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.txLink}
                >
                  View Swap Transaction ↗
                </a>
              )}
              <div className={styles.nextSteps}>
                <h4>What happens next?</h4>
                <ul>
                  <li>Vendor will prepare and ship your item</li>
                  <li>You&apos;ll receive tracking information via email</li>
                  <li>Confirm delivery once you receive the item</li>
                  <li>Vendor receives payment after your confirmation</li>
                  <li>If rejected, your USDC is returned automatically</li>
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
