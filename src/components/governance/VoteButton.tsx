// src/components/governance/VoteButton.tsx
import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/Governance.module.css';

interface VoteButtonProps {
  proposalId: string;
  poolId: string;
  onVoteComplete?: () => void;
}

const VoteButton: React.FC<VoteButtonProps> = ({ proposalId, poolId, onVoteComplete }) => {
  const { publicKey, connected } = useWallet();
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingVote, setExistingVote] = useState<'for' | 'against' | null>(null);
  const [checkingVote, setCheckingVote] = useState(true);

  const userWallet = publicKey?.toBase58();

  useEffect(() => {
    checkExistingVote();
  }, [proposalId, userWallet]);

  const checkExistingVote = async () => {
    if (!userWallet) {
      setCheckingVote(false);
      return;
    }

    try {
      setCheckingVote(true);
      const response = await fetch(`/api/pool/proposals/${proposalId}`);
      const data = await response.json();

      if (data.success && data.proposal.voters) {
        const vote = data.proposal.voters.find(
          (v: { wallet: string; vote: string }) => v.wallet === userWallet
        );
        if (vote) {
          setExistingVote(vote.vote as 'for' | 'against');
        }
      }
    } catch (err) {
      console.error('Error checking existing vote:', err);
    } finally {
      setCheckingVote(false);
    }
  };

  const handleVote = async (vote: 'for' | 'against') => {
    if (!connected || !userWallet) {
      setError('Connect your wallet to vote');
      return;
    }

    setVoting(true);
    setError(null);

    try {
      const response = await fetch(`/api/pool/proposals/${proposalId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voterWallet: userWallet,
          vote,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit vote');
      }

      setExistingVote(vote);
      onVoteComplete?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVoting(false);
    }
  };

  if (checkingVote) {
    return (
      <div className={styles.voteButtons}>
        <div className={styles.loading} style={{ padding: '12px' }}>
          <div className={styles.spinner} style={{ width: '20px', height: '20px' }} />
        </div>
      </div>
    );
  }

  if (existingVote) {
    return (
      <div className={styles.votedBadge}>
        You voted {existingVote === 'for' ? '👍 For' : '👎 Against'}
      </div>
    );
  }

  return (
    <>
      <div className={styles.voteButtons}>
        <button
          className={`${styles.voteBtn} ${styles.voteBtnFor}`}
          onClick={() => handleVote('for')}
          disabled={voting || !connected}
        >
          {voting ? '...' : '👍'} Vote For
        </button>
        <button
          className={`${styles.voteBtn} ${styles.voteBtnAgainst}`}
          onClick={() => handleVote('against')}
          disabled={voting || !connected}
        >
          {voting ? '...' : '👎'} Vote Against
        </button>
      </div>
      {error && <p className={styles.formError}>{error}</p>}
      {!connected && (
        <p className={styles.formHint} style={{ textAlign: 'center', marginTop: '8px' }}>
          Connect wallet to vote
        </p>
      )}
    </>
  );
};

export default VoteButton;
