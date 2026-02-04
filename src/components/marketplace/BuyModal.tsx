// src/components/marketplace/BuyModal.tsx
// Modal for buyers to purchase an escrow listing with on-chain exchange
import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { FaShoppingCart, FaShippingFast, FaCheckCircle, FaLock, FaWallet } from 'react-icons/fa';
import { HiOutlineX } from 'react-icons/hi';
import { LuSparkles } from 'react-icons/lu';
import { getProgram } from '../../utils/programUtils';
import styles from '../../styles/BuyModal.module.css';

// Constants
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

interface Escrow {
  escrowPda: string;
  nftMint?: string;
  listingPrice?: number; // lamports
  listingPriceUSD: number;
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
  const wallet = useWallet();
  const { connection } = useConnection();
  const { publicKey, connected, signTransaction } = wallet;

  const [step, setStep] = useState<'details' | 'shipping' | 'confirm' | 'signing' | 'success'>(
    'details'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);

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

  // Calculate prices
  const priceUSD = escrow.listingPriceUSD || 0;
  const priceSol = priceUSD / solPrice;
  const priceLamports = Math.floor(priceSol * LAMPORTS_PER_SOL);
  const platformFeePercent = 3; // 3% taken at confirm_delivery, not purchase
  const totalSol = priceSol; // Buyer pays full amount, fee taken later

  // Fetch SOL balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (publicKey && connection) {
        try {
          const balance = await connection.getBalance(publicKey);
          setSolBalance(balance / LAMPORTS_PER_SOL);
        } catch (err) {
          console.error('Failed to fetch balance:', err);
        }
      }
    };
    fetchBalance();
  }, [publicKey, connection]);

  const isShippingValid =
    shipping.fullName.trim() &&
    shipping.street1.trim() &&
    shipping.city.trim() &&
    shipping.state.trim() &&
    shipping.postalCode.trim() &&
    shipping.country;

  const hasEnoughBalance = solBalance !== null && solBalance >= totalSol + 0.01; // +0.01 for tx fees

  // Execute on-chain exchange instruction
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

    // Derive addresses
    const buyerWsolAta = await getAssociatedTokenAddress(WSOL_MINT, publicKey);

    // Derive wSOL vault PDA (same pattern as create-with-mint.ts)
    const [wsolVault] = PublicKey.findProgramAddressSync(
      [escrowPda.toBuffer(), TOKEN_PROGRAM.toBuffer(), WSOL_MINT.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM
    );

    // Check if buyer wSOL ATA exists
    const buyerWsolAtaInfo = await connection.getAccountInfo(buyerWsolAta);

    // Build pre-instructions for ATA creation and SOL wrapping
    const preInstructions: TransactionInstruction[] = [];

    // Create buyer wSOL ATA if needed
    if (!buyerWsolAtaInfo) {
      console.log('Creating buyer wSOL ATA...');
      preInstructions.push(
        createAssociatedTokenAccountInstruction(publicKey, buyerWsolAta, publicKey, WSOL_MINT)
      );
    }

    // Wrap SOL into wSOL
    console.log(`Wrapping ${totalSol} SOL (${priceLamports} lamports) into wSOL...`);
    preInstructions.push(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: buyerWsolAta,
        lamports: priceLamports,
      }),
      createSyncNativeInstruction(buyerWsolAta)
    );

    // Execute exchange instruction
    console.log('Executing exchange instruction...');
    const tx = await program.methods
      .exchange()
      .accounts({
        taker: publicKey,
        escrow: escrowPda,
        mintA: WSOL_MINT,
        mintB: nftMint,
        takerFundsAta: buyerWsolAta,
        wsolVault: wsolVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions(preInstructions)
      .rpc();

    console.log('Exchange successful! TX:', tx);
    return tx;
  };

  // Handle purchase flow
  const handlePurchase = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet');
      return;
    }

    if (!isShippingValid) {
      setError('Please complete all required shipping fields');
      return;
    }

    if (!hasEnoughBalance) {
      setError(`Insufficient SOL balance. You need at least ${totalSol.toFixed(4)} SOL`);
      return;
    }

    setLoading(true);
    setError(null);
    setStep('signing');

    try {
      // Step 1: Execute on-chain exchange
      const signature = await executeExchange();
      setTxSignature(signature);

      // Step 2: Update MongoDB with buyer info and shipping address
      const response = await fetch('/api/escrow/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowPda: escrow.escrowPda,
          mintAddress: escrow.nftMint,
          buyerWallet: publicKey.toBase58(),
          txSignature: signature,
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
        console.warn('MongoDB update failed but on-chain succeeded:', data.error);
        // Don't throw - on-chain is the source of truth
      }

      setStep('success');
      setTimeout(() => {
        onSuccess?.();
      }, 3000);
    } catch (err: any) {
      console.error('Purchase failed:', err);
      setError(err.message || 'Transaction failed. Please try again.');
      setStep('confirm'); // Go back to confirm step
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
                <span>Platform Fee ({platformFeePercent}%)</span>
                <span className={styles.feeNote}>Deducted at delivery confirmation</span>
              </div>
              <div className={`${styles.priceRow} ${styles.totalRow}`}>
                <span>You Pay</span>
                <div className={styles.totalValue}>
                  <span className={styles.totalSol}>
                    <LuSparkles /> {totalSol.toFixed(4)} SOL
                  </span>
                  <span className={styles.totalUSD}>≈ ${priceUSD.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Balance Check */}
            {connected && solBalance !== null && (
              <div
                className={`${styles.balanceCheck} ${hasEnoughBalance ? styles.sufficient : styles.insufficient}`}
              >
                <FaWallet />
                <span>
                  Your balance: {solBalance.toFixed(4)} SOL
                  {!hasEnoughBalance && ' (Insufficient)'}
                </span>
              </div>
            )}

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
              <p className={styles.subtitle}>Review and sign transaction</p>
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
                  <span className={styles.summaryPrice}>
                    <LuSparkles /> {totalSol.toFixed(4)} SOL
                  </span>
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
                  Your SOL is held in escrow until you confirm delivery. Vendor receives 97% after
                  confirmation.
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
                {loading ? 'Processing...' : `Pay ${totalSol.toFixed(4)} SOL`}
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
              <h2 className={styles.signingTitle}>Signing Transaction</h2>
              <p className={styles.signingMessage}>
                Please approve the transaction in your wallet...
              </p>
              <div className={styles.signingDetails}>
                <p>Amount: {totalSol.toFixed(4)} SOL</p>
                <p>To: Escrow Vault</p>
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
                Your {totalSol.toFixed(4)} SOL has been deposited to escrow.
              </p>
              {txSignature && (
                <a
                  href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.txLink}
                >
                  View Transaction ↗
                </a>
              )}
              <div className={styles.nextSteps}>
                <h4>What happens next?</h4>
                <ul>
                  <li>Vendor will prepare and ship your item</li>
                  <li>You&apos;ll receive tracking information via email</li>
                  <li>Confirm delivery once you receive the item</li>
                  <li>Funds released to vendor (97%) after your confirmation</li>
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
