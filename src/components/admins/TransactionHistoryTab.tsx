// src/components/admins/TransactionHistoryTab.tsx
// Admin tab for viewing transaction history across the platform
import React, { useState, useEffect, useCallback } from 'react';
import styles from '../../styles/AdminDashboard.module.css';
import {
  HiOutlineExternalLink,
  HiOutlineRefresh,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi';

interface Transaction {
  _id: string;
  type: string;
  fromWallet?: string;
  toWallet?: string;
  amountUSD?: number;
  amountSOL?: number;
  vendorEarningsUSD?: number;
  luxhubRoyaltyUSD?: number;
  txSignature?: string;
  mintTxSignature?: string;
  status: string;
  createdAt: string;
  asset?: string;
  escrow?: string;
  pool?: string;
}

export const TransactionHistoryTab: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });
      if (filter !== 'all') params.append('type', filter);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const token = localStorage.getItem('luxhub_token');
      const res = await fetch(`/api/treasury/transactions?${params.toString()}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [filter, statusFilter, page]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const formatWallet = (wallet?: string) => {
    if (!wallet) return 'N/A';
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'success':
        return styles.approved;
      case 'pending':
        return styles.pending;
      case 'failed':
        return styles.rejected;
      default:
        return styles.active;
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      sale: 'Sale',
      investment: 'Pool Investment',
      royalty_payout: 'Royalty Payout',
      mint: 'NFT Mint',
      burn: 'NFT Burn',
      refund: 'Refund',
      pool_distribution: 'Pool Distribution',
      pool_burn: 'Pool Burn',
      offer_acceptance: 'Offer Accepted',
      negotiation_settlement: 'Negotiation',
    };
    return labels[type] || type;
  };

  return (
    <div className={styles.section}>
      {/* Filter Bar */}
      <div className={styles.filterBar}>
        <div className={styles.searchInput}>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
            className={styles.filterSelect}
            style={{ border: 'none', background: 'transparent', flex: 1 }}
          >
            <option value="all">All Types</option>
            <option value="sale">Sales</option>
            <option value="investment">Investments</option>
            <option value="royalty_payout">Royalty Payouts</option>
            <option value="mint">Mints</option>
            <option value="refund">Refunds</option>
            <option value="pool_distribution">Pool Distributions</option>
          </select>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className={styles.filterSelect}
        >
          <option value="all">All Statuses</option>
          <option value="success">Success</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <button className={styles.refreshBtn} onClick={fetchTransactions} disabled={loading}>
          <HiOutlineRefresh className={loading ? styles.spinning : ''} />
          Refresh
        </button>
      </div>

      {/* Transaction Cards */}
      {loading ? (
        <div className={styles.loadingTab}>
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>Loading transactions...</span>
        </div>
      ) : transactions.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <HiOutlineExternalLink />
          </div>
          <h3 className={styles.emptyTitle}>No transactions found</h3>
          <p className={styles.emptyDescription}>
            {filter !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Transactions will appear here once marketplace activity begins'}
          </p>
        </div>
      ) : (
        <div className={styles.cardsGrid}>
          {transactions.map((tx) => (
            <div key={tx._id} className={styles.dataCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitleArea}>
                  <h3 className={styles.cardTitle}>{getTypeLabel(tx.type)}</h3>
                  <span className={styles.cardSubtitle}>{formatDate(tx.createdAt)}</span>
                </div>
                <span className={`${styles.cardStatus} ${getStatusClass(tx.status)}`}>
                  {tx.status}
                </span>
              </div>

              <div className={styles.cardBody}>
                {(tx.amountUSD !== undefined || tx.amountSOL !== undefined) && (
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Amount</span>
                    <span className={`${styles.cardValue} ${styles.cardHighlight}`}>
                      {tx.amountUSD !== undefined
                        ? `$${tx.amountUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : tx.amountSOL !== undefined
                          ? `${tx.amountSOL.toFixed(4)} SOL`
                          : 'N/A'}
                    </span>
                  </div>
                )}
                {tx.fromWallet && (
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>From</span>
                    <span className={styles.cardValue}>{formatWallet(tx.fromWallet)}</span>
                  </div>
                )}
                {tx.toWallet && (
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>To</span>
                    <span className={styles.cardValue}>{formatWallet(tx.toWallet)}</span>
                  </div>
                )}
                {tx.luxhubRoyaltyUSD !== undefined && tx.luxhubRoyaltyUSD > 0 && (
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>LuxHub Fee (3%)</span>
                    <span className={styles.cardValue}>${tx.luxhubRoyaltyUSD.toFixed(2)}</span>
                  </div>
                )}
                {tx.vendorEarningsUSD !== undefined && tx.vendorEarningsUSD > 0 && (
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Vendor Earnings</span>
                    <span className={styles.cardValue}>${tx.vendorEarningsUSD.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {(tx.txSignature || tx.mintTxSignature) && (
                <div className={styles.cardFooter}>
                  <a
                    href={`https://solscan.io/tx/${tx.txSignature || tx.mintTxSignature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.cardBtn}
                  >
                    <HiOutlineExternalLink />
                    View on Solscan
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && transactions.length > 0 && (
        <div className={styles.pagination}>
          <button
            className={styles.paginationBtn}
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <HiOutlineChevronLeft /> Previous
          </button>
          <span className={styles.paginationInfo}>
            Page {page} of {totalPages}
          </span>
          <button
            className={styles.paginationBtn}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <HiOutlineChevronRight />
          </button>
        </div>
      )}
    </div>
  );
};

export default TransactionHistoryTab;
