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

  // AI auto-fill pool details from NFT metadata
  const autoFillFromAsset = useCallback(async (asset: AssetOption) => {
    // Immediately set basic fields from asset data
    const name = `${asset.brand} ${asset.model}`.slice(0, 32);
    setTokenName(name);
    setTargetAmountUSD(String(asset.priceUSD || ''));
    setSelectedAsset(asset);
    setSelectedAssetId(asset._id);

    // Generate LUX-prefixed symbol from model name (more unique than brand at scale)
    // e.g. Submariner → LUXSUB, Nautilus → LUXNAUT, Tank → LUXTANK, Daytona → LUXDAY
    const modelClean = (asset.model || '').toUpperCase().replace(/[^A-Z]/g, '');
    const modelKey = modelClean.slice(0, 4) || (asset.brand || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    const symbol = `LUX${modelKey}`;
    setTokenSymbol(symbol.slice(0, 10));

    // Generate description from asset metadata
    const desc = `Tokenized ${asset.brand} ${asset.model} pool — backed by an authenticated luxury timepiece valued at $${(asset.priceUSD || 0).toLocaleString()}. Buy tokens to participate in this asset pool. When the watch resells, token holders receive their proportional share of proceeds.`;
    setTokenDescription(desc);

    // Try AI-enhanced description if available
    setAutoFilling(true);
    try {
      const res = await fetch('/api/ai/pool-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: asset.brand,
          model: asset.model,
          priceUSD: asset.priceUSD,
          imageUrl: asset.imageUrl || asset.imageIpfsUrls?.[0],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.description) setTokenDescription(data.description);
        if (data.symbol) setTokenSymbol(data.symbol);
      }
    } catch {
      // Keep the fallback description — AI is optional enhancement
    } finally {
      setAutoFilling(false);
    }
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
          // Filter out already-pooled items and map to AssetOption
          const assetList: AssetOption[] = listings
            .filter((l: any) => l.status === 'minted' && !l.pooled)
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
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || 'Failed to create pool');
      }

      const createData = await createRes.json();
      const newPoolId = createData.pool._id;
      setPoolId(newPoolId);

      // Step 1b: Setup Bags token (Phase 1 - get fee-share txs)
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
        throw new Error(err.error || 'Failed to setup token');
      }

      const setupData = await setupRes.json();
      const mint = setupData.token?.mint || setupData.pool?.bagsTokenMint;
      setTokenMint(mint || '');

      const transactions = setupData.transactions || [];
      setFeeShareTxs(transactions);
      setTxStatuses(transactions.map(() => 'pending' as const));

      // Advance to step 2
      updateStep(1);
      setLoading(false);

      // If no fee-share txs needed, skip to step 3
      if (transactions.length === 0) {
        updateStep(2);
        await handleLaunch(newPoolId, walletAddress);
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
        const txBase64 = txData.transaction || txData;

        // Deserialize the transaction
        const txBuffer = Buffer.from(typeof txBase64 === 'string' ? txBase64 : txBase64.transaction, 'base64');
        let tx: Transaction | VersionedTransaction;
        try {
          tx = VersionedTransaction.deserialize(txBuffer);
        } catch {
          tx = Transaction.from(txBuffer);
        }

        // Sign it
        const signed = await signTransaction(tx);

        // Send it
        const rawTx = signed.serialize();
        const sig = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
        await connection.confirmTransaction(sig, 'confirmed');

        setTxStatuses((prev) => prev.map((s, idx) => (idx === i ? 'done' : s)));
      } catch (err: any) {
        setTxStatuses((prev) => prev.map((s, idx) => (idx === i ? 'failed' : s)));
        setError(`Transaction ${i + 1} failed: ${err.message || 'Unknown error'}`);
        updateStepError(1);
        return;
      }
    }

    setSigningIndex(-1);

    // All signed - advance to step 3
    updateStep(2);
    const walletAddress = publicKey.toBase58();
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
        throw new Error(err.error || 'Failed to get launch transaction');
      }

      const launchData = await launchRes.json();
      const launchTxData = launchData.transactions?.[0];

      if (launchTxData) {
        const txBase64 = launchTxData.transaction || launchTxData;
        const txBuffer = Buffer.from(typeof txBase64 === 'string' ? txBase64 : txBase64.transaction, 'base64');
        let tx: Transaction | VersionedTransaction;
        try {
          tx = VersionedTransaction.deserialize(txBuffer);
        } catch {
          tx = Transaction.from(txBuffer);
        }

        const signed = await signTransaction(tx);
        const rawTx = signed.serialize();
        const sig = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
        await connection.confirmTransaction(sig, 'confirmed');
      }

      // Advance to step 4 (confirm)
      updateStep(3);
      setLoading(false);

      toast.success('Pool created successfully!');
    } catch (err: any) {
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

      {/* Asset selector (admin mode) or asset preview (vendor mode) */}
      {adminMode && !initialAssetId ? (
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Select Asset</label>
          {loadingAssets ? (
            <div className={styles.loadingState}>
              <FiLoader className={styles.spinner} /> Loading assets...
            </div>
          ) : (
            <select
              className={styles.formSelect}
              value={selectedAssetId}
              onChange={(e) => handleAssetSelect(e.target.value)}
            >
              <option value="">-- Choose an asset --</option>
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
        </div>
      )}

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Token Name</label>
        <input
          className={styles.formInput}
          value={tokenName}
          onChange={(e) => setTokenName(e.target.value.slice(0, 32))}
          placeholder="e.g. Rolex Submariner"
          maxLength={32}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Token Symbol</label>
        <input
          className={styles.formInput}
          value={tokenSymbol}
          onChange={(e) => setTokenSymbol(e.target.value.slice(0, 10).toUpperCase())}
          placeholder="e.g. RSUB"
          maxLength={10}
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
