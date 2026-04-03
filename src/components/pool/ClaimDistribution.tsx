// src/components/pool/ClaimDistribution.tsx
// Claim proceeds panel — replaces trade widget after resale/distribution (D-10)
import React, { useState } from 'react';
import { FaCheckCircle, FaExternalLinkAlt } from 'react-icons/fa';
import { FiLoader } from 'react-icons/fi';
import { getClusterConfig } from '@/lib/solana/clusterConfig';
import styles from '../../styles/PoolDetailV2.module.css';

interface ClaimDistributionProps {
  poolId: string;
  claimerWallet: string;
  claimableAmount: number;
  ownershipPercent: number;
  claimed: boolean;
  claimWindowExpiresAt?: string;
  txSignature?: string;
}

export const ClaimDistribution: React.FC<ClaimDistributionProps> = ({
  poolId,
  claimerWallet,
  claimableAmount,
  ownershipPercent,
  claimed,
  claimWindowExpiresAt,
  txSignature: existingTxSig,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimedLocal, setClaimedLocal] = useState(claimed);
  const [claimTx, setClaimTx] = useState<string | null>(existingTxSig || null);

  // Calculate days remaining for claim window
  const daysRemaining = claimWindowExpiresAt
    ? Math.ceil(
        (new Date(claimWindowExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null;

  // Wallet not connected
  if (!claimerWallet) {
    return (
      <div className={styles.claimCard}>
        <h3 className={styles.claimTitle}>Distribution</h3>
        <p className={styles.claimConnect}>Connect wallet to check your distribution</p>
      </div>
    );
  }

  // Already claimed
  if (claimedLocal) {
    const displayTx = claimTx || existingTxSig;
    return (
      <div className={styles.claimCard}>
        <div className={styles.claimSuccess}>
          <FaCheckCircle className={styles.claimCheckIcon} size={28} />
          <span className={styles.claimSuccessText}>Proceeds Claimed</span>
          <span className={styles.claimAmount}>
            ${claimableAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
          {displayTx && (
            <a
              href={getClusterConfig().explorerTxUrl(displayTx)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.claimTxLink}
            >
              View Transaction <FaExternalLinkAlt size={10} />
            </a>
          )}
        </div>
      </div>
    );
  }

  // Claimable
  const handleClaim = async () => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Execute claim
      const res = await fetch('/api/pool/claim-distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId,
          claimerWallet,
          execute: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Claim could not be processed. Please try again or contact support.');
      }

      // Step 2: If we get a txSignature from the response, confirm it
      if (data.txSignature) {
        await fetch('/api/pool/claim-distribution', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolId,
            claimerWallet,
            txSignature: data.txSignature,
          }),
        });
        setClaimTx(data.txSignature);
      }

      setClaimedLocal(true);
    } catch (err: any) {
      console.error('Claim error:', err);
      setError(err.message || 'Claim could not be processed. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.claimCard}>
      <h3 className={styles.claimTitle}>Claim Your Proceeds</h3>

      <div className={styles.claimAmountDisplay}>
        <span className={styles.claimAmountLarge}>
          ${claimableAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
        <span className={styles.claimOwnership}>
          {ownershipPercent.toFixed(2)}% of pool
        </span>
      </div>

      {/* Claim window warning */}
      {daysRemaining !== null && daysRemaining <= 30 && daysRemaining > 0 && (
        <div className={styles.claimWarning}>
          Claim before{' '}
          {new Date(claimWindowExpiresAt!).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
          {' '}({daysRemaining} days remaining)
        </div>
      )}

      {error && <div className={styles.claimError}>{error}</div>}

      <button
        className={styles.claimButton}
        onClick={handleClaim}
        disabled={loading || claimableAmount <= 0}
      >
        {loading ? (
          <>
            <FiLoader className={styles.claimSpinner} size={16} />
            Processing...
          </>
        ) : (
          'Claim Proceeds'
        )}
      </button>
    </div>
  );
};

export default ClaimDistribution;
