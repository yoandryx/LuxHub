// src/components/pool/PoolCreationStepper.tsx
// 4-step pool creation stepper: Configure > Sign Fee-Share > Launch Token > Confirm
// Supports standard vendor mode and admin direct creation mode (D-02)
import React, { useState, useCallback, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import {
  FiCheckCircle,
  FiLoader,
  FiAlertTriangle,
  FiCopy,
  FiExternalLink,
  FiSettings,
  FiEdit3,
  FiZap,
  FiAward,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import styles from '../../styles/PoolCreationStepper.module.css';

interface PoolCreationStepperProps {
  assetId?: string;
  assetData?: AssetOption;
  vendorWallet: string;
  onComplete?: (poolId: string) => void;
  onCancel?: () => void;
  adminMode?: boolean;
}

interface AssetOption {
  _id: string;
  brand: string;
  model: string;
  priceUSD: number;
  imageUrl?: string;
  imageIpfsUrls?: string[];
  images?: string[];
  nftOwnerWallet?: string;
}

type StepStatus = 'pending' | 'active' | 'complete' | 'error';

const STEPS = [
  { label: 'Configure', icon: FiSettings },
  { label: 'Fee-Share', icon: FiEdit3 },
  { label: 'Launch', icon: FiZap },
  { label: 'Confirm', icon: FiAward },
];

/**
 * Fetch an image URL and return as compressed base64 data URI.
 * Used when no custom image is uploaded — sends the NFT image the browser already displays.
 */
function fetchImageAsBase64(url: string, maxSize = 800, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load NFT image'));
    img.src = url;
  });
}

/**
 * Compress image to fit within Vercel's 4.5MB JSON body limit.
 * Resizes to max 800x800 and uses JPEG quality 0.8 (~200-400KB output).
 */
function compressImage(file: File, maxSize = 800, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PoolCreationStepper({
  assetId: initialAssetId,
  assetData: initialAssetData,
  vendorWallet,
  onComplete,
  onCancel,
  adminMode,
}: PoolCreationStepperProps) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useEffectiveWallet();

  // Step state
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(['active', 'pending', 'pending', 'pending']);

  // Form state (Step 1)
  const [selectedAssetId, setSelectedAssetId] = useState(initialAssetId || '');
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetOption | null>(null);
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenDescription, setTokenDescription] = useState('');
  const [targetAmountUSD, setTargetAmountUSD] = useState('');
  const [minBuyInUSD, setMinBuyInUSD] = useState('1.50');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [tokenImageFile, setTokenImageFile] = useState<File | null>(null);
  const [tokenImagePreview, setTokenImagePreview] = useState<string>('');

  // Pool state
  const [poolId, setPoolId] = useState('');
  const [tokenMint, setTokenMint] = useState('');
  const [feeShareTxs, setFeeShareTxs] = useState<any[]>([]);

  // Signing state (Step 2)
  const [signingIndex, setSigningIndex] = useState(-1);
  const [txStatuses, setTxStatuses] = useState<('pending' | 'signing' | 'done' | 'failed')[]>([]);

  // General state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Effective wallet for the pool (vendor wallet or selected asset vendor)
  const [effectiveVendorWallet, setEffectiveVendorWallet] = useState(vendorWallet);

  // Auto-fill pool details from NFT metadata
  // Name is locked to NFT name, symbol is LUX-XXXXX (set by backend)
  const autoFillFromAsset = useCallback(async (asset: AssetOption) => {
    setSelectedAsset(asset);
    setSelectedAssetId(asset._id);

    // Lock name to NFT name (not editable)
    const name = `${asset.brand} ${asset.model}`.slice(0, 32);
    setTokenName(name);
    setTargetAmountUSD(String(asset.priceUSD || ''));

    // Symbol will be LUXNNNN assigned by backend — show placeholder
    setTokenSymbol('LUX0001');

    // Set NFT image as preview (user can upload different one for token)
    // Resolve through gateway so fetchImageAsBase64 gets a full URL
    const { resolveImageUrl } = await import('../../utils/imageUtils');
    const nftImage = resolveImageUrl(asset.imageUrl || asset.imageIpfsUrls?.[0] || asset.images?.[0] || '');
    if (nftImage && !nftImage.endsWith('purpleLGG.png')) setTokenImagePreview(nftImage);

    // Description
    setTokenDescription(
      `Tokenized ${asset.brand} ${asset.model} pool — backed by an authenticated luxury timepiece valued at $${(asset.priceUSD || 0).toLocaleString()}.`
    );
  }, []);

  // If asset data was passed directly, auto-fill immediately
  useEffect(() => {
    if (initialAssetData) {
      autoFillFromAsset(initialAssetData);
    }
  }, [initialAssetData, autoFillFromAsset]);

  // Load available assets from mint-request API
  useEffect(() => {
    const fetchAssets = async () => {
      // Skip fetch if we already have asset data passed as prop
      if (initialAssetData) return;

      setLoadingAssets(true);
      try {
        const url = adminMode
          ? `/api/vendor/mint-request?status=minted`
          : `/api/vendor/mint-request?wallet=${vendorWallet}&status=minted`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const listings = Array.isArray(data) ? data : data.requests || [];
          // Only show verified on-chain minted NFTs that are actively listed
          const assetList: AssetOption[] = listings
            .filter((l: any) => l.status === 'minted' && !l.pooled && l.mintAddress)
            .map((l: any) => ({
              _id: l._id,
              brand: l.brand,
              model: l.model,
              priceUSD: l.priceUSD,
              imageUrl: l.imageUrl,
              nftOwnerWallet: l.wallet,
            }));
          setAssets(assetList);

          // If initialAssetId was provided, find and auto-fill
          if (initialAssetId && !initialAssetData) {
            const found = assetList.find((a) => a._id === initialAssetId);
            if (found) autoFillFromAsset(found);
          }
        }
      } catch {
        // Silently fail
      } finally {
        setLoadingAssets(false);
      }
    };
    fetchAssets();
  }, [adminMode, vendorWallet, initialAssetId, initialAssetData, autoFillFromAsset]);

  // Handle asset selection change
  const handleAssetSelect = useCallback((assetIdValue: string) => {
    const found = assets.find((a) => a._id === assetIdValue);
    if (found) {
      autoFillFromAsset(found);
      if (adminMode && found.nftOwnerWallet) {
        setEffectiveVendorWallet(found.nftOwnerWallet);
      }
    }
  }, [assets, adminMode, autoFillFromAsset]);

  const getAssetImage = (asset: AssetOption | null) => {
    if (!asset) return '';
    return asset.imageUrl || asset.imageIpfsUrls?.[0] || asset.images?.[0] || '';
  };

  // Step 1: Configure and submit
  const handleConfigure = async () => {
    if (!selectedAssetId) {
      setError('Please select an asset');
      return;
    }
    if (!targetAmountUSD || parseFloat(targetAmountUSD) <= 0) {
      setError('Please enter a valid target amount');
      return;
    }

    setShowConfirmDialog(true);
  };

  const handleConfirmCreate = async () => {
    setShowConfirmDialog(false);
    setError('');
    setLoading(true);

    try {
      const walletAddress = publicKey?.toBase58();
      if (!walletAddress) {
        throw new Error('Wallet not connected');
      }

      // Step 1a: Create pool in MongoDB
      // Prepare image — try custom upload, then client-side fetch of NFT image.
      // Fall back to passing the URL for server-side fetch if client fetch fails.
      let tokenImageBase64: string | undefined;
      let tokenImageUrl: string | undefined;
      if (tokenImageFile) {
        console.log('[PoolStepper] Compressing custom uploaded image');
        tokenImageBase64 = await compressImage(tokenImageFile);
      } else if (tokenImagePreview) {
        console.log('[PoolStepper] Fetching NFT image for token:', tokenImagePreview);
        try {
          tokenImageBase64 = await fetchImageAsBase64(tokenImagePreview);
          console.log('[PoolStepper] NFT image fetched & compressed, length:', tokenImageBase64.length);
        } catch (imgErr) {
          console.warn('[PoolStepper] Client-side image fetch failed (likely CORS), server will try:', imgErr);
          tokenImageUrl = tokenImagePreview;
        }
      }

      const createRes = await fetch('/api/pool/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': walletAddress,
          'x-wallet-signature': 'stepper-flow', // Pool create uses walletAuth
        },
        body: JSON.stringify({
          assetId: selectedAssetId,
          targetAmountUSD: parseFloat(targetAmountUSD),
          minBuyInUSD: parseFloat(minBuyInUSD),
          tokenImageBase64,
          tokenImageUrl, // Server fallback if client-side fetch failed
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || 'Failed to create pool');
      }

      const createData = await createRes.json();
      console.log('[PoolStepper] Pool created:', JSON.stringify(createData, null, 2));

      const newPoolId = createData.pool._id;
      setPoolId(newPoolId);

      // Pool create already called createPoolTokenInternal which handles Bags API
      // Check if token was already set up during pool creation
      const tokenData = createData.token;
      const poolMint = createData.pool?.bagsTokenMint;

      if (tokenData?.mint || poolMint) {
        // Token info created by pool/create — now fetch FRESH fee-share txs
        // just-in-time (the ones from pool/create were created server-side with
        // stale blockhashes that expire before the user can sign them).
        const mint = tokenData?.mint || poolMint;
        setTokenMint(mint);
        console.log('[PoolStepper] Token mint saved, fetching fresh fee-share txs:', mint);

        const setupRes = await fetch('/api/bags/create-pool-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolId: newPoolId,
            adminWallet: walletAddress,
            step: 'setup',
          }),
        });

        if (!setupRes.ok) {
          const err = await setupRes.json();
          throw new Error(err.error || 'Failed to get fee-share transactions');
        }

        const setupData = await setupRes.json();
        const transactions = setupData.transactions || [];
        console.log('[PoolStepper] Fresh fee-share txs received:', transactions.length);

        if (transactions.length > 0) {
          setFeeShareTxs(transactions);
          setTxStatuses(transactions.map(() => 'pending' as const));
          updateStep(1);
          setLoading(false);
        } else {
          // No fee-share txs needed — go straight to launch
          console.log('[PoolStepper] No fee-share txs — going to launch');
          updateStep(2);
          setLoading(false);
          await handleLaunch(newPoolId, walletAddress);
        }
      } else {
        // Token creation failed during pool create — try setup directly
        console.log('[PoolStepper] Token not created during pool create, trying setup...');
        console.log('[PoolStepper] Token error:', tokenData?.error);

        const setupRes = await fetch('/api/bags/create-pool-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolId: newPoolId,
            adminWallet: walletAddress,
            tokenName: tokenName || undefined,
            tokenSymbol: tokenSymbol || undefined,
            step: 'setup',
          }),
        });

        if (!setupRes.ok) {
          const err = await setupRes.json();
          console.error('[PoolStepper] Setup failed:', err);
          throw new Error(err.error || 'Failed to setup token via Bags API');
        }

        const setupData = await setupRes.json();
        console.log('[PoolStepper] Setup response:', JSON.stringify(setupData, null, 2));

        const mint = setupData.token?.mint || setupData.pool?.bagsTokenMint;
        setTokenMint(mint || '');

        const transactions = setupData.transactions || [];
        setFeeShareTxs(transactions);
        setTxStatuses(transactions.map(() => 'pending' as const));

        updateStep(1);
        setLoading(false);

        if (transactions.length === 0) {
          updateStep(2);
          await handleLaunch(newPoolId, walletAddress);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Configuration failed');
      setLoading(false);
      updateStepError(0);
    }
  };

  // Step 2: Sign fee-share transactions
  const handleSignFeeShare = async () => {
    if (!signTransaction || !publicKey) {
      setError('Wallet not connected');
      return;
    }

    setError('');

    for (let i = 0; i < feeShareTxs.length; i++) {
      setSigningIndex(i);
      setTxStatuses((prev) => prev.map((s, idx) => (idx === i ? 'signing' : s)));

      try {
        const txData = feeShareTxs[i];
        const txRaw = txData.transaction || txData;
        console.log(`[PoolStepper] Processing tx ${i + 1}:`, {
          hasTransaction: !!txData.transaction,
          hasBlockhash: !!txData.blockhash,
          txType: typeof txRaw,
          length: typeof txRaw === 'string' ? txRaw.length : 'N/A',
        });

        // Deserialize: try base64 first, then base58 (Bags API may use either)
        let tx: Transaction | VersionedTransaction;
        let decodeMethod = 'base64';
        const b64Buf = Buffer.from(typeof txRaw === 'string' ? txRaw : JSON.stringify(txRaw), 'base64');
        try {
          tx = VersionedTransaction.deserialize(b64Buf);
          decodeMethod = 'base64 → VersionedTransaction';
        } catch {
          try {
            tx = Transaction.from(b64Buf);
            decodeMethod = 'base64 → Transaction';
          } catch {
            // Fallback: try base58 decoding
            const bs58 = (await import('bs58')).default;
            const b58Buf = bs58.decode(typeof txRaw === 'string' ? txRaw : txRaw.transaction);
            try {
              tx = VersionedTransaction.deserialize(b58Buf);
              decodeMethod = 'base58 → VersionedTransaction';
            } catch {
              tx = Transaction.from(b58Buf);
              decodeMethod = 'base58 → Transaction';
            }
          }
        }
        console.log(`[PoolStepper] Tx ${i + 1} decoded via: ${decodeMethod}`);

        // Inspect signatures before we touch anything
        if (tx instanceof VersionedTransaction) {
          console.log(`[PoolStepper] Tx ${i + 1} signatures before:`, tx.signatures.map((s, idx) => ({
            index: idx,
            isEmpty: s.every(b => b === 0),
            firstBytes: Array.from(s.slice(0, 4)),
          })));
          console.log(`[PoolStepper] Tx ${i + 1} required signers:`, tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures).map(k => k.toBase58()));
        } else {
          console.log(`[PoolStepper] Tx ${i + 1} (legacy) signers:`, tx.signatures.map(s => ({ pubkey: s.publicKey.toBase58(), signed: !!s.signature })));
        }

        // Do NOT modify blockhash — Bags partially signs with authority keypairs
        // and modifying the message invalidates their signatures.
        // The blockhash must be fresh from just-in-time fetch (which it is).

        // Sign it
        console.log(`[PoolStepper] Tx ${i + 1} asking Phantom to sign...`);
        const signed = await signTransaction(tx);
        console.log(`[PoolStepper] Tx ${i + 1} signed by user`);

        // Send it
        const rawTx = signed.serialize();
        console.log(`[PoolStepper] Tx ${i + 1} sending to network, size: ${rawTx.length} bytes`);
        const sig = await connection.sendRawTransaction(rawTx, {
          skipPreflight: false,
          maxRetries: 3,
        });
        console.log(`[PoolStepper] Tx ${i + 1} submitted: ${sig}`);
        await connection.confirmTransaction(sig, 'confirmed');
        console.log(`[PoolStepper] Tx ${i + 1} confirmed on-chain: https://solscan.io/tx/${sig}`);

        setTxStatuses((prev) => prev.map((s, idx) => (idx === i ? 'done' : s)));
      } catch (err: any) {
        console.error(`[PoolStepper] Tx ${i + 1} FAILED:`, err);
        if (err.logs) console.error(`[PoolStepper] Tx ${i + 1} logs:`, err.logs);
        setTxStatuses((prev) => prev.map((s, idx) => (idx === i ? 'failed' : s)));
        setError(`Transaction ${i + 1} failed: ${err.message || 'Unknown error'}`);
        updateStepError(1);
        return;
      }
    }

    setSigningIndex(-1);

    // All signed - advance to step 3
    console.log('[PoolStepper] All fee-share txs confirmed. Waiting 3s for Bags to detect on-chain config...');
    updateStep(2);
    // Small delay so Bags' indexer catches up to the on-chain fee-share config
    await new Promise((r) => setTimeout(r, 3000));
    const walletAddress = publicKey.toBase58();
    console.log('[PoolStepper] Starting launch step');
    await handleLaunch(poolId, walletAddress);
  };

  // Step 3: Launch token
  const handleLaunch = async (pId?: string, wallet?: string) => {
    const activePoolId = pId || poolId;
    const activeWallet = wallet || publicKey?.toBase58();

    if (!activePoolId || !activeWallet || !signTransaction) {
      setError('Missing pool ID or wallet');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('[PoolStepper] Requesting launch tx from Bags');
      const launchRes = await fetch('/api/bags/create-pool-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: activePoolId,
          adminWallet: activeWallet,
          step: 'launch',
        }),
      });

      if (!launchRes.ok) {
        const err = await launchRes.json();
        console.error('[PoolStepper] Launch step API error:', err);
        throw new Error(err.hint || err.error || 'Failed to get launch transaction');
      }

      const launchData = await launchRes.json();
      console.log('[PoolStepper] Launch response:', launchData);
      const launchTxData = launchData.transactions?.[0];

      if (!launchTxData) {
        throw new Error('No launch transaction returned from Bags');
      }

      const txRaw = launchTxData.transaction || launchTxData;
      console.log('[PoolStepper] Decoding launch tx, length:', typeof txRaw === 'string' ? txRaw.length : 'N/A');
      let tx: Transaction | VersionedTransaction;
      const b64Buf = Buffer.from(typeof txRaw === 'string' ? txRaw : JSON.stringify(txRaw), 'base64');
      try {
        tx = VersionedTransaction.deserialize(b64Buf);
      } catch {
        try {
          tx = Transaction.from(b64Buf);
        } catch {
          const bs58 = (await import('bs58')).default;
          const b58Buf = bs58.decode(typeof txRaw === 'string' ? txRaw : txRaw.transaction);
          try {
            tx = VersionedTransaction.deserialize(b58Buf);
          } catch {
            tx = Transaction.from(b58Buf);
          }
        }
      }
      console.log('[PoolStepper] Launch tx decoded, asking Phantom to sign');

      // Do NOT refresh blockhash — Bags signs with authority keypairs
      const signed = await signTransaction(tx);
      console.log('[PoolStepper] Launch tx signed, submitting');
      const rawTx = signed.serialize();
      const sig = await connection.sendRawTransaction(rawTx, { skipPreflight: false, maxRetries: 3 });
      console.log('[PoolStepper] Launch tx submitted:', sig);
      await connection.confirmTransaction(sig, 'confirmed');
      console.log('[PoolStepper] Launch tx CONFIRMED:', `https://solscan.io/tx/${sig}`);

      // Advance to step 4 (confirm)
      updateStep(3);
      setLoading(false);

      toast.success('Pool created successfully!');
    } catch (err: any) {
      console.error('[PoolStepper] Launch failed:', err);
      if (err.logs) console.error('[PoolStepper] Launch tx logs:', err.logs);
      setError(err.message || 'Launch failed');
      setLoading(false);
      updateStepError(2);
    }
  };

  // Step helpers
  const updateStep = (newStep: number) => {
    setCurrentStep(newStep);
    setStepStatuses((prev) =>
      prev.map((s, i) => {
        if (i < newStep) return 'complete';
        if (i === newStep) return 'active';
        return 'pending';
      })
    );
  };

  const updateStepError = (stepIdx: number) => {
    setStepStatuses((prev) => prev.map((s, i) => (i === stepIdx ? 'error' : s)));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const truncateAddress = (addr: string) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

  // Render stepper dots
  const renderStepperProgress = () => (
    <div className={styles.stepperProgress}>
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const status = stepStatuses[i];
        return (
          <React.Fragment key={step.label}>
            <div className={styles.step}>
              <div
                className={`${styles.stepDot} ${
                  status === 'active' ? styles.stepDotActive :
                  status === 'complete' ? styles.stepDotComplete :
                  status === 'error' ? styles.stepDotError : ''
                }`}
              >
                {status === 'complete' ? (
                  <FiCheckCircle />
                ) : status === 'error' ? (
                  <FiAlertTriangle />
                ) : (
                  <Icon />
                )}
              </div>
              <span className={`${styles.stepLabel} ${status === 'active' ? styles.stepLabelActive : ''}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`${styles.stepConnector} ${
                  stepStatuses[i] === 'complete' ? styles.stepConnectorComplete : ''
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  // Step 1: Configure form
  const renderConfigure = () => (
    <div className={styles.stepContent}>
      <div className={styles.stepTitle}>Configure Pool</div>

      {/* Asset selector — always show when no asset pre-selected */}
      {!selectedAsset ? (
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Select Watch to Tokenize</label>
          {loadingAssets ? (
            <div className={styles.loadingState}>
              <FiLoader className={styles.spinner} /> Loading your watches...
            </div>
          ) : assets.length === 0 ? (
            <div className={styles.loadingState}>
              No eligible watches found. Mint a watch first.
            </div>
          ) : (
            <select
              className={styles.formSelect}
              value={selectedAssetId}
              onChange={(e) => handleAssetSelect(e.target.value)}
            >
              <option value="">-- Choose a watch --</option>
              {assets.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.brand} {a.model} (${a.priceUSD?.toLocaleString()})
                </option>
              ))}
            </select>
          )}
        </div>
      ) : null}

      {selectedAsset && (
        <div className={styles.assetPreview}>
          {getAssetImage(selectedAsset) && (
            <img
              src={getAssetImage(selectedAsset)}
              alt={`${selectedAsset.brand} ${selectedAsset.model}`}
              className={styles.assetPreviewImg}
            />
          )}
          <div className={styles.assetPreviewInfo}>
            <div className={styles.assetPreviewName}>
              {selectedAsset.brand} {selectedAsset.model}
            </div>
            <div className={styles.assetPreviewDetail}>
              ${selectedAsset.priceUSD?.toLocaleString()}
            </div>
          </div>
          <button
            className={styles.btnSecondary}
            onClick={() => {
              setSelectedAsset(null);
              setSelectedAssetId('');
              setTokenName('');
              setTokenSymbol('');
              setTargetAmountUSD('');
            }}
            style={{ padding: '4px 10px', fontSize: '11px', marginLeft: 'auto' }}
          >
            Change
          </button>
        </div>
      )}

      {/* Token Image Upload */}
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Token Image</label>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          {(tokenImagePreview || tokenImageFile) && (
            <img
              src={tokenImageFile ? URL.createObjectURL(tokenImageFile) : tokenImagePreview}
              alt="Token"
              style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', border: '1px solid rgba(200,161,255,0.15)' }}
            />
          )}
          <div style={{ flex: 1 }}>
            <input
              type="file"
              accept="image/*"
              id="tokenImageUpload"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setTokenImageFile(file);
                  setTokenImagePreview(URL.createObjectURL(file));
                }
              }}
            />
            <label
              htmlFor="tokenImageUpload"
              className={styles.btnSecondary}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', padding: '6px 12px' }}
            >
              {tokenImageFile ? 'Change Image' : tokenImagePreview ? 'Replace NFT Image' : 'Upload Image'}
            </label>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginLeft: '8px' }}>
              {tokenImageFile ? tokenImageFile.name : 'Uses NFT image by default'}
            </span>
          </div>
        </div>
      </div>

      {/* Token Name — locked to NFT name */}
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Token Name (from NFT)</label>
        <input
          className={styles.formInput}
          value={tokenName}
          disabled
          style={{ opacity: 0.6, cursor: 'not-allowed' }}
        />
      </div>

      {/* Token Symbol — auto-assigned LUX0001 by backend */}
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Token Symbol (auto-assigned)</label>
        <input
          className={styles.formInput}
          value={tokenSymbol}
          disabled
          style={{ opacity: 0.6, cursor: 'not-allowed' }}
          placeholder="Assigned on creation"
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Target Amount (USD)</label>
        <input
          className={styles.formInput}
          type="number"
          value={targetAmountUSD}
          onChange={(e) => setTargetAmountUSD(e.target.value)}
          placeholder="e.g. 15000"
          min={0}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Min Buy-In (USD)</label>
        <input
          className={styles.formInput}
          type="number"
          value={minBuyInUSD}
          onChange={(e) => setMinBuyInUSD(e.target.value)}
          placeholder="1.50"
          min={0}
          step={0.01}
        />
      </div>

      {showConfirmDialog && (
        <div className={styles.confirmDialog}>
          This will launch a token for this watch and remove the direct listing. Continue?
        </div>
      )}

      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.btnRow}>
        {onCancel && (
          <button className={styles.btnSecondary} onClick={onCancel}>
            Cancel
          </button>
        )}
        {!showConfirmDialog ? (
          <button
            className={styles.btnPrimary}
            onClick={handleConfigure}
            disabled={loading || !selectedAssetId}
          >
            {loading ? <FiLoader className={styles.spinner} /> : null}
            Continue
          </button>
        ) : (
          <button
            className={styles.btnPrimary}
            onClick={handleConfirmCreate}
            disabled={loading}
          >
            {loading ? <FiLoader className={styles.spinner} /> : null}
            Confirm & Create
          </button>
        )}
      </div>
    </div>
  );

  // Step 2: Sign fee-share
  const renderFeeShare = () => (
    <div className={styles.stepContent}>
      <div className={styles.stepTitle}>Sign Fee-Share Transactions</div>
      <p style={{ fontSize: '13px', color: '#a1a1a1', marginBottom: '16px' }}>
        Sign {feeShareTxs.length} transaction{feeShareTxs.length !== 1 ? 's' : ''} to configure fee-share on-chain.
      </p>

      <div className={styles.txList}>
        {feeShareTxs.map((_, i) => {
          const status = txStatuses[i];
          return (
            <div key={i} className={styles.txItem}>
              <div className={styles.txIcon}>
                {status === 'done' ? (
                  <FiCheckCircle className={styles.txDone} />
                ) : status === 'signing' ? (
                  <FiLoader className={styles.txSigning} />
                ) : status === 'failed' ? (
                  <FiAlertTriangle className={styles.txFailed} />
                ) : (
                  <FiLoader className={styles.txPending} />
                )}
              </div>
              <span className={styles.txLabel}>
                {status === 'signing'
                  ? `Signing ${i + 1}/${feeShareTxs.length}...`
                  : status === 'done'
                  ? `Transaction ${i + 1} confirmed`
                  : status === 'failed'
                  ? `Transaction ${i + 1} failed`
                  : `Transaction ${i + 1}`}
              </span>
            </div>
          );
        })}
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.btnRow}>
        {error && (
          <button
            className={styles.retryBtn}
            onClick={() => {
              setError('');
              handleSignFeeShare();
            }}
          >
            Retry
          </button>
        )}
        {signingIndex === -1 && !txStatuses.every((s) => s === 'done') && (
          <button className={styles.btnPrimary} onClick={handleSignFeeShare} disabled={loading}>
            Sign All Transactions
          </button>
        )}
      </div>
    </div>
  );

  // Step 3: Launch
  const renderLaunch = () => (
    <div className={styles.stepContent}>
      <div className={styles.stepTitle}>Launch Token</div>
      <p style={{ fontSize: '13px', color: '#a1a1a1', marginBottom: '16px' }}>
        Launching bonding curve...
      </p>

      {loading && (
        <div className={styles.loadingState}>
          <FiLoader className={styles.spinner} />
          <span>Creating bonding curve on Bags...</span>
        </div>
      )}

      {error && (
        <>
          <div className={styles.errorMsg}>{error}</div>
          <div className={styles.btnRow}>
            <button
              className={styles.retryBtn}
              onClick={() => {
                setError('');
                handleLaunch();
              }}
            >
              Retry Launch
            </button>
          </div>
        </>
      )}
    </div>
  );

  // Step 4: Confirm
  const renderConfirm = () => (
    <div className={styles.stepContent}>
      <div className={styles.successState}>
        <div className={styles.successIcon}>
          <FiCheckCircle />
        </div>
        <div className={styles.successTitle}>Pool Created Successfully!</div>

        {tokenMint && (
          <div
            className={styles.successMint}
            onClick={() => copyToClipboard(tokenMint)}
            title="Click to copy"
          >
            Token: {truncateAddress(tokenMint)} <FiCopy size={12} />
          </div>
        )}

        <div className={styles.btnRow} style={{ justifyContent: 'center' }}>
          <a
            href={`/pools/${poolId}`}
            className={styles.btnPrimary}
            style={{ textDecoration: 'none' }}
          >
            <FiExternalLink /> View Pool
          </a>
          {onComplete && (
            <button className={styles.btnSecondary} onClick={() => onComplete(poolId)}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Main render
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0:
        return renderConfigure();
      case 1:
        return renderFeeShare();
      case 2:
        return renderLaunch();
      case 3:
        return renderConfirm();
      default:
        return null;
    }
  };

  return (
    <div>
      {renderStepperProgress()}
      {renderCurrentStep()}
    </div>
  );
}

export default PoolCreationStepper;
