// src/components/governance/ProposalCard.tsx
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import VoteButton from './VoteButton';
import styles from '../../styles/Governance.module.css';

interface Proposal {
  _id: string;
  proposalType: string;
  title: string;
  description: string;
  proposedBy: string;
  proposedAt: string;
  status: string;
  approvalThreshold: number;
  forVotePower: number;
  againstVotePower: number;
  totalVotePower: number;
  forVoteCount: number;
  againstVoteCount: number;
  votingDeadline: string;
  askingPriceUSD?: number;
  offerAmountUSD?: number;
  buyerWallet?: string;
  approvalPercent: number;
  createdAt: string;
}

interface Pool {
  _id: string;
  squadMultisigPda?: string;
  squadVaultPda?: string;
  bagsTokenMint?: string;
}

interface ProposalCardProps {
  proposal: Proposal;
  pool: Pool;
  onVoteComplete?: () => void;
}

const ProposalCard: React.FC<ProposalCardProps> = ({ proposal, pool, onVoteComplete }) => {
  const { publicKey, connected } = useWallet();
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);

  const userWallet = publicKey?.toBase58();
  const isActive = proposal.status === 'active';
  const isApproved = proposal.status === 'approved';
  const hasReachedThreshold = proposal.approvalPercent >= proposal.approvalThreshold;

  // Calculate vote percentages
  const forPercent =
    proposal.totalVotePower > 0 ? (proposal.forVotePower / proposal.totalVotePower) * 100 : 0;
  const againstPercent =
    proposal.totalVotePower > 0 ? (proposal.againstVotePower / proposal.totalVotePower) * 100 : 0;

  // Format deadline
  const deadline = new Date(proposal.votingDeadline);
  const isExpired = new Date() > deadline;
  const timeRemaining = deadline.getTime() - Date.now();
  const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

  // Format proposal type
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'relist_for_sale':
        return 'Relist for Sale';
      case 'accept_offer':
        return 'Accept Offer';
      default:
        return type;
    }
  };

  // Get status styles
  const getStatusClass = (status: string) => {
    switch (status) {
      case 'active':
        return styles.statusActive;
      case 'approved':
        return styles.statusApproved;
      case 'rejected':
        return styles.statusRejected;
      case 'executed':
        return styles.statusExecuted;
      case 'expired':
        return styles.statusExpired;
      default:
        return '';
    }
  };

  const handleExecute = async () => {
    if (!connected || !userWallet) {
      setExecuteError('Connect wallet to execute');
      return;
    }

    setExecuting(true);
    setExecuteError(null);

    try {
      const response = await fetch(`/api/pool/proposals/${proposal._id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executorWallet: userWallet }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute proposal');
      }

      onVoteComplete?.();
    } catch (err: any) {
      setExecuteError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className={styles.proposalCard}>
      {/* Header */}
      <div className={styles.proposalHeader}>
        <span className={styles.proposalType}>{getTypeLabel(proposal.proposalType)}</span>
        <span className={`${styles.proposalStatus} ${getStatusClass(proposal.status)}`}>
          {proposal.status}
        </span>
      </div>

      {/* Title & Description */}
      <h3 className={styles.proposalTitle}>{proposal.title}</h3>
      <p className={styles.proposalDescription}>{proposal.description}</p>

      {/* Proposal-specific info */}
      {proposal.askingPriceUSD && (
        <div className={styles.proposalMeta}>
          <span>Asking Price: ${proposal.askingPriceUSD.toLocaleString()}</span>
        </div>
      )}
      {proposal.offerAmountUSD && (
        <div className={styles.proposalMeta}>
          <span>Offer: ${proposal.offerAmountUSD.toLocaleString()}</span>
          <span>From: {proposal.buyerWallet?.slice(0, 8)}...</span>
        </div>
      )}

      {/* Vote Progress */}
      <div className={styles.voteProgress}>
        <div className={styles.voteBar}>
          <div className={styles.voteFor} style={{ width: `${forPercent}%` }} />
          <div className={styles.voteAgainst} style={{ width: `${againstPercent}%` }} />
        </div>
        <div className={styles.voteStats}>
          <span className={`${styles.voteStat} ${styles.voteStatFor}`}>
            For: {proposal.forVoteCount} ({forPercent.toFixed(1)}%)
          </span>
          <span className={styles.voteThreshold}>Threshold: {proposal.approvalThreshold}%</span>
          <span className={`${styles.voteStat} ${styles.voteStatAgainst}`}>
            Against: {proposal.againstVoteCount} ({againstPercent.toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* Meta */}
      <div className={styles.proposalMeta}>
        <span className={styles.proposalProposer}>By: {proposal.proposedBy.slice(0, 8)}...</span>
        <span className={styles.proposalDeadline}>
          {isExpired
            ? 'Expired'
            : isActive
              ? `${daysRemaining}d remaining`
              : new Date(proposal.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* Vote Buttons */}
      {isActive && !isExpired && (
        <VoteButton proposalId={proposal._id} poolId={pool._id} onVoteComplete={onVoteComplete} />
      )}

      {/* Execute Button */}
      {isApproved && hasReachedThreshold && (
        <>
          <button
            className={styles.executeBtn}
            onClick={handleExecute}
            disabled={executing || !connected}
          >
            {executing ? 'Executing...' : 'Execute Proposal'}
          </button>
          {executeError && <p className={styles.formError}>{executeError}</p>}
        </>
      )}
    </div>
  );
};

export default ProposalCard;
