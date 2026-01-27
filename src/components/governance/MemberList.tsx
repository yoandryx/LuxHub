// src/components/governance/MemberList.tsx
import React from 'react';
import styles from '../../styles/Governance.module.css';

interface SquadMember {
  wallet: string;
  tokenBalance: number;
  ownershipPercent: number;
  joinedAt: string;
  permissions: number;
}

interface MemberListProps {
  members: SquadMember[];
  userWallet?: string;
}

const MemberList: React.FC<MemberListProps> = ({ members, userWallet }) => {
  // Sort by ownership percent descending
  const sortedMembers = [...members].sort((a, b) => b.ownershipPercent - a.ownershipPercent);

  const formatBalance = (balance: number): string => {
    if (balance >= 1000000) {
      return `${(balance / 1000000).toFixed(2)}M`;
    }
    if (balance >= 1000) {
      return `${(balance / 1000).toFixed(2)}K`;
    }
    return balance.toLocaleString();
  };

  if (members.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>👥</div>
        <h3>No Members</h3>
        <p>Squad members will appear here after the pool graduates.</p>
      </div>
    );
  }

  return (
    <div className={styles.membersList}>
      {sortedMembers.map((member, index) => {
        const isUser = member.wallet === userWallet;
        const shortWallet = `${member.wallet.slice(0, 6)}...${member.wallet.slice(-4)}`;

        return (
          <div
            key={member.wallet}
            className={styles.memberRow}
            style={isUser ? { borderColor: 'var(--accent)' } : undefined}
          >
            <div className={styles.memberInfo}>
              <div className={styles.memberAvatar}>
                {index < 3 ? ['🥇', '🥈', '🥉'][index] : `#${index + 1}`}
              </div>
              <div>
                <span className={styles.memberWallet}>
                  {shortWallet}
                  {isUser && (
                    <span style={{ color: 'var(--accent)', marginLeft: '8px' }}>(You)</span>
                  )}
                </span>
              </div>
            </div>
            <div className={styles.memberStats}>
              <span className={styles.memberOwnership}>{member.ownershipPercent.toFixed(2)}%</span>
              <span className={styles.memberBalance}>
                {formatBalance(member.tokenBalance)} tokens
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MemberList;
