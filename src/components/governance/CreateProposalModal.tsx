// src/components/governance/CreateProposalModal.tsx
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/Governance.module.css';

interface Pool {
  _id: string;
  squadMultisigPda?: string;
  squadVaultPda?: string;
  bagsTokenMint?: string;
}

interface CreateProposalModalProps {
  pool: Pool;
  onClose: () => void;
  onProposalCreated: () => void;
}

type ProposalType = 'relist_for_sale' | 'accept_offer';

const CreateProposalModal: React.FC<CreateProposalModalProps> = ({
  pool,
  onClose,
  onProposalCreated,
}) => {
  const { publicKey, connected } = useWallet();
  const [proposalType, setProposalType] = useState<ProposalType>('relist_for_sale');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [askingPriceUSD, setAskingPriceUSD] = useState('');
  const [offerAmountUSD, setOfferAmountUSD] = useState('');
  const [buyerWallet, setBuyerWallet] = useState('');
  const [votingDeadlineDays, setVotingDeadlineDays] = useState('7');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userWallet = publicKey?.toBase58();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!connected || !userWallet) {
      setError('Connect your wallet to create a proposal');
      return;
    }

    if (!title.trim() || !description.trim()) {
      setError('Title and description are required');
      return;
    }

    if (proposalType === 'relist_for_sale' && !askingPriceUSD) {
      setError('Asking price is required for relist proposals');
      return;
    }

    if (proposalType === 'accept_offer' && (!offerAmountUSD || !buyerWallet)) {
      setError('Offer amount and buyer wallet are required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/pool/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: pool._id,
          proposerWallet: userWallet,
          proposalType,
          title: title.trim(),
          description: description.trim(),
          ...(proposalType === 'relist_for_sale' && {
            askingPriceUSD: parseFloat(askingPriceUSD),
          }),
          ...(proposalType === 'accept_offer' && {
            offerAmountUSD: parseFloat(offerAmountUSD),
            buyerWallet: buyerWallet.trim(),
          }),
          votingDeadlineDays: parseInt(votingDeadlineDays, 10),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create proposal');
      }

      onProposalCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Create Proposal</h2>
          <button className={styles.modalClose} onClick={onClose}>
            ×
          </button>
        </div>

        <form className={styles.modalBody} onSubmit={handleSubmit}>
          {/* Proposal Type */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Proposal Type</label>
            <select
              className={styles.formSelect}
              value={proposalType}
              onChange={(e) => setProposalType(e.target.value as ProposalType)}
            >
              <option value="relist_for_sale">Relist for Sale</option>
              <option value="accept_offer">Accept Offer</option>
            </select>
            <p className={styles.formHint}>
              {proposalType === 'relist_for_sale'
                ? 'Set an asking price to list the asset for sale'
                : 'Accept a purchase offer from a buyer'}
            </p>
          </div>

          {/* Title */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Title</label>
            <input
              type="text"
              className={styles.formInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief title for your proposal"
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Description</label>
            <textarea
              className={styles.formTextarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain your proposal and why members should vote for it..."
              maxLength={2000}
            />
          </div>

          {/* Relist for Sale Fields */}
          {proposalType === 'relist_for_sale' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Asking Price (USD)</label>
              <input
                type="number"
                className={styles.formInput}
                value={askingPriceUSD}
                onChange={(e) => setAskingPriceUSD(e.target.value)}
                placeholder="100000"
                min="0"
                step="0.01"
              />
              <p className={styles.formHint}>
                The price at which the asset will be listed for sale
              </p>
            </div>
          )}

          {/* Accept Offer Fields */}
          {proposalType === 'accept_offer' && (
            <>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Offer Amount (USD)</label>
                <input
                  type="number"
                  className={styles.formInput}
                  value={offerAmountUSD}
                  onChange={(e) => setOfferAmountUSD(e.target.value)}
                  placeholder="95000"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Buyer Wallet</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={buyerWallet}
                  onChange={(e) => setBuyerWallet(e.target.value)}
                  placeholder="Buyer's Solana wallet address"
                />
              </div>
            </>
          )}

          {/* Voting Duration */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Voting Duration</label>
            <select
              className={styles.formSelect}
              value={votingDeadlineDays}
              onChange={(e) => setVotingDeadlineDays(e.target.value)}
            >
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
            <p className={styles.formHint}>How long members have to vote on this proposal</p>
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={submitting || !connected}>
            {submitting ? 'Creating...' : 'Create Proposal'}
          </button>

          {!connected && (
            <p className={styles.formHint} style={{ textAlign: 'center', marginTop: '12px' }}>
              Connect wallet to create a proposal
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

export default CreateProposalModal;
