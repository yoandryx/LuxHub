// src/components/governance/GovernanceDashboard.tsx
import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import ProposalCard from './ProposalCard';
import CreateProposalModal from './CreateProposalModal';
import MemberList from './MemberList';
import styles from '../../styles/Governance.module.css';

interface SquadMember {
  wallet: string;
  tokenBalance: number;
  ownershipPercent: number;
  joinedAt: string;
  permissions: number;
}

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
  squadThreshold?: number;
  squadMembers?: SquadMember[];
  squadCreatedAt?: string;
  bagsTokenMint?: string;
  status: string;
}

interface GovernanceDashboardProps {
  pool: Pool;
  onProposalCreated?: () => void;
  onVoteComplete?: () => void;
}

type TabType = 'proposals' | 'members';

const GovernanceDashboard: React.FC<GovernanceDashboardProps> = ({
  pool,
  onProposalCreated,
  onVoteComplete,
}) => {
  const { publicKey } = useWallet();
  const [activeTab, setActiveTab] = useState<TabType>('proposals');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Check if current user is a member
  const userWallet = publicKey?.toBase58();
  const isMember = pool.squadMembers?.some((m) => m.wallet === userWallet);
  const userMember = pool.squadMembers?.find((m) => m.wallet === userWallet);

  useEffect(() => {
    fetchProposals();
  }, [pool._id]);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/pool/proposals?poolId=${pool._id}`);
      const data = await response.json();

      if (data.success) {
        setProposals(data.proposals);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProposalCreated = () => {
    fetchProposals();
    setShowCreateModal(false);
    onProposalCreated?.();
  };

  const handleVoteComplete = () => {
    fetchProposals();
    onVoteComplete?.();
  };

  const activeProposals = proposals.filter((p) => p.status === 'active');
  const completedProposals = proposals.filter((p) => p.status !== 'active');

  if (!pool.squadMultisigPda) {
    return (
      <div className={styles.governanceContainer}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🏛️</div>
          <h3>No DAO Yet</h3>
          <p>This pool hasn&apos;t graduated to a Squad DAO yet.</p>
          <p>DAO governance becomes available when the bonding curve completes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.governanceContainer}>
      {/* Header */}
      <div className={styles.dashboardHeader}>
        <h2 className={styles.dashboardTitle}>
          🏛️ Governance
          <span className={styles.squadBadge}>Squad DAO</span>
        </h2>
        {isMember && (
          <button className={styles.createProposalBtn} onClick={() => setShowCreateModal(true)}>
            + New Proposal
          </button>
        )}
      </div>

      {/* Squad Stats */}
      <div className={styles.squadInfo}>
        <div className={styles.squadStat}>
          <span className={styles.squadStatValue}>{pool.squadMembers?.length || 0}</span>
          <span className={styles.squadStatLabel}>Members</span>
        </div>
        <div className={styles.squadStat}>
          <span className={styles.squadStatValue}>{pool.squadThreshold || 60}%</span>
          <span className={styles.squadStatLabel}>Threshold</span>
        </div>
        <div className={styles.squadStat}>
          <span className={styles.squadStatValue}>{activeProposals.length}</span>
          <span className={styles.squadStatLabel}>Active</span>
        </div>
        <div className={styles.squadStat}>
          <span className={styles.squadStatValue}>
            {userMember ? `${userMember.ownershipPercent.toFixed(1)}%` : '-'}
          </span>
          <span className={styles.squadStatLabel}>Your Power</span>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'proposals' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('proposals')}
        >
          Proposals ({proposals.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'members' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('members')}
        >
          Members ({pool.squadMembers?.length || 0})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          Loading...
        </div>
      ) : error ? (
        <div className={styles.emptyState}>
          <p>Error: {error}</p>
        </div>
      ) : activeTab === 'proposals' ? (
        <div className={styles.proposalsSection}>
          {/* Active Proposals */}
          {activeProposals.length > 0 && (
            <>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Active Proposals</h3>
              </div>
              <div className={styles.proposalsList}>
                {activeProposals.map((proposal) => (
                  <ProposalCard
                    key={proposal._id}
                    proposal={proposal}
                    pool={pool}
                    onVoteComplete={handleVoteComplete}
                  />
                ))}
              </div>
            </>
          )}

          {/* Completed Proposals */}
          {completedProposals.length > 0 && (
            <>
              <div
                className={styles.sectionHeader}
                style={{ marginTop: activeProposals.length > 0 ? 32 : 0 }}
              >
                <h3 className={styles.sectionTitle}>Past Proposals</h3>
              </div>
              <div className={styles.proposalsList}>
                {completedProposals.map((proposal) => (
                  <ProposalCard
                    key={proposal._id}
                    proposal={proposal}
                    pool={pool}
                    onVoteComplete={handleVoteComplete}
                  />
                ))}
              </div>
            </>
          )}

          {proposals.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📋</div>
              <h3>No Proposals Yet</h3>
              <p>Be the first to create a governance proposal for this pool.</p>
            </div>
          )}
        </div>
      ) : (
        <MemberList members={pool.squadMembers || []} userWallet={userWallet} />
      )}

      {/* Create Proposal Modal */}
      {showCreateModal && (
        <CreateProposalModal
          pool={pool}
          onClose={() => setShowCreateModal(false)}
          onProposalCreated={handleProposalCreated}
        />
      )}
    </div>
  );
};

export default GovernanceDashboard;
