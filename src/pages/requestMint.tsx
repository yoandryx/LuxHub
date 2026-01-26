// /pages/requestMint.tsx
// Simple mint request page - redirects to seller dashboard for full form
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/CreateNFT.module.css';
import { useWallet } from '@solana/wallet-adapter-react';

const RequestMint = () => {
  const wallet = useWallet();
  const router = useRouter();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [solRate, setSolRate] = useState(0);
  const [showShimmer, setShowShimmer] = useState(false);

  // Required fields
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [priceUSD, setPriceUSD] = useState('');
  const [description, setDescription] = useState('');

  // Status
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch SOL price for display
  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        const res = await fetch('/api/users/sol-price');
        const data = await res.json();
        if (data.price && data.price !== solRate) {
          setSolRate(data.price);
          setShowShimmer(true);
          setTimeout(() => setShowShimmer(false), 500);
        }
      } catch (err) {
        console.error('Failed to fetch SOL price:', err);
      }
    };
    fetchSolPrice();
    const interval = setInterval(fetchSolPrice, 60000);
    return () => clearInterval(interval);
  }, [solRate]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageBase64(reader.result as string);
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Calculate estimated SOL
  const estimatedSol = solRate > 0 && priceUSD ? (parseFloat(priceUSD) / solRate).toFixed(3) : '0';

  const handleSubmit = async () => {
    if (!wallet.publicKey) return alert('Connect your wallet first');
    if (!imageBase64) return alert('Please upload an image');
    if (!title || !brand || !model || !referenceNumber || !priceUSD) {
      return alert('Please fill in all required fields');
    }

    const parsedPrice = parseFloat(priceUSD);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return alert('Please enter a valid USD price');
    }

    setIsSubmitting(true);
    setStatus('');

    const payload = {
      title,
      brand,
      model,
      referenceNumber,
      priceUSD: parsedPrice,
      description,
      imageBase64,
      wallet: wallet.publicKey.toBase58(),
      timestamp: Date.now(),
    };

    try {
      const res = await fetch('/api/nft/requestMint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setStatus('Mint request submitted! An admin will review it.');
        // Clear form
        setTitle('');
        setBrand('');
        setModel('');
        setReferenceNumber('');
        setPriceUSD('');
        setDescription('');
        setImageBase64(null);
        setImagePreview(null);
      } else {
        const data = await res.json();
        setStatus(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      setStatus('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.formHeader}>
        <h2>Request Admin Mint</h2>
        <p>
          Submit your watch details for admin review. For the full form with all options, visit the{' '}
          <a href="/sellerDashboard" style={{ color: '#c8a1ff' }}>
            Seller Dashboard
          </a>
          .
        </p>
      </div>

      <div className={styles.formContainer}>
        <div className={styles.formSection}>
          <div className={styles.formSectionTitle}>Watch Image *</div>
          <input
            className={styles.formUploadButton}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
          />
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Preview"
              style={{ maxWidth: '200px', marginTop: '10px', borderRadius: '8px' }}
            />
          )}
        </div>

        <div className={styles.formSection}>
          <div className={styles.formSectionTitle}>Required Information</div>

          <div className={styles.formFieldWrapper}>
            <label className={styles.formLabel}>Title *</label>
            <input
              className={styles.formInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Rolex Daytona Rainbow"
            />
          </div>

          <div className={styles.formFieldWrapper}>
            <label className={styles.formLabel}>Brand *</label>
            <input
              className={styles.formInput}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g., Rolex"
            />
          </div>

          <div className={styles.formFieldWrapper}>
            <label className={styles.formLabel}>Model *</label>
            <input
              className={styles.formInput}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g., Cosmograph Daytona"
            />
          </div>

          <div className={styles.formFieldWrapper}>
            <label className={styles.formLabel}>Reference Number *</label>
            <small className={styles.formHint}>Alphanumeric (e.g., 116595RBOW-2024)</small>
            <input
              className={styles.formInput}
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g., 116595RBOW-2024"
            />
          </div>

          <div className={styles.formFieldWrapper}>
            <label className={styles.formLabel}>Price (USD) *</label>
            <div className={styles.inlineSolInput}>
              <input
                className={styles.formInput}
                type="number"
                value={priceUSD}
                onChange={(e) => setPriceUSD(e.target.value)}
                placeholder="e.g., 485000"
              />
              <span className={`${styles.solPriceWrapper} ${showShimmer ? styles.shimmer : ''}`}>
                {solRate > 0 ? `≈ ${estimatedSol} SOL` : 'Fetching SOL...'}
              </span>
            </div>
          </div>

          <div className={styles.formFieldWrapper}>
            <label className={styles.formLabel}>Description</label>
            <textarea
              className={styles.formInput}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the watch..."
              rows={3}
            />
          </div>
        </div>

        <button onClick={handleSubmit} className={styles.mintButton} disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit Mint Request'}
        </button>

        {status && (
          <p
            style={{
              marginTop: '15px',
              padding: '10px',
              borderRadius: '8px',
              backgroundColor: status.includes('Failed')
                ? 'rgba(255,100,100,0.1)'
                : 'rgba(100,255,100,0.1)',
              color: status.includes('Failed') ? '#ff6666' : '#66ff66',
            }}
          >
            {status}
          </p>
        )}
      </div>
    </div>
  );
};

export default RequestMint;
