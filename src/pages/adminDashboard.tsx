// src/pages/AdminDashboard.tsx
import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from '@solana/wallet-adapter-react';
import { useEffectiveWallet } from '../hooks/useEffectiveWallet';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Connection, Keypair, TransactionMessage } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { getProgram } from '../utils/programUtils';
import { getClusterConfig } from '@/lib/solana/clusterConfig';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
// Metaplex loaded dynamically where needed to reduce bundle size
import { uploadToPinata } from '../utils/pinata';
import { updateNftMetadata } from '../utils/metadata';
import styles from '../styles/AdminDashboard.module.css';
import toast from 'react-hot-toast';
import {
  HiOutlineClipboardList,
  HiOutlineCog,
  HiOutlineShieldCheck,
  HiOutlineTruck,
  HiOutlineDocumentText,
  HiOutlineUserGroup,
  HiOutlineCollection,
  HiOutlineRefresh,
  HiOutlineLockClosed,
  HiOutlineSearch,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineExternalLink,
  HiOutlineCube,
  HiOutlineKey,
  HiOutlineDatabase,
  HiOutlineHome,
  HiOutlineCash,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineLightningBolt,
  HiOutlineTrash,
  HiOutlineExclamation,
  HiOutlineViewGrid,
  HiOutlineX,
} from 'react-icons/hi';
import { VendorProfile } from '../lib/models/VendorProfile';

// Lazy load tab components to reduce initial bundle size (~45KB saved)
const MetadataEditorTab = lazy(() =>
  import('../components/admins/MetadataEditorTab').then((m) => ({ default: m.MetadataEditorTab }))
);
const MetadataChangeRequestsTab = lazy(() =>
  import('../components/admins/MetadataChangeRequestsTab').then((m) => ({
    default: m.MetadataChangeRequestsTab,
  }))
);
const ShipmentVerificationTab = lazy(() =>
  import('../components/admins/ShipmentVerificationTab').then((m) => ({
    default: m.ShipmentVerificationTab,
  }))
);
const VendorManagementPanel = lazy(() => import('../components/vendor/VendorManagementPanel'));
const CustodyDashboard = lazy(() => import('../components/admin/CustodyDashboard'));
const TransactionHistoryTab = lazy(() =>
  import('../components/admins/TransactionHistoryTab').then((m) => ({
    default: m.TransactionHistoryTab,
  }))
);
const VaultInventoryTab = lazy(() =>
  import('../components/admins/VaultInventoryTab').then((m) => ({
    default: m.VaultInventoryTab,
  }))
);
const VaultConfigPanel = lazy(() =>
  import('../components/admins/VaultConfigPanel').then((m) => ({
    default: m.VaultConfigPanel,
  }))
);
const PlatformSettingsPanel = lazy(() =>
  import('../components/admins/PlatformSettingsPanel').then((m) => ({
    default: m.PlatformSettingsPanel,
  }))
);
const AssetCleanupPanel = lazy(() => import('../components/admins/AssetCleanupPanel'));
const DelistRequestsPanel = lazy(() => import('../components/admins/DelistRequestsPanel'));
const MintRequestsPanel = lazy(() => import('../components/admins/MintRequestsPanel'));

// Loading fallback for lazy components
const TabLoader = () => <div className={styles.loadingTab}>Loading...</div>;
// Squads multisig loaded dynamically where needed to reduce bundle size
import { Buffer } from 'buffer'; // for base64 encoding in browser

interface LogEntry {
  timestamp: string;
  action: string;
  tx: string;
  message: string;
}

interface SquadsProposal {
  transactionIndex: string;
  status: 'active' | 'executed' | 'rejected' | 'cancelled' | 'approved' | 'draft';
  approvals: number;
  rejections: number;
  threshold: number;
  proposalPda: string;
  vaultTransactionPda: string;
}

interface SaleRequest {
  nftId: string; // NFT mint address
  seller: string; // Seller wallet
  seed: number;
  initializerAmount: number;
  takerAmount: number;
  fileCid: string;
  salePrice: number;
  ipfs_pin_hash?: string;
  timestamp: number;
  luxhubWallet: string;
  buyer: string; // Buyer wallet
  marketStatus?: string;
}

interface SaleRequestsResponse {
  saleRequests: SaleRequest[];
  page: number;
  totalPages: number;
  totalCount: number;
}

interface EscrowAccount {
  seed: number;
  initializer: string;
  luxhub_wallet: string;
  initializer_amount: string;
  taker_amount: string;
  salePrice: string;
  file_cid: string;
  mintA: string;
  mintB: string;
  name?: string;
  image?: string;
  description?: string;
  vaultATA?: string;
  attributes?: { trait_type: string; value: string }[];
}

interface ProposeResponse {
  ok: true;
  signature: string;
  multisigPda: string;
  vaultPda: string;
  vaultIndex: number;
  transactionIndex: string;
  proposalPda: string;
  vaultTransactionPda: string;
  autoApproved: boolean;
  threshold: number;
  squadsDeepLink: string;
}

async function proposeToSquads(ix: {
  programId: string;
  keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  dataBase64: string;
  vaultIndex?: number;
  autoApprove?: boolean;
  wallet?: string;
}): Promise<ProposeResponse> {
  const resp = await fetch('/api/squads/propose', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(ix.wallet ? { 'x-wallet-address': ix.wallet } : {}),
    },
    body: JSON.stringify({
      ...ix,
      vaultIndex: ix.vaultIndex ?? 0,
      autoApprove: ix.autoApprove ?? false,
    }),
  });
  const json = await resp.json();
  if (!resp.ok || !json.ok) throw new Error(json.error || json.message || 'Failed to propose tx');
  return json as ProposeResponse;
}

// Use USDC as the funds mint (escrow holds USDC, not wSOL)
const FUNDS_MINT = getClusterConfig().usdcMint;
const LAMPORTS_PER_SOL = 1_000_000_000;
const PLACEHOLDER_BUYER = new PublicKey('11111111111111111111111111111111');

// ------------------------------------------------
// Update NFT Market Status
// ------------------------------------------------
const updateNFTMarketStatus = async (mintAddress: string, newMarketStatus: string, wallet: any) => {
  try {
    const connection = new Connection(getClusterConfig().endpoint);
    // Dynamic import Metaplex to reduce initial bundle size (~87KB saved)
    const { Metaplex, walletAdapterIdentity } = await import('@metaplex-foundation/js');
    const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));

    const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mintAddress) });

    const res = await fetch(nft.uri);
    if (!res.ok) throw new Error('Failed to fetch current metadata');
    const metadata = await res.json();

    if (!metadata.attributes || !Array.isArray(metadata.attributes)) {
      metadata.attributes = [];
    }
    let updated = false;
    metadata.attributes = metadata.attributes.map((attr: any) => {
      if (attr.trait_type === 'Market Status') {
        updated = true;
        return { ...attr, value: newMarketStatus };
      }
      return attr;
    });
    if (!updated) {
      metadata.attributes.push({ trait_type: 'Market Status', value: newMarketStatus });
    }

    metadata.updatedAt = new Date().toISOString();

    const newUri = await uploadToPinata(metadata, metadata.name || 'Updated NFT Metadata');

    const newName = nft.name.endsWith('(Active)') ? nft.name : nft.name + ' (Active)';

    await updateNftMetadata(wallet as any, mintAddress, { uri: newUri, name: newName } as any);
  } catch (error) {
    console.error('[updateNFTMarketStatus] Failed to update NFT market status:', error);
  }
};

const AdminDashboard: React.FC = () => {
  const anchorWallet = useWallet();
  const { publicKey, connected } = useEffectiveWallet();
  const [tabIndex, setTabIndex] = useState<number>(1);
  const [navOpen, setNavOpen] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const [luxhubWallet, setLuxhubWallet] = useState<string>('');
  const [newLuxhubWallet, setNewLuxhubWallet] = useState<string>('');
  const [currentEscrowConfig, setCurrentEscrowConfig] = useState<string>('');

  // On-chain EscrowConfig state
  const [onChainConfig, setOnChainConfig] = useState<{
    authority: string;
    treasury: string;
    feeBps: number;
    paused: boolean;
  } | null>(null);
  const [newFeeBps, setNewFeeBps] = useState<string>('');
  const [newPaused, setNewPaused] = useState<boolean>(false);

  const [adminList, setAdminList] = useState<string[]>([]);
  const [newAdmin, setNewAdmin] = useState<string>('');
  const [removeAdminAddr, setRemoveAdminAddr] = useState<string>('');

  const [saleRequests, setSaleRequests] = useState<SaleRequest[]>([]);
  const [activeEscrows, setActiveEscrows] = useState<EscrowAccount[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const [dynamicSeeds, setDynamicSeeds] = useState<Map<string, number>>(new Map());
  const [vaultAddresses, setVaultAddresses] = useState<{ [seed: string]: string }>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [isLastPage, setIsLastPage] = useState(false);
  const [sellerFilter, setSellerFilter] = useState('');

  // Squads Protocol state
  const [squadsProposals, setSquadsProposals] = useState<SquadsProposal[]>([]);
  const [squadsLoading, setSquadsLoading] = useState(false);
  const [squadsFilter, setSquadsFilter] = useState<string>('pending');
  const [squadsMultisigInfo, setSquadsMultisigInfo] = useState<{
    multisigPda?: string;
    threshold?: number;
    transactionIndex?: number;
    members?: {
      pubkey: string;
      permissions: { initiate: boolean; vote: boolean; execute: boolean };
    }[];
    vaults?: { index: number; pda: string; balance?: number }[];
    squadsUrl?: string;
  } | null>(null);

  // Admin roles from VaultConfig (MongoDB)
  const [authorizedAdmins, setAuthorizedAdmins] = useState<
    {
      walletAddress: string;
      name?: string;
      role: 'super_admin' | 'admin' | 'minter';
    }[]
  >([]);
  const [adminsFetched, setAdminsFetched] = useState(false);
  const [pendingMintRequests, setPendingMintRequests] = useState<number>(0);
  const [pendingDelistRequests, setPendingDelistRequests] = useState<number>(0);
  const [pendingVendorApprovals, setPendingVendorApprovals] = useState<number>(0);
  const [newApplications, setNewApplications] = useState<number>(0);

  const program = useMemo(
    () => (anchorWallet.publicKey ? getProgram(anchorWallet) : null),
    [anchorWallet]
  );

  // Use correct seed 'luxhub-config' to match the Anchor program
  const escrowConfigPda = useMemo(() => {
    return program
      ? PublicKey.findProgramAddressSync([Buffer.from('luxhub-config')], program.programId)[0]
      : null;
  }, [program]);

  // Admin list is now managed off-chain via VaultConfig (MongoDB)
  // No on-chain adminListPda needed

  const addLog = (action: string, tx: string, message: string) => {
    const timestamp = new Date().toLocaleString();
    const newLog: LogEntry = { timestamp, action, tx, message };
    setLogs((prev) => [...prev, newLog]);
  };

  // ------------------------------------------------
  // Rate Limit Handling
  // ------------------------------------------------
  const fetchWithRetry = async (
    fetchFunc: () => Promise<any>,
    retries = 3,
    delayMs = 1000
  ): Promise<any> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fetchFunc();
      } catch (error: any) {
        if (error?.message?.includes('Too many requests') && attempt < retries - 1) {
          await new Promise((res) => setTimeout(res, delayMs * (attempt + 1)));
        } else {
          throw error;
        }
      }
    }
  };

  // ------------------------------------------------
  // Fetch Config (on-chain) and Admins (off-chain via VaultConfig)
  // ------------------------------------------------
  const fetchConfigAndAdmins = async () => {
    if (!program || !escrowConfigPda) return;

    // Fetch on-chain escrow config (new structure: authority, treasury, fee_bps, paused)
    try {
      const configAccount = await fetchWithRetry(() =>
        (program.account as any).escrowConfig.fetch(escrowConfigPda)
      );
      // New config structure
      const authority = configAccount.authority?.toBase58?.() || null;
      const treasury = configAccount.treasury?.toBase58?.() || null;
      const feeBps = configAccount.feeBps ?? configAccount.fee_bps ?? 0;
      const paused = configAccount.paused ?? false;

      if (authority && treasury) {
        setOnChainConfig({
          authority,
          treasury,
          feeBps,
          paused,
        });
        setCurrentEscrowConfig(treasury);
        setLuxhubWallet(treasury);
        setNewPaused(paused);
      } else {
        setCurrentEscrowConfig('Not initialized');
        setOnChainConfig(null);
      }
    } catch (e) {
      console.error('[fetchConfigAndAdmins] Failed to fetch escrow config', e);
      setCurrentEscrowConfig('Error loading config');
      setOnChainConfig(null);
    }

    // Admin list is managed off-chain via VaultConfig API
    // Fetched separately via fetchAuthorizedAdmins()
  };

  // ------------------------------------------------
  // Fetch Active Escrows by Mint
  // ------------------------------------------------
  const fetchActiveEscrowsByMint = async () => {
    try {
      const res = await fetch('/api/nft/activeEscrowsByMint');
      const data = await res.json();
      const escrows = Array.isArray(data) ? data : [];

      const enriched = escrows.map((escrow: any) => ({
        seed: escrow.seed,
        initializer: escrow.seller || escrow.initializer,
        luxhub_wallet: escrow.luxhub_wallet || '',
        mintB: escrow.nftId || escrow.mintB,
        mintA: escrow.mintA,
        file_cid: escrow.file_cid || '',
        initializer_amount: escrow.initializer_amount || '1',
        taker_amount: escrow.taker_amount || escrow.salePrice || '0',
        salePrice: escrow.salePrice || '0',
        name: escrow.name || 'Unknown NFT',
        image: escrow.image || '',
        description: escrow.description || '',
        attributes: escrow.attributes || [],
        vaultATA: '',
        status: escrow.status,
        buyer: escrow.buyer,
        escrowPda: escrow.escrowPda,
        priceUSD: escrow.priceUSD,
      }));

      setActiveEscrows(enriched);
    } catch (err) {
      console.error('[fetchActiveEscrowsByMint] Error:', err);
    }
  };

  // ------------------------------------------------
  // Fetch Sale Requests
  // ------------------------------------------------
  const fetchSaleRequests = async (page = 1, seller = '') => {
    try {
      const res = await fetch(`/api/nft/pendingRequests?page=${page}&seller=${seller}`);
      const data: SaleRequestsResponse = await res.json();

      if (!data || !Array.isArray(data.saleRequests)) {
        console.error('Invalid response format:', data);
        return;
      }

      setSaleRequests(data.saleRequests);
      setCurrentPage(data.page || page);
      setIsLastPage(data.page >= data.totalPages); // 🔍 accurate last page check
    } catch (err) {
      console.error('❌ Error fetching sale requests:', err);
      setSaleRequests([]);
    }
  };

  // ------------------------------------------------
  // Squads Protocol Functions
  // ------------------------------------------------
  const fetchSquadsMultisigInfo = async () => {
    try {
      const res = await fetch('/api/squads/members');
      const data = await res.json();
      if (data.ok) {
        setSquadsMultisigInfo(data);
      }
    } catch (err) {
      console.error('Error fetching Squads multisig info:', err);
    }
  };

  // Fetch authorized admins with roles from VaultConfig
  const fetchAuthorizedAdmins = async () => {
    try {
      const res = await fetch('/api/vault/config');
      const data = await res.json();
      if (data.config?.authorizedAdmins) {
        setAuthorizedAdmins(data.config.authorizedAdmins);
      }
      setAdminsFetched(true);
    } catch (err) {
      console.error('Error fetching authorized admins:', err);
      setAdminsFetched(true); // Mark as fetched even on error
    }
  };

  const fetchPendingCounts = async () => {
    const walletAddr = publicKey?.toBase58();
    if (!walletAddr) return;
    const headers: Record<string, string> = { 'x-wallet-address': walletAddr };

    try {
      const [mintRes, delistRes, vendorRes, interestsRes] = await Promise.all([
        fetch('/api/admin/mint-requests?status=pending&limit=1&offset=0', { headers }),
        fetch('/api/admin/delist-requests?status=pending', { headers }),
        fetch(`/api/vendor/pending?adminWallet=${walletAddr}`, { headers }),
        fetch('/api/admin/interests', { headers }),
      ]);

      if (mintRes.ok) {
        const data = await mintRes.json();
        setPendingMintRequests(data.total || 0);
      }
      if (delistRes.ok) {
        const data = await delistRes.json();
        setPendingDelistRequests(
          data.counts?.pending ?? (Array.isArray(data.requests) ? data.requests.length : 0)
        );
      }
      if (vendorRes.ok) {
        const data = await vendorRes.json();
        setPendingVendorApprovals(Array.isArray(data.vendors) ? data.vendors.length : 0);
      }
      if (interestsRes.ok) {
        const data = await interestsRes.json();
        setNewApplications(data.newCount || 0);
      }
    } catch (err) {
      console.error('[fetchPendingCounts] Error:', err);
    }
  };

  const fetchSquadsProposals = async (statusFilter = 'pending') => {
    setSquadsLoading(true);
    try {
      const res = await fetch(`/api/squads/proposals?status=${statusFilter}&limit=50`);
      const data = await res.json();
      if (data.proposals) {
        setSquadsProposals(data.proposals);
      }
    } catch (err) {
      console.error('Error fetching Squads proposals:', err);
      toast.error('Failed to fetch Squads proposals');
    } finally {
      setSquadsLoading(false);
    }
  };

  const executeSquadsProposal = async (transactionIndex: string) => {
    const confirm = window.confirm(
      `Execute proposal #${transactionIndex}?\n\nThis will execute the approved Squads transaction on-chain.`
    );
    if (!confirm) return;

    setSquadsLoading(true);
    try {
      const res = await fetch('/api/squads/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIndex }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Execution failed');
      }

      toast.success(`✅ Proposal executed! Signature: ${data.signature?.slice(0, 8)}...`);
      addLog('Squads Execute', data.signature || 'N/A', `Executed proposal #${transactionIndex}`);

      // Refresh proposals list
      await fetchSquadsProposals(squadsFilter);
    } catch (err: any) {
      console.error('Error executing Squads proposal:', err);
      toast.error(`❌ Execution failed: ${err.message}`);
    } finally {
      setSquadsLoading(false);
    }
  };

  const syncEscrowState = async (escrowSeed: string, transactionSignature?: string) => {
    setSquadsLoading(true);
    try {
      const res = await fetch('/api/squads/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escrowSeed, transactionSignature }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Sync failed');
      }

      toast.success(`✅ Escrow synced! On-chain completed: ${data.onChainCompleted}`);
      addLog('Squads Sync', 'N/A', `Synced escrow seed ${escrowSeed}`);

      // Refresh escrows and proposals
      await fetchActiveEscrowsByMint();
      await fetchSquadsProposals(squadsFilter);
    } catch (err: any) {
      console.error('Error syncing escrow state:', err);
      toast.error(`❌ Sync failed: ${err.message}`);
    } finally {
      setSquadsLoading(false);
    }
  };

  const refreshProposalStatus = async (transactionIndex: string) => {
    try {
      const res = await fetch(`/api/squads/status?transactionIndex=${transactionIndex}`);
      const data = await res.json();

      if (res.ok) {
        // Update the specific proposal in state
        setSquadsProposals((prev) =>
          prev.map((p) =>
            p.transactionIndex === transactionIndex
              ? {
                  ...p,
                  status: data.status,
                  approvals: data.approvals,
                  rejections: data.rejections,
                }
              : p
          )
        );
        toast.success(`Status: ${data.status} (${data.approvals}/${data.threshold} approvals)`);
      }
    } catch (err) {
      console.error('Error refreshing proposal status:', err);
    }
  };

  const approveSquadsProposal = async (transactionIndex: string) => {
    const confirm = window.confirm(
      `Approve proposal #${transactionIndex}?\n\nThis will add your approval vote.`
    );
    if (!confirm) return;

    setSquadsLoading(true);
    try {
      const res = await fetch('/api/squads/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIndex, action: 'approve' }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Approval failed');
      }

      toast.success(`✅ Approved! (${data.approvals}/${data.threshold})`);
      addLog('Squads Approve', data.signature || 'N/A', `Approved proposal #${transactionIndex}`);

      // Refresh proposals list
      await fetchSquadsProposals(squadsFilter);
    } catch (err: any) {
      console.error('Error approving Squads proposal:', err);
      toast.error(`❌ Approval failed: ${err.message}`);
    } finally {
      setSquadsLoading(false);
    }
  };

  const rejectSquadsProposal = async (transactionIndex: string) => {
    const confirm = window.confirm(
      `Reject proposal #${transactionIndex}?\n\nThis will add your rejection vote.`
    );
    if (!confirm) return;

    setSquadsLoading(true);
    try {
      const res = await fetch('/api/squads/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIndex, action: 'reject' }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Rejection failed');
      }

      toast.success(`✅ Rejected! (${data.rejections} rejections)`);
      addLog('Squads Reject', data.signature || 'N/A', `Rejected proposal #${transactionIndex}`);

      await fetchSquadsProposals(squadsFilter);
    } catch (err: any) {
      console.error('Error rejecting Squads proposal:', err);
      toast.error(`❌ Rejection failed: ${err.message}`);
    } finally {
      setSquadsLoading(false);
    }
  };

  const cancelSquadsProposal = async (transactionIndex: string) => {
    const confirm = window.confirm(
      `Cancel proposal #${transactionIndex}?\n\nThis will permanently cancel the proposal.`
    );
    if (!confirm) return;

    setSquadsLoading(true);
    try {
      const res = await fetch('/api/squads/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIndex }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Cancellation failed');
      }

      toast.success(`✅ Proposal cancelled!`);
      addLog('Squads Cancel', data.signature || 'N/A', `Cancelled proposal #${transactionIndex}`);

      await fetchSquadsProposals(squadsFilter);
    } catch (err: any) {
      console.error('Error cancelling Squads proposal:', err);
      toast.error(`❌ Cancellation failed: ${err.message}`);
    } finally {
      setSquadsLoading(false);
    }
  };

  // ------------------------------------------------
  // Refresh Data Fetch Logic
  // ------------------------------------------------
  const refreshData = async () => {
    setLoading(true);
    await Promise.all([
      fetchConfigAndAdmins(),
      fetchActiveEscrowsByMint(),
      fetchSaleRequests(),
      fetchSquadsProposals(squadsFilter),
      fetchSquadsMultisigInfo(),
      fetchAuthorizedAdmins(),
      fetchPendingCounts(),
    ]);
    setLoading(false);
  };

  // ------------------------------------------------
  // Program Initialization & Data Fetch
  // ------------------------------------------------
  // Fetch authorized admins on mount (early, doesn't depend on program)
  useEffect(() => {
    fetchAuthorizedAdmins();
  }, []);

  // Close nav panel on ESC key
  useEffect(() => {
    if (!navOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [navOpen]);

  useEffect(() => {
    if (program) {
      refreshData();
    }
  }, [program]);

  // Auto-refresh every 30s so admin stays up to date
  useEffect(() => {
    if (!program || !publicKey) return;
    const interval = setInterval(() => {
      // Silent refresh — no loading spinner
      const walletAddr = publicKey!.toBase58();
      Promise.all([
        fetchSaleRequests(),
        fetchPendingCounts(),
        fetchActiveEscrowsByMint(),
        fetch(`/api/notifications/list?wallet=${walletAddr}&limit=10`)
          .then((r) => r.json())
          .then((data) => {
            if (data.notifications) setRecentNotifications(data.notifications);
          })
          .catch(() => {}),
      ]).catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [program, publicKey]);

  // Fetch recent notifications for admin activity feed
  useEffect(() => {
    const walletAddr = publicKey?.toBase58();
    if (!walletAddr) return;
    fetch(`/api/notifications/list?wallet=${walletAddr}&limit=10`)
      .then((r) => r.json())
      .then((data) => {
        if (data.notifications) setRecentNotifications(data.notifications);
      })
      .catch(() => {});
  }, [publicKey]);

  // ------------------------------------------------
  // Admin Check Logic
  // ------------------------------------------------
  useEffect(() => {
    if (!publicKey) {
      setIsAdmin(false);
      return;
    }

    const walletAddress = publicKey.toBase58();

    // Check against authorized admins from VaultConfig (MongoDB)
    if (authorizedAdmins.length > 0) {
      const isUserAdmin = authorizedAdmins.some((admin) => admin.walletAddress === walletAddress);
      setIsAdmin(isUserAdmin);
      return;
    }

    // Fallback: check against super admin env variable
    const superAdminWallets = process.env.NEXT_PUBLIC_SUPER_ADMIN_WALLETS?.split(',') || [];
    if (superAdminWallets.includes(walletAddress)) {
      setIsAdmin(true);
      return;
    }

    // If admins have been fetched but list is empty, user is not an admin
    if (adminsFetched) {
      setIsAdmin(false);
      return;
    }

    // If authorizedAdmins hasn't loaded yet but wallet is connected, wait
  }, [publicKey, authorizedAdmins, adminsFetched]);

  // ------------------------------------------------
  // Initialize Escrow Config Logic
  // ------------------------------------------------
  const initializeEscrowConfig = async () => {
    if (!publicKey || !program || !escrowConfigPda) {
      alert('Wallet not connected or program not ready.');
      return;
    }
    try {
      // Squads multisig PDA (controls the treasury)
      const squadsMultisig = new PublicKey(
        process.env.NEXT_PUBLIC_SQUADS_MSIG || '4mXpAeaRJdRkAAkbDjxPicG2itn7WHQ6wBtS3vFJD9ku'
      );
      // Treasury vault PDA (where 3% fees go)
      const squadsAuthority = new PublicKey(luxhubWallet);

      const tx = await program.methods
        .initializeConfig(squadsMultisig, squadsAuthority)
        .accounts({
          payer: publicKey,
          config: escrowConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setStatus('Escrow config initialized. Tx: ' + tx);
      addLog('Initialize Config', tx, 'Multisig: ' + squadsMultisig.toBase58());
      refreshData();
    } catch (error: any) {
      console.error('[initializeEscrowConfig] error:', error);
      setStatus('Initialization failed: ' + error.message);
      addLog('Initialize Config', 'N/A', 'Error: ' + error.message);
    }
  };

  // ------------------------------------------------
  // Update On-Chain Escrow Config (authority, treasury, fee_bps, paused)
  // All parameters are optional - only update what's provided
  // ------------------------------------------------
  const updateOnChainConfig = async (updates?: {
    newAuthority?: string;
    newTreasury?: string;
    newFeeBps?: number;
    newPaused?: boolean;
  }) => {
    if (!publicKey || !program || !escrowConfigPda) {
      alert('Wallet not connected or program not ready.');
      return;
    }
    try {
      // Build optional params - null means don't change
      const newAuthorityPk = updates?.newAuthority ? new PublicKey(updates.newAuthority) : null;
      const newTreasuryPk = updates?.newTreasury ? new PublicKey(updates.newTreasury) : null;
      const feeBpsUpdate = updates?.newFeeBps !== undefined ? updates.newFeeBps : null;
      const pausedUpdate = updates?.newPaused !== undefined ? updates.newPaused : null;

      const tx = await program.methods
        .updateConfig(newAuthorityPk, newTreasuryPk, feeBpsUpdate, pausedUpdate)
        .accounts({
          admin: publicKey,
          config: escrowConfigPda,
        })
        .rpc();

      const changes = [];
      if (newTreasuryPk) changes.push(`Treasury: ${newTreasuryPk.toBase58().slice(0, 8)}...`);
      if (newAuthorityPk) changes.push(`Authority: ${newAuthorityPk.toBase58().slice(0, 8)}...`);
      if (feeBpsUpdate !== null) changes.push(`Fee: ${feeBpsUpdate / 100}%`);
      if (pausedUpdate !== null) changes.push(`Paused: ${pausedUpdate}`);

      setStatus('On-chain config updated! Tx: ' + tx);
      addLog('Update Config (on-chain)', tx, changes.join(', ') || 'No changes');
      refreshData();
    } catch (error: any) {
      console.error('[updateOnChainConfig] error:', error);
      setStatus('Update failed: ' + error.message);
      addLog('Update Config (on-chain)', 'N/A', 'Error: ' + error.message);
    }
  };

  // ------------------------------------------------
  // Update Escrow Config Logic (off-chain via VaultConfig API)
  // ------------------------------------------------
  const updateEscrowConfig = async () => {
    if (!publicKey) {
      alert('Wallet not connected.');
      return;
    }
    try {
      const res = await fetch('/api/vault/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          treasuryWallet: newLuxhubWallet,
          updatedBy: publicKey.toBase58(),
        }),
      });
      if (!res.ok) throw new Error('Failed to update config');
      setStatus('Treasury wallet updated to: ' + newLuxhubWallet);
      addLog('Update Config', 'off-chain', 'New treasury wallet: ' + newLuxhubWallet);
      refreshData();
    } catch (error: any) {
      console.error('[updateEscrowConfig] error:', error);
      setStatus('Update failed: ' + error.message);
      addLog('Update Config', 'N/A', 'Error: ' + error.message);
    }
  };

  // ------------------------------------------------
  // Add Admin Logic (off-chain via VaultConfig API)
  // ------------------------------------------------
  const addAdmin = async () => {
    if (!publicKey) {
      alert('Wallet not connected.');
      return;
    }
    try {
      const res = await fetch('/api/vault/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: newAdmin,
          role: 'admin',
          addedBy: publicKey.toBase58(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add admin');
      }
      setStatus('Admin added: ' + newAdmin);
      addLog('Add Admin', 'off-chain', 'New admin: ' + newAdmin);
      setNewAdmin('');
      refreshData();
    } catch (error: any) {
      console.error('[addAdmin] error:', error);
      setStatus('Add admin failed: ' + error.message);
      addLog('Add Admin', 'N/A', 'Error: ' + error.message);
    }
  };

  // ------------------------------------------------
  // Remove Admin Logic (off-chain via VaultConfig API)
  // ------------------------------------------------
  const removeAdmin = async () => {
    if (!publicKey) {
      alert('Wallet not connected.');
      return;
    }
    try {
      const res = await fetch('/api/vault/admins', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: removeAdminAddr,
          removedBy: publicKey.toBase58(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove admin');
      }
      setStatus('Admin removed: ' + removeAdminAddr);
      addLog('Remove Admin', 'off-chain', 'Removed admin: ' + removeAdminAddr);
      setRemoveAdminAddr('');
      refreshData();
    } catch (error: any) {
      console.error('[removeAdmin] error:', error);
      setStatus('Remove admin failed: ' + error.message);
      addLog('Remove Admin', 'N/A', 'Error: ' + error.message);
    }
  };

  // ------------------------------------------------
  // Escrow Confirmation
  // ------------------------------------------------
  const confirmDelivery = async (escrow: any) => {
    const priceUSD = escrow.priceUSD || (Number(escrow.salePrice) / 1_000_000);
    const confirm = window.confirm(
      `Approve delivery?\n\nBuyer paid $${priceUSD.toFixed(2)} USDC.\nSeller will receive $${(priceUSD * 0.97).toFixed(2)} USDC.\nLuxHub earns 3% ($${(priceUSD * 0.03).toFixed(2)}).`
    );
    if (!confirm) return;

    if (!publicKey || !program || !currentEscrowConfig) {
      toast.error('Wallet not connected or program not ready.');
      return;
    }

    setLoading(true);
    const connection = new Connection(getClusterConfig().endpoint);

    try {
      // ---------- resolve buyer & escrow pda ----------
      // Use stored escrowPda if available, otherwise derive from seed
      let escrowPda: PublicKey;
      if (escrow.escrowPda) {
        escrowPda = new PublicKey(escrow.escrowPda);
      } else {
        const seedBuffer = new BN(escrow.seed).toArrayLike(Buffer, 'le', 8);
        [escrowPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('state'), seedBuffer],
          program.programId
        );
      }
      const onchainEscrow = await (program.account as any).escrow.fetch(escrowPda);
      const buyerPubkey = onchainEscrow.buyer?.toBase58?.();
      if (!buyerPubkey || buyerPubkey === PublicKey.default.toBase58()) {
        toast.error('Buyer not set. Purchase must occur before delivery.');
        return;
      }

      // ---------- derive all accounts ----------
      const nftMint = new PublicKey(escrow.mintB);

      // IMPORTANT: luxhub must be the **Squads Vault PDA**, not your wallet
      // Dynamic import multisig to reduce initial bundle size (~45KB saved)
      const multisig = await import('@sqds/multisig');
      const msig = new PublicKey(process.env.NEXT_PUBLIC_SQUADS_MSIG!);
      const [vaultPda] = multisig.getVaultPda({ multisigPda: msig, index: 0 });

      const nftVault = await getAssociatedTokenAddress(nftMint, escrowPda, true);
      const wsolVault = await getAssociatedTokenAddress(new PublicKey(FUNDS_MINT), escrowPda, true);

      const sellerNftAta = await getAssociatedTokenAddress(
        nftMint,
        new PublicKey(escrow.initializer)
      );
      const buyerNftAta = await getAssociatedTokenAddress(nftMint, new PublicKey(buyerPubkey));

      const sellerFundsAta = await getAssociatedTokenAddress(
        new PublicKey(FUNDS_MINT),
        new PublicKey(escrow.initializer)
      );
      const luxhubFeeAta = await getAssociatedTokenAddress(
        new PublicKey(FUNDS_MINT),
        new PublicKey(currentEscrowConfig) // your treasury where 5% goes
      );

      // ---------- preflight checks ----------
      const nftVaultInfo = await connection.getAccountInfo(nftVault);
      const wsolVaultInfo = await connection.getAccountInfo(wsolVault);
      if (!nftVaultInfo) {
        toast.error('NFT vault does not exist. Cannot confirm delivery.');
        return;
      }
      if (!wsolVaultInfo) {
        toast.error('wSOL vault does not exist. Cannot confirm delivery.');
        return;
      }
      const nftAmount = await connection.getTokenAccountBalance(nftVault);
      const wsolAmount = await connection.getTokenAccountBalance(wsolVault);
      const nftAvailable = Number(nftAmount.value.amount);
      const wsolAvailable = Number(wsolAmount.value.amount);
      const expectedWsol = Number(escrow.salePrice);
      if (nftAvailable < 1) {
        toast.error('Vault NFT balance is insufficient.');
        return;
      }
      if (wsolAvailable < expectedWsol) {
        toast.error(`Vault wSOL insufficient. Need ${expectedWsol}, found ${wsolAvailable}`);
        return;
      }

      // ---------- build Anchor instruction (NO .rpc()) ----------
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('luxhub-config')],
        program.programId
      );
      const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');
      const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

      const ix = await program.methods
        .confirmDelivery()
        .accounts({
          escrow: escrowPda,
          config: configPda,
          buyerNftAta,
          nftVault,
          wsolVault,
          mintA: new PublicKey(FUNDS_MINT),
          mintB: nftMint,
          sellerFundsAta,
          luxhubFeeAta,
          seller: new PublicKey(escrow.initializer), // seller receives escrow rent
          authority: vaultPda, // Squads vault as authority
          instructionsSysvar: SYSVAR_INSTRUCTIONS,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // ---------- build & sign Squads proposal client-side ----------
      toast.loading('Creating Squads proposal...', { id: 'delivery' });

      const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msig);
      const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1);

      const vaultMessage = new TransactionMessage({
        payerKey: vaultPda,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: [ix],
      });

      // Build: create vault tx + create proposal + auto-approve (1/1 threshold)
      const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
        multisigPda: msig,
        creator: publicKey,
        transactionIndex,
        vaultIndex: 0,
        ephemeralSigners: 0,
        transactionMessage: vaultMessage,
        rentPayer: publicKey,
      });

      const createProposalIx = multisig.instructions.proposalCreate({
        multisigPda: msig,
        creator: publicKey,
        transactionIndex,
        isDraft: false,
        rentPayer: publicKey,
      });

      const approveIx = multisig.instructions.proposalApprove({
        multisigPda: msig,
        member: publicKey,
        transactionIndex,
      });

      // Send all 3 instructions in one transaction signed by Phantom
      const { Transaction: LegacyTransaction } = await import('@solana/web3.js');
      const proposalTx = new LegacyTransaction();
      proposalTx.add(createVaultTxIx, createProposalIx, approveIx);
      const { blockhash } = await connection.getLatestBlockhash();
      proposalTx.recentBlockhash = blockhash;
      proposalTx.feePayer = publicKey;

      const signedTx = await anchorWallet.signTransaction!(proposalTx);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(sig, 'confirmed');

      toast.success('Proposal created & approved! Now executing...', { id: 'delivery' });

      // Auto-execute since threshold is met (1/1)
      const executeIx = await multisig.instructions.vaultTransactionExecute({
        multisigPda: msig,
        member: publicKey,
        transactionIndex,
        connection,
      });

      const executeTx = new LegacyTransaction();
      executeTx.add(...(Array.isArray(executeIx) ? executeIx : [executeIx]));
      const { blockhash: execBlockhash } = await connection.getLatestBlockhash();
      executeTx.recentBlockhash = execBlockhash;
      executeTx.feePayer = publicKey;

      const signedExecTx = await anchorWallet.signTransaction!(executeTx);
      const execSig = await connection.sendRawTransaction(signedExecTx.serialize());
      await connection.confirmTransaction(execSig, 'confirmed');

      toast.success('Delivery confirmed! Funds released on-chain.', { id: 'delivery', duration: 5000 });
      setStatus(`Confirm delivery executed. TX: ${execSig}`);
      addLog('Confirm Delivery (executed)', execSig, `Escrow ${escrow.escrowPda}`);

      // Update MongoDB
      await fetch('/api/escrow/confirm-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowPda: escrow.escrowPda,
          wallet: publicKey.toBase58(),
          confirmationType: 'admin',
          txSignature: execSig,
        }),
      });

      await fetchActiveEscrowsByMint();
    } catch (err: any) {
      console.error('[confirmDelivery] error:', err);
      setStatus('Confirm delivery (proposal) failed: ' + err.message);
      toast.error('❌ Proposal failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------
  // Escrow Cancellation (via Squads Multisig)
  // ------------------------------------------------
  const cancelEscrow = async (escrow: EscrowAccount) => {
    const confirm = window.confirm(
      `Cancel escrow for seed ${escrow.seed}?\n\nThis will create a Squads proposal to return funds to the seller.`
    );
    if (!confirm) return;

    if (!publicKey || !program) {
      toast.error('Wallet not connected or program not ready.');
      return;
    }

    try {
      setLoading(true);
      setStatus('Creating cancellation proposal via Squads...');
      const seedBuffer = new BN(escrow.seed).toArrayLike(Buffer, 'le', 8);
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('state'), seedBuffer],
        program.programId
      );

      const vault = await getAssociatedTokenAddress(new PublicKey(FUNDS_MINT), escrowPda, true);

      // Dynamic import multisig to reduce initial bundle size
      const multisig = await import('@sqds/multisig');
      const msig = new PublicKey(process.env.NEXT_PUBLIC_SQUADS_MSIG!);
      const [vaultPda] = multisig.getVaultPda({ multisigPda: msig, index: 0 });

      // Build Anchor instruction (NO .rpc() - goes through Squads)
      const ix = await program.methods
        .cancel()
        .accounts({
          initializer: vaultPda, // Squads vault as signer for admin operation
          mintA: new PublicKey(escrow.mintA),
          initializerAta: await getAssociatedTokenAddress(
            new PublicKey(FUNDS_MINT),
            new PublicKey(escrow.initializer)
          ),
          escrow: escrowPda,
          vault: vault,
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        })
        .instruction();

      // Shape for API
      const keys = ix.keys.map((k) => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      }));
      const dataBase64 = Buffer.from(ix.data).toString('base64');

      // Create Squads proposal
      const result = await proposeToSquads({
        programId: ix.programId.toBase58(),
        keys,
        dataBase64,
        vaultIndex: 0,
      });

      toast.success(
        `✅ Cancellation proposal created in Squads (index ${result.transactionIndex}). Approve & Execute in Squads.`
      );
      setStatus(`Squads cancel proposal created. Index: ${result.transactionIndex}`);
      addLog('Cancel Escrow (proposed)', 'N/A', `Escrow seed: ${escrow.seed}`);

      await refreshData();
    } catch (error: any) {
      console.error('[cancelEscrow] error:', error);
      setStatus('Cancel escrow (proposal) failed: ' + error.message);
      addLog('Cancel Escrow', 'N/A', 'Error: ' + error.message);
      toast.error(`❌ Cancel proposal failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------
  // Refund Buyer (via API → Squads Multisig)
  // ------------------------------------------------
  const refundBuyer = async (escrow: EscrowAccount) => {
    const reason = window.prompt(
      `Refund buyer for escrow seed ${escrow.seed}?\n\nThis returns funds to the buyer and NFT to the seller.\n\nEnter reason (optional):`
    );
    if (reason === null) return; // user cancelled prompt

    if (!publicKey || !program) {
      toast.error('Wallet not connected or program not ready.');
      return;
    }

    setLoading(true);
    setStatus('Creating refund proposal...');

    try {
      const seedBuffer = new BN(escrow.seed).toArrayLike(Buffer, 'le', 8);
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('state'), seedBuffer],
        program.programId
      );

      const res = await fetch('/api/escrow/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowPda: escrowPda.toBase58(),
          wallet: publicKey.toBase58(),
          reason: reason || 'Admin-initiated refund',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Refund request failed');
      }

      if (data.squadsProposal?.success) {
        toast.success(
          `Refund proposal created in Squads (index ${data.squadsProposal.transactionIndex}). Approve & Execute in Squads.`
        );
      } else {
        toast.success('Refund initiated in DB. Manual Squads proposal may be needed.');
      }

      setStatus(`Refund initiated for escrow ${escrow.seed}`);
      addLog('Refund Buyer (proposed)', 'N/A', `Escrow ${escrow.seed}`);
      await fetchActiveEscrowsByMint();
    } catch (err: any) {
      console.error('[refundBuyer] error:', err);
      setStatus('Refund failed: ' + err.message);
      toast.error('Refund failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------
  // Approve Sale -> Escrow creation
  // Admin-owned NFTs: sign directly
  // Vendor-owned NFTs: need vendor signature (different flow)
  // ------------------------------------------------
  const handleApproveSale = async (req: SaleRequest) => {
    if (!req.seller) {
      console.error('[handleApproveSale] Missing seller:', req);
      setStatus('Error: Missing seller field');
      return;
    }

    if (!publicKey || !program || !escrowConfigPda) {
      alert('Wallet not connected or program not ready.');
      return;
    }

    try {
      setLoading(true);
      const connection = new Connection(getClusterConfig().endpoint);

      const sellerPk = new PublicKey(req.seller);
      const nftMint = new PublicKey(req.nftId);

      if (
        req.seed === undefined ||
        req.initializerAmount === undefined ||
        req.takerAmount === undefined ||
        req.salePrice === undefined
      ) {
        console.error('[handleApproveSale] Invalid numeric input:', req);
        setStatus('Error: Missing required numeric fields');
        return;
      }

      // ---------- derive escrow PDA & check if already exists ----------
      const seed = Number(req.seed);
      const seedBuffer = new BN(seed).toArrayLike(Buffer, 'le', 8);
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('state'), seedBuffer],
        program.programId
      );
      const escrowInfo = await connection.getAccountInfo(escrowPda);
      if (escrowInfo !== null) {
        // Already initialized
        setStatus('Escrow already initialized — updating metadata and cleaning up.');
        await updateNFTMarketStatus(req.nftId, 'active', anchorWallet);
        await fetch('/api/nft/updateStatus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mintAddress: req.nftId, marketStatus: 'active' }),
        });
        setSaleRequests((prev) => prev.filter((r) => r.nftId !== req.nftId));
        await refreshData();
        return;
      }

      // ---------- Check NFT ownership - seller must own the NFT ----------
      const sellerNftAta = await getAssociatedTokenAddress(nftMint, sellerPk);
      let sellerOwnsNft = false;
      try {
        const sellerAtaInfo = await connection.getTokenAccountBalance(sellerNftAta);
        sellerOwnsNft = Number(sellerAtaInfo.value.uiAmount || 0) >= 1;
      } catch {
        sellerOwnsNft = false;
      }

      if (!sellerOwnsNft) {
        alert(
          `Seller (${req.seller.slice(0, 8)}...) does not own the NFT.\n\n` +
            `Please ensure the NFT is in the seller's wallet before approving.`
        );
        setLoading(false);
        return;
      }

      // ---------- Check if admin is the seller (can sign directly) ----------
      const adminIsSeller = publicKey.toBase58() === req.seller;

      if (adminIsSeller) {
        // ============ ADMIN OWNS THE NFT - SIGN DIRECTLY ============
        setStatus('Creating escrow (signing directly as NFT owner)...');
        addLog('Approve Sale', 'N/A', `Admin-owned NFT. Seed: ${seed}`);

        // Generate vault keypairs for nft_vault and wsol_vault
        const nftVaultKeypair = Keypair.generate();
        const wsolVaultKeypair = Keypair.generate();

        // Call initialize directly (admin is both admin and seller)
        const tx = await program.methods
          .initialize(
            new BN(seed),
            new BN(req.initializerAmount),
            new BN(req.takerAmount),
            req.fileCid || '',
            new BN(req.salePrice)
          )
          .accounts({
            admin: publicKey,
            seller: publicKey,
            config: escrowConfigPda!,
            mintA: new PublicKey(FUNDS_MINT),
            mintB: nftMint,
            sellerAtaA: await getAssociatedTokenAddress(new PublicKey(FUNDS_MINT), publicKey),
            sellerAtaB: sellerNftAta,
            escrow: escrowPda,
            nftVault: nftVaultKeypair.publicKey,
            wsolVault: wsolVaultKeypair.publicKey,
            tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
            systemProgram: SystemProgram.programId,
          })
          .signers([nftVaultKeypair, wsolVaultKeypair])
          .rpc();

        toast.success(`✅ Escrow created! Tx: ${tx.slice(0, 8)}...`);
        setStatus(`Escrow created. Tx: ${tx}`);
        addLog('Approve Sale', tx, `Escrow created for seed ${seed}`);

        // Update NFT status
        await updateNFTMarketStatus(req.nftId, 'active', anchorWallet);
        await fetch('/api/nft/updateStatus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mintAddress: req.nftId,
            marketStatus: 'active',
            escrowPda: escrowPda.toBase58(),
          }),
        });

        setSaleRequests((prev) => prev.filter((r) => r.nftId !== req.nftId));
        await refreshData();
      } else {
        // ============ VENDOR OWNS THE NFT - CANNOT SIGN FOR THEM ============
        // The vendor must initiate the escrow creation from their dashboard
        alert(
          `This NFT is owned by a vendor (${req.seller.slice(0, 8)}...).\n\n` +
            `The vendor must initiate the escrow listing from their Seller Dashboard.\n\n` +
            `You can approve the sale request status, but the on-chain escrow requires the vendor's signature.`
        );

        // Just update the status in database to "approved"
        const confirm = window.confirm('Update sale request status to "approved" in the database?');
        if (confirm) {
          await fetch('/api/nft/approveSale', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nftId: req.nftId, status: 'approved' }),
          });
          toast.success('Sale request approved. Vendor can now create the escrow.');
          addLog(
            'Approve Sale (off-chain)',
            'N/A',
            `Approved for vendor: ${req.seller.slice(0, 8)}...`
          );
          await refreshData();
        }
      }
    } catch (error: any) {
      console.error('[handleApproveSale] error:', error);
      setStatus('Approve sale failed: ' + error.message);
      addLog('Approve Sale', 'N/A', 'Error: ' + error.message);
      toast.error(`❌ Failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------
  // Reject Sale Request
  // ------------------------------------------------
  const handleRejectSale = async (req: SaleRequest) => {
    const confirm = window.confirm(
      `Reject sale request for NFT ${req.nftId.slice(0, 8)}...?\n\nThis will mark the request as rejected and the seller can relist.`
    );
    if (!confirm) return;

    try {
      setLoading(true);
      setStatus('Rejecting sale request...');

      const token = localStorage.getItem('luxhub_token');
      const res = await fetch('/api/nft/rejectSale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ nftId: req.nftId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reject sale');
      }

      // Optionally update NFT metadata to mark as available
      await updateNFTMarketStatus(req.nftId, 'listed', anchorWallet);

      toast.success('Sale request rejected');
      setStatus('Sale request rejected successfully');
      addLog('Reject Sale', 'N/A', `NFT: ${req.nftId.slice(0, 8)}...`);

      // Remove from UI
      setSaleRequests((prev) => prev.filter((r) => r.nftId !== req.nftId));
      await refreshData();
    } catch (error: any) {
      console.error('[handleRejectSale] error:', error);
      setStatus('Reject sale failed: ' + error.message);
      toast.error(`❌ Rejection failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------
  // Vault Address Fetching
  // ------------------------------------------------
  useEffect(() => {
    const fetchVaults = async () => {
      if (!program) return;
      const result: { [seed: string]: string } = {};

      for (const escrow of activeEscrows) {
        try {
          const seedBuffer = new BN(escrow.seed).toArrayLike(Buffer, 'le', 8);
          const [escrowPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('state'), seedBuffer],
            program.programId
          );
          const vault = await getAssociatedTokenAddress(
            new PublicKey(escrow.mintB),
            escrowPda,
            true
          );
          result[escrow.seed.toString()] = vault.toBase58();
        } catch (e) {
          console.error('Vault fetch failed for seed', escrow.seed, e);
        }
      }

      setVaultAddresses(result);
    };

    fetchVaults();
  }, [activeEscrows, program]);

  // ------------------------------------------------
  // Render Admin Tabs
  // ------------------------------------------------
  const renderTabContent = () => {
    switch (tabIndex) {
      case 1: {
        // Dashboard Overview — Stripe-inspired dense layout
        const attentionItems = [
          newApplications > 0 && {
            label: 'New Applications',
            count: newApplications,
            tab: 8,
            icon: <HiOutlineUserGroup />,
          },
          pendingMintRequests > 0 && {
            label: 'Mint Requests',
            count: pendingMintRequests,
            tab: 16,
            icon: <HiOutlineCube />,
          },
          saleRequests.length > 0 && {
            label: 'Sale Requests',
            count: saleRequests.length,
            tab: 5,
            icon: <HiOutlineClipboardList />,
          },
          pendingVendorApprovals > 0 && {
            label: 'Vendor Approvals',
            count: pendingVendorApprovals,
            tab: 8,
            icon: <HiOutlineUserGroup />,
          },
          pendingDelistRequests > 0 && {
            label: 'Delist Requests',
            count: pendingDelistRequests,
            tab: 15,
            icon: <HiOutlineExclamation />,
          },
          squadsProposals.filter((p) => p.status === 'active').length > 0 && {
            label: 'Squads Proposals',
            count: squadsProposals.filter((p) => p.status === 'active').length,
            tab: 9,
            icon: <HiOutlineShieldCheck />,
          },
          activeEscrows.length > 0 && {
            label: 'Active Escrows',
            count: activeEscrows.length,
            tab: 2,
            icon: <HiOutlineLockClosed />,
          },
        ].filter(Boolean) as { label: string; count: number; tab: number; icon: React.ReactNode }[];

        return (
          <>
            {/* Stats Row — full width above grid */}
            <div className={styles.statsRow}>
              <button className={styles.statPill} onClick={() => setTabIndex(5)}>
                <span className={styles.statPillValue}>{saleRequests.length}</span>
                <span className={styles.statPillLabel}>Requests</span>
              </button>
              <button className={styles.statPill} onClick={() => setTabIndex(2)}>
                <span className={styles.statPillValue}>{activeEscrows.length}</span>
                <span className={styles.statPillLabel}>Escrows</span>
              </button>
              <button className={styles.statPill} onClick={() => setTabIndex(9)}>
                <span className={styles.statPillValue}>{squadsProposals.length}</span>
                <span className={styles.statPillLabel}>Proposals</span>
              </button>
              <button className={styles.statPill} onClick={() => setTabIndex(8)}>
                <span className={styles.statPillValue}>{adminList.length}</span>
                <span className={styles.statPillLabel}>Admins</span>
              </button>
            </div>

            <div className={styles.overviewGrid}>
              {/* LEFT COLUMN — Recent Activity (compact) */}
              <div className={styles.overviewLeft}>
                <div className={styles.attentionSection}>
                  <div className={styles.attentionHeader}>
                    <span className={styles.attentionTitle}>Recent Activity</span>
                    <span className={styles.attentionBadge} style={{ background: 'var(--accent)' }}>
                      {recentNotifications.length + logs.length}
                    </span>
                  </div>
                  {recentNotifications.length === 0 && logs.length === 0 ? (
                    <p className={styles.attentionEmpty}>
                      <HiOutlineClock style={{ color: 'var(--text-muted)' }} /> No recent activity
                    </p>
                  ) : (
                    <div className={styles.activityFeed}>
                      {recentNotifications.slice(0, 6).map((notif: any) => (
                        <div
                          key={notif._id}
                          className={`${styles.activityItem} ${!notif.read ? styles.activityUnread : ''}`}
                        >
                          <div className={styles.activityIcon}>
                            {notif.type?.includes('vendor') ? (
                              <HiOutlineUserGroup />
                            ) : notif.type?.includes('escrow') ? (
                              <HiOutlineLockClosed />
                            ) : notif.type?.includes('purchase') ? (
                              <HiOutlineCash />
                            ) : notif.type?.includes('dispute') ? (
                              <HiOutlineExclamation />
                            ) : notif.type?.includes('shipment') ? (
                              <HiOutlineTruck />
                            ) : (
                              <HiOutlineLightningBolt />
                            )}
                          </div>
                          <div className={styles.activityContent}>
                            <div className={styles.activityTitle}>
                              {notif.title || notif.type?.replace(/_/g, ' ')}
                            </div>
                            <div className={styles.activityMessage}>{notif.message}</div>
                          </div>
                        </div>
                      ))}
                      {logs
                        .slice(-3)
                        .reverse()
                        .map((log, idx) => (
                          <div key={`log-${idx}`} className={styles.activityItem}>
                            <div className={styles.activityIcon}>
                              {log.action.toLowerCase().includes('approve') ? (
                                <HiOutlineCheckCircle />
                              ) : log.action.toLowerCase().includes('reject') ? (
                                <HiOutlineXCircle />
                              ) : (
                                <HiOutlineLightningBolt />
                              )}
                            </div>
                            <div className={styles.activityContent}>
                              <div className={styles.activityTitle}>{log.action}</div>
                              <div className={styles.activityMessage}>{log.message}</div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Quick Navigate */}
                <div className={styles.attentionSection}>
                  <div className={styles.attentionHeader}>
                    <span className={styles.attentionTitle}>Navigate</span>
                  </div>
                  <div className={styles.navigateGrid}>
                    {[
                      { label: 'Mint', icon: <HiOutlineCube />, tab: 16 },
                      { label: 'Sales', icon: <HiOutlineClipboardList />, tab: 5 },
                      { label: 'Escrows', icon: <HiOutlineLockClosed />, tab: 2 },
                      { label: 'Vendors', icon: <HiOutlineUserGroup />, tab: 8 },
                      { label: 'Shipping', icon: <HiOutlineTruck />, tab: 10 },
                      { label: 'Multisig', icon: <HiOutlineShieldCheck />, tab: 9 },
                    ].map((item) => (
                      <button
                        key={item.tab}
                        className={styles.navigateBtn}
                        onClick={() => setTabIndex(item.tab)}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN — Needs Attention (detailed) */}
              <div className={styles.overviewRight}>
                <div className={styles.attentionSection}>
                  <div className={styles.attentionHeader}>
                    <span className={styles.attentionTitle}>
                      {attentionItems.length > 0 ? 'Needs Attention' : 'All Clear'}
                    </span>
                    <span
                      className={styles.attentionBadge}
                      style={{ background: attentionItems.length > 0 ? '#fbbf24' : '#22c55e' }}
                    >
                      {attentionItems.length}
                    </span>
                  </div>
                  {attentionItems.length === 0 ? (
                    <p className={styles.attentionEmpty}>
                      <HiOutlineCheckCircle style={{ color: '#22c55e' }} /> No pending items
                    </p>
                  ) : (
                    <div className={styles.attentionList}>
                      {attentionItems.map((item) => (
                        <button
                          key={item.tab}
                          className={styles.attentionRow}
                          onClick={() => setTabIndex(item.tab)}
                        >
                          <span className={styles.attentionIcon}>{item.icon}</span>
                          <span className={styles.attentionLabel}>{item.label}</span>
                          <span className={styles.attentionCount}>{item.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      }
      case 3: // Transaction History
        return (
          <Suspense fallback={<TabLoader />}>
            <TransactionHistoryTab />
          </Suspense>
        );
      case 2:
        return (
          <div className={styles.section}>
            {activeEscrows.length === 0 ? (
              <div className={styles.emptyState}>
                <HiOutlineLockClosed className={styles.emptyIcon} />
                <h3 className={styles.emptyTitle}>No Active Escrows</h3>
                <p className={styles.emptyDescription}>
                  There are no active escrow accounts at the moment.
                </p>
              </div>
            ) : (
              <div className={styles.cardsGrid}>
                {activeEscrows.map((escrow: any, idx) => {
                  // Use escrowPda from API if available, otherwise derive from seed
                  let escrowPdaStr = escrow.escrowPda || '';
                  if (!escrowPdaStr && escrow.seed && program) {
                    const seedBuffer = new BN(escrow.seed).toArrayLike(Buffer, 'le', 8);
                    const [derived] = PublicKey.findProgramAddressSync(
                      [Buffer.from('state'), seedBuffer],
                      program.programId
                    );
                    escrowPdaStr = derived.toBase58();
                  }
                  if (!escrowPdaStr) return null;

                  const escrowPda = new PublicKey(escrowPdaStr);
                  const priceUSD = escrow.priceUSD || 0;
                  const salePriceUsdc = Number(escrow.salePrice) / 1_000_000; // USDC atomic → USD

                  return (
                    <div
                      key={idx}
                      className={`${styles.dataCard} ${escrow.image ? styles.cardWithImage : ''}`}
                    >
                      {escrow.image && (
                        <div className={styles.cardImageArea}>
                          <img src={escrow.image} alt={escrow.name} className={styles.cardImage} />
                          <div className={styles.cardImageOverlay} />
                        </div>
                      )}

                      <div className={styles.cardContentArea}>
                        <div className={styles.cardHeader}>
                          <div className={styles.cardTitleArea}>
                            <h3 className={styles.cardTitle}>{escrow.name || 'Unnamed NFT'}</h3>
                            <span className={styles.cardSubtitle}>
                              Seed: {escrow.seed.toString()}
                            </span>
                          </div>
                          <span className={`${styles.cardStatus} ${styles.active}`}>Active</span>
                        </div>

                        <div className={styles.cardBody}>
                          <div className={styles.cardRow}>
                            <span className={styles.cardLabel}>Sale Price</span>
                            <span className={`${styles.cardValue} ${styles.cardHighlight}`}>
                              ${priceUSD || salePriceUsdc.toFixed(2)} USD
                            </span>
                          </div>
                          {escrow.status && (
                            <div className={styles.cardRow}>
                              <span className={styles.cardLabel}>Status</span>
                              <span className={styles.cardValue} style={{ textTransform: 'capitalize' }}>
                                {escrow.status}
                              </span>
                            </div>
                          )}
                          <div className={styles.cardRow}>
                            <span className={styles.cardLabel}>Escrow PDA</span>
                            <span className={styles.cardValue}>
                              <a
                                href={getClusterConfig().explorerUrl(escrowPda.toBase58())}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {escrowPda.toBase58().slice(0, 6)}...
                                {escrowPda.toBase58().slice(-4)}
                                <HiOutlineExternalLink
                                  style={{ marginLeft: 4, verticalAlign: 'middle' }}
                                />
                              </a>
                            </span>
                          </div>
                          <div className={styles.cardRow}>
                            <span className={styles.cardLabel}>Seller</span>
                            <span className={styles.cardValue}>
                              {escrow.initializer.slice(0, 6)}...{escrow.initializer.slice(-4)}
                            </span>
                          </div>
                          <div className={styles.cardRow}>
                            <span className={styles.cardLabel}>Mint</span>
                            <span className={styles.cardValue}>
                              {escrow.mintB.slice(0, 6)}...{escrow.mintB.slice(-4)}
                            </span>
                          </div>
                          <div className={styles.cardRow}>
                            <span className={styles.cardLabel}>Treasury Fee (3%)</span>
                            <span className={styles.cardValue}>
                              ${((priceUSD || salePriceUsdc) * 0.03).toFixed(2)} USD
                            </span>
                          </div>
                        </div>

                        <div className={styles.cardFooter}>
                          <button
                            className={`${styles.cardBtn} ${styles.success}`}
                            onClick={() => confirmDelivery(escrow)}
                          >
                            Confirm Delivery
                          </button>
                          <button
                            className={`${styles.cardBtn} ${styles.warning}`}
                            onClick={() => refundBuyer(escrow)}
                          >
                            Refund Buyer
                          </button>
                          <button
                            className={`${styles.cardBtn} ${styles.danger}`}
                            onClick={() => cancelEscrow(escrow)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 5:
        return (
          <div className={styles.section}>
            {/* Filter Bar */}
            <div className={styles.filterBar}>
              <div className={styles.searchInput}>
                <HiOutlineSearch className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search by seller wallet address..."
                  value={sellerFilter}
                  onChange={(e) => setSellerFilter(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchSaleRequests(1, sellerFilter)}
                />
              </div>
              <button
                className={styles.refreshBtn}
                onClick={() => fetchSaleRequests(1, sellerFilter)}
              >
                Search
              </button>
            </div>

            {/* Cards Grid */}
            {saleRequests.length === 0 ? (
              <div className={styles.emptyState}>
                <HiOutlineClipboardList className={styles.emptyIcon} />
                <h3 className={styles.emptyTitle}>No Pending Requests</h3>
                <p className={styles.emptyDescription}>
                  There are no sale requests waiting for approval.
                </p>
              </div>
            ) : (
              <div className={styles.cardsGrid}>
                {saleRequests.map((req, idx) => {
                  const currentSeed = req.seed ?? dynamicSeeds.get(req.nftId) ?? Date.now();

                  const updateSeed = () => {
                    const newSeed = Date.now();
                    setDynamicSeeds((prev) => {
                      const updated = new Map(prev);
                      updated.set(req.nftId, newSeed);
                      return updated;
                    });
                  };

                  return (
                    <div key={idx} className={styles.dataCard}>
                      <div className={styles.cardHeader}>
                        <div className={styles.cardTitleArea}>
                          <h3 className={styles.cardTitle}>Sale Request #{idx + 1}</h3>
                          <span className={styles.cardSubtitle}>
                            {req.nftId.slice(0, 6)}...{req.nftId.slice(-6)}
                          </span>
                        </div>
                        <span className={`${styles.cardStatus} ${styles.pending}`}>Pending</span>
                      </div>

                      <div className={styles.cardBody}>
                        <div className={styles.cardRow}>
                          <span className={styles.cardLabel}>Seller</span>
                          <span className={styles.cardValue}>
                            {req.seller.slice(0, 6)}...{req.seller.slice(-6)}
                          </span>
                        </div>
                        <div className={styles.cardRow}>
                          <span className={styles.cardLabel}>Sale Price</span>
                          <span className={`${styles.cardValue} ${styles.cardHighlight}`}>
                            {req.salePrice} SOL
                          </span>
                        </div>
                        <div className={styles.cardRow}>
                          <span className={styles.cardLabel}>Initializer Amount</span>
                          <span className={styles.cardValue}>{req.initializerAmount} SOL</span>
                        </div>
                        <div className={styles.cardRow}>
                          <span className={styles.cardLabel}>Taker Amount</span>
                          <span className={styles.cardValue}>{req.takerAmount} SOL</span>
                        </div>
                        <div className={styles.cardRow}>
                          <span className={styles.cardLabel}>Seed</span>
                          <span className={styles.cardValue}>{currentSeed}</span>
                        </div>
                        <div className={styles.cardRow}>
                          <span className={styles.cardLabel}>Requested</span>
                          <span className={styles.cardValue}>
                            {new Date(req.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className={styles.cardFooter}>
                        <button
                          className={`${styles.cardBtn} ${styles.primary}`}
                          disabled={!req.seller}
                          onClick={() => handleApproveSale({ ...req, seed: currentSeed })}
                        >
                          Approve
                        </button>
                        <button className={styles.cardBtn} onClick={updateSeed}>
                          New Seed
                        </button>
                        <button
                          className={`${styles.cardBtn} ${styles.danger}`}
                          onClick={() => handleRejectSale(req)}
                          disabled={loading}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            <div className={styles.pagination}>
              <button
                className={styles.paginationBtn}
                disabled={currentPage === 1}
                onClick={() => fetchSaleRequests(currentPage - 1, sellerFilter)}
              >
                <HiOutlineChevronLeft /> Previous
              </button>
              <span className={styles.paginationInfo}>Page {currentPage}</span>
              <button
                className={styles.paginationBtn}
                disabled={isLastPage}
                onClick={() => fetchSaleRequests(currentPage + 1, sellerFilter)}
              >
                Next <HiOutlineChevronRight />
              </button>
            </div>
          </div>
        );
      case 6:
        return (
          <Suspense fallback={<TabLoader />}>
            <MetadataEditorTab />
          </Suspense>
        );
      case 7:
        return (
          <Suspense fallback={<TabLoader />}>
            <MetadataChangeRequestsTab wallet={anchorWallet} />
          </Suspense>
        );
      case 0:
        return (
          <div className={styles.section}>
            <div className={styles.configPanel}>
              {/* On-Chain Protocol Configuration */}
              <div className={styles.configSection}>
                <h3 className={styles.configTitle}>
                  <HiOutlineDatabase /> On-Chain Protocol Config
                </h3>

                {/* Display current on-chain config */}
                {onChainConfig ? (
                  <div
                    style={{
                      marginBottom: '1rem',
                      padding: '0.75rem',
                      background: 'rgba(200,161,255,0.05)',
                      borderRadius: '8px',
                      border: '1px solid rgba(200,161,255,0.2)',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '0.5rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>Authority (Multisig):</span>
                      <span style={{ color: '#c8a1ff', fontFamily: 'monospace' }}>
                        {onChainConfig.authority.slice(0, 8)}...{onChainConfig.authority.slice(-4)}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>Treasury:</span>
                      <span style={{ color: '#c8a1ff', fontFamily: 'monospace' }}>
                        {onChainConfig.treasury.slice(0, 8)}...{onChainConfig.treasury.slice(-4)}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>Fee:</span>
                      <span style={{ color: '#fff' }}>
                        {onChainConfig.feeBps / 100}% ({onChainConfig.feeBps} bps)
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>Protocol Status:</span>
                      <span style={{ color: onChainConfig.paused ? '#ff6b6b' : '#4ade80' }}>
                        {onChainConfig.paused ? 'PAUSED' : 'Active'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                    Config not initialized or loading...
                  </p>
                )}

                {/* Update Treasury */}
                <div className={styles.configRow}>
                  <span className={styles.configLabel}>Update Treasury</span>
                  <input
                    type="text"
                    className={styles.configInput}
                    placeholder="New treasury address..."
                    value={luxhubWallet}
                    onChange={(e) => setLuxhubWallet(e.target.value)}
                  />
                  <button
                    className={styles.configBtn}
                    onClick={() => updateOnChainConfig({ newTreasury: luxhubWallet })}
                    title="Update treasury address on-chain"
                  >
                    Update
                  </button>
                </div>

                {/* Update Fee BPS */}
                <div className={styles.configRow}>
                  <span className={styles.configLabel}>Update Fee %</span>
                  <input
                    type="number"
                    className={styles.configInput}
                    placeholder="Fee in basis points (300 = 3%)"
                    value={newFeeBps}
                    onChange={(e) => setNewFeeBps(e.target.value)}
                    min="0"
                    max="1000"
                  />
                  <button
                    className={styles.configBtn}
                    onClick={() => updateOnChainConfig({ newFeeBps: parseInt(newFeeBps) || 0 })}
                    title="Update fee percentage (max 10%)"
                  >
                    Update
                  </button>
                </div>

                {/* Toggle Protocol Pause */}
                <div className={styles.configRow}>
                  <span className={styles.configLabel}>Emergency Pause</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={newPaused}
                        onChange={(e) => setNewPaused(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#c8a1ff' }}
                      />
                      <span style={{ color: newPaused ? '#ff6b6b' : '#4ade80' }}>
                        {newPaused ? 'Pause Protocol' : 'Protocol Active'}
                      </span>
                    </label>
                  </div>
                  <button
                    className={styles.configBtn}
                    onClick={() => updateOnChainConfig({ newPaused })}
                    title={
                      newPaused
                        ? 'Pause all marketplace operations'
                        : 'Resume marketplace operations'
                    }
                    style={{ background: newPaused ? 'rgba(255,107,107,0.2)' : undefined }}
                  >
                    {newPaused ? 'Pause' : 'Resume'}
                  </button>
                </div>
              </div>

              {/* Off-Chain Treasury (MongoDB) */}
              <div className={styles.configSection}>
                <h3 className={styles.configTitle}>
                  <HiOutlineDatabase /> Off-Chain Config (Database)
                </h3>
                <div className={styles.configRow}>
                  <span className={styles.configLabel}>Treasury Wallet</span>
                  <input
                    type="text"
                    className={styles.configInput}
                    placeholder="Enter new wallet address..."
                    value={newLuxhubWallet}
                    onChange={(e) => setNewLuxhubWallet(e.target.value)}
                  />
                  <button className={styles.configBtn} onClick={updateEscrowConfig}>
                    Update DB
                  </button>
                </div>
              </div>

              {/* Admin Management */}
              <div className={styles.configSection}>
                <h3 className={styles.configTitle}>
                  <HiOutlineUserGroup /> Escrow Admin Management
                </h3>
                <div className={styles.configRow}>
                  <span className={styles.configLabel}>
                    Current Admins (On-Chain + Vault Roles)
                  </span>
                </div>
                {adminList.length === 0 && authorizedAdmins.length === 0 ? (
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                    No admins found.
                  </p>
                ) : (
                  <div className={styles.adminList}>
                    {/* Show all unique admins from both on-chain and vault config */}
                    {(() => {
                      const allAdmins = new Map<
                        string,
                        { onChain: boolean; vaultRole?: string; name?: string }
                      >();

                      // Add on-chain admins
                      adminList.forEach((addr) => {
                        allAdmins.set(addr, { onChain: true });
                      });

                      // Merge vault config admins with roles
                      authorizedAdmins.forEach((admin) => {
                        const existing = allAdmins.get(admin.walletAddress);
                        allAdmins.set(admin.walletAddress, {
                          onChain: existing?.onChain || false,
                          vaultRole: admin.role,
                          name: admin.name,
                        });
                      });

                      return Array.from(allAdmins.entries()).map(([addr, info], idx) => (
                        <div key={idx} className={styles.adminTagEnhanced}>
                          <div className={styles.adminAddress}>
                            <HiOutlineKey style={{ opacity: 0.5 }} />
                            {addr.slice(0, 6)}...{addr.slice(-6)}
                            {info.name && <span className={styles.adminName}>({info.name})</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {info.vaultRole === 'super_admin' && (
                              <span className={styles.roleSuperAdmin}>Super Admin</span>
                            )}
                            {info.vaultRole === 'admin' && (
                              <span className={styles.roleAdmin}>Admin</span>
                            )}
                            {info.vaultRole === 'minter' && (
                              <span className={styles.roleMinter}>Minter</span>
                            )}
                            {info.onChain && <span className={styles.roleOnChain}>On-Chain</span>}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}

                <div className={styles.configRow} style={{ marginTop: 20 }}>
                  <span className={styles.configLabel}>Add Admin</span>
                  <input
                    type="text"
                    className={styles.configInput}
                    placeholder="Enter wallet address..."
                    value={newAdmin}
                    onChange={(e) => setNewAdmin(e.target.value)}
                  />
                  <button className={styles.configBtn} onClick={addAdmin}>
                    Add
                  </button>
                </div>
                <div className={styles.configRow}>
                  <span className={styles.configLabel}>Remove Admin</span>
                  <input
                    type="text"
                    className={styles.configInput}
                    placeholder="Enter wallet address..."
                    value={removeAdminAddr}
                    onChange={(e) => setRemoveAdminAddr(e.target.value)}
                  />
                  <button
                    className={styles.configBtn}
                    onClick={removeAdmin}
                    style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>

            {/* LuxHub Vault Configuration */}
            <div style={{ marginTop: '2rem' }}>
              <Suspense fallback={<TabLoader />}>
                <VaultConfigPanel />
              </Suspense>
            </div>
          </div>
        );
      case 8:
        return (
          <Suspense fallback={<TabLoader />}>
            <VendorManagementPanel wallet={anchorWallet} />
          </Suspense>
        );
      case 9:
        return (
          <div className={styles.section}>
            {/* Multisig Info Panel */}
            {squadsMultisigInfo && (
              <div className={styles.multisigPanel}>
                <div className={styles.multisigHeader}>
                  <h3 className={styles.multisigTitle}>
                    <HiOutlineShieldCheck className="icon" />
                    Multisig Configuration
                  </h3>
                  {squadsMultisigInfo.squadsUrl && (
                    <a
                      href={squadsMultisigInfo.squadsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.multisigLink}
                    >
                      Open in Squads <HiOutlineExternalLink />
                    </a>
                  )}
                </div>

                <div className={styles.multisigStats}>
                  <div className={styles.multisigStat}>
                    <div className={styles.multisigStatValue}>
                      {squadsMultisigInfo.threshold || 0}
                    </div>
                    <div className={styles.multisigStatLabel}>Threshold</div>
                  </div>
                  <div className={styles.multisigStat}>
                    <div className={styles.multisigStatValue}>
                      {squadsMultisigInfo.members?.length || 0}
                    </div>
                    <div className={styles.multisigStatLabel}>Members</div>
                  </div>
                  <div className={styles.multisigStat}>
                    <div className={styles.multisigStatValue}>
                      {squadsMultisigInfo.transactionIndex || 0}
                    </div>
                    <div className={styles.multisigStatLabel}>Total Proposals</div>
                  </div>
                </div>

                <div className={styles.multisigDetails}>
                  <details className={styles.detailsToggle}>
                    <summary className={styles.detailsSummary}>
                      View Members ({squadsMultisigInfo.members?.length})
                    </summary>
                    <ul className={styles.membersList}>
                      {squadsMultisigInfo.members?.map((m, i) => (
                        <li key={i} className={styles.memberItem}>
                          <code>
                            {m.pubkey.slice(0, 8)}...{m.pubkey.slice(-8)}
                          </code>
                          <div className={styles.permissionBadge}>
                            {m.permissions.initiate && <span>Initiate</span>}
                            {m.permissions.vote && <span>Vote</span>}
                            {m.permissions.execute && <span>Execute</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>

                  {squadsMultisigInfo.vaults && squadsMultisigInfo.vaults.length > 0 && (
                    <details className={styles.detailsToggle}>
                      <summary className={styles.detailsSummary}>
                        View Vaults ({squadsMultisigInfo.vaults.length})
                      </summary>
                      <ul className={styles.membersList}>
                        {squadsMultisigInfo.vaults.map((v, i) => (
                          <li key={i} className={styles.memberItem}>
                            <span>
                              <strong>Vault {v.index}:</strong>{' '}
                              <code>
                                {v.pda.slice(0, 8)}...{v.pda.slice(-8)}
                              </code>
                            </span>
                            {v.balance !== undefined && (
                              <span className={styles.vaultBalance}>
                                {(v.balance / 1e9).toFixed(4)} SOL
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            )}

            {/* Filter Bar */}
            <div className={styles.filterBar}>
              <select
                value={squadsFilter}
                onChange={(e) => {
                  setSquadsFilter(e.target.value);
                  fetchSquadsProposals(e.target.value);
                }}
                className={styles.filterSelect}
              >
                <option value="pending">Pending (Active/Approved)</option>
                <option value="active">Active Only</option>
                <option value="approved">Approved Only</option>
                <option value="executed">Executed</option>
                <option value="all">All Proposals</option>
              </select>
              <button
                onClick={() => fetchSquadsProposals(squadsFilter)}
                disabled={squadsLoading}
                className={styles.refreshBtn}
              >
                <HiOutlineRefresh />
                {squadsLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {/* Proposals Grid */}
            {squadsLoading ? (
              <div className={styles.loading}>
                <div className={styles.loadingSpinner} />
                <span className={styles.loadingText}>Loading proposals...</span>
              </div>
            ) : squadsProposals.length === 0 ? (
              <div className={styles.emptyState}>
                <HiOutlineShieldCheck className={styles.emptyIcon} />
                <h3 className={styles.emptyTitle}>No Proposals Found</h3>
                <p className={styles.emptyDescription}>
                  No proposals match the selected filter criteria.
                </p>
              </div>
            ) : (
              <div className={styles.cardsGrid}>
                {squadsProposals.map((proposal, idx) => {
                  const canExecute =
                    proposal.status === 'approved' ||
                    (proposal.status === 'active' && proposal.approvals >= proposal.threshold);
                  const isExecuted = proposal.status === 'executed';

                  const statusClass =
                    proposal.status === 'executed'
                      ? styles.executed
                      : proposal.status === 'approved'
                        ? styles.approved
                        : proposal.status === 'rejected'
                          ? styles.rejected
                          : proposal.status === 'cancelled'
                            ? styles.cancelled
                            : styles.active;

                  return (
                    <div key={idx} className={styles.dataCard}>
                      <div className={styles.cardHeader}>
                        <div className={styles.cardTitleArea}>
                          <h3 className={styles.cardTitle}>
                            Proposal #{proposal.transactionIndex}
                          </h3>
                          <span className={styles.cardSubtitle}>
                            {proposal.proposalPda.slice(0, 8)}...{proposal.proposalPda.slice(-6)}
                          </span>
                        </div>
                        <span className={`${styles.cardStatus} ${statusClass}`}>
                          {proposal.status}
                        </span>
                      </div>

                      <div className={styles.cardBody}>
                        <div className={styles.cardRow}>
                          <span className={styles.cardLabel}>Approvals</span>
                          <span className={`${styles.cardValue} ${styles.cardHighlight}`}>
                            {proposal.approvals} / {proposal.threshold}
                          </span>
                        </div>
                        <div className={styles.cardRow}>
                          <span className={styles.cardLabel}>Rejections</span>
                          <span className={styles.cardValue}>{proposal.rejections}</span>
                        </div>
                        <div className={styles.cardRow}>
                          <span className={styles.cardLabel}>View on Solscan</span>
                          <span className={styles.cardValue}>
                            <a
                              href={getClusterConfig().explorerUrl(proposal.proposalPda)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open <HiOutlineExternalLink style={{ verticalAlign: 'middle' }} />
                            </a>
                          </span>
                        </div>
                      </div>

                      <div className={styles.cardFooter}>
                        <button
                          className={styles.cardBtn}
                          onClick={() => refreshProposalStatus(proposal.transactionIndex)}
                          disabled={squadsLoading}
                        >
                          Refresh
                        </button>
                        {(proposal.status === 'active' || proposal.status === 'draft') && (
                          <>
                            <button
                              className={`${styles.cardBtn} ${styles.success}`}
                              onClick={() => approveSquadsProposal(proposal.transactionIndex)}
                              disabled={squadsLoading}
                            >
                              Approve
                            </button>
                            <button
                              className={`${styles.cardBtn} ${styles.danger}`}
                              onClick={() => rejectSquadsProposal(proposal.transactionIndex)}
                              disabled={squadsLoading}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {canExecute && !isExecuted && (
                          <button
                            className={`${styles.cardBtn} ${styles.primary}`}
                            onClick={() => executeSquadsProposal(proposal.transactionIndex)}
                            disabled={squadsLoading}
                          >
                            Execute
                          </button>
                        )}
                        {isExecuted && (
                          <button
                            className={`${styles.cardBtn} ${styles.success}`}
                            onClick={() => {
                              const seed = prompt('Enter escrow seed to sync:');
                              if (seed) syncEscrowState(seed);
                            }}
                            disabled={squadsLoading}
                          >
                            Sync DB
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 10:
        return (
          <Suspense fallback={<TabLoader />}>
            <ShipmentVerificationTab onStatusChange={refreshData} />
          </Suspense>
        );
      case 11:
        return (
          <Suspense fallback={<TabLoader />}>
            <CustodyDashboard />
          </Suspense>
        );
      case 12: // Vault Inventory
        return (
          <Suspense fallback={<TabLoader />}>
            <VaultInventoryTab />
          </Suspense>
        );
      case 13: // Platform Settings
        return (
          <Suspense fallback={<TabLoader />}>
            <PlatformSettingsPanel />
          </Suspense>
        );
      case 14: // Asset Cleanup
        return (
          <Suspense fallback={<TabLoader />}>
            <AssetCleanupPanel />
          </Suspense>
        );
      case 15: // Delist Requests
        return (
          <Suspense fallback={<TabLoader />}>
            <DelistRequestsPanel />
          </Suspense>
        );
      case 16: // Mint Requests
        return (
          <Suspense fallback={<TabLoader />}>
            <MintRequestsPanel />
          </Suspense>
        );
      default:
        return null;
    }
  };

  // Navigation items configuration
  const navItems = [
    { id: 1, label: 'Overview', icon: HiOutlineHome },
    { id: 5, label: 'Sale Requests', icon: HiOutlineClipboardList, badge: saleRequests.length },
    { id: 2, label: 'Active Escrows', icon: HiOutlineLockClosed, badge: activeEscrows.length },
    { id: 10, label: 'Shipments', icon: HiOutlineTruck },
    { id: 11, label: 'Pool Custody', icon: HiOutlineCube },
  ];

  const nftNavItems = [
    { id: 16, label: 'Mint Requests', icon: HiOutlineCube, badge: pendingMintRequests },
    { id: 12, label: 'Vault Inventory', icon: HiOutlineDatabase },
    { id: 15, label: 'Delist Requests', icon: HiOutlineExclamation, badge: pendingDelistRequests },
    { id: 14, label: 'Asset Cleanup', icon: HiOutlineTrash },
    { id: 6, label: 'Metadata Editor', icon: HiOutlineDocumentText },
    { id: 7, label: 'Change Requests', icon: HiOutlineCollection },
  ];

  const securityNavItems = [
    { id: 13, label: 'Platform Settings', icon: HiOutlineCog },
    { id: 9, label: 'Squads Multisig', icon: HiOutlineShieldCheck, badge: squadsProposals.length },
    {
      id: 8,
      label: 'Vendor Approvals',
      icon: HiOutlineUserGroup,
      badge: pendingVendorApprovals + newApplications,
    },
    { id: 3, label: 'Transactions', icon: HiOutlineCash },
    { id: 0, label: 'Escrow Config', icon: HiOutlineDatabase },
  ];

  // Render nav panel item for FAB overlay
  const renderNavPanelItem = (item: { id: number; label: string; icon: any; badge?: number }) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        className={`${styles.navPanelItem} ${tabIndex === item.id ? styles.navPanelItemActive : ''}`}
        onClick={() => {
          setTabIndex(item.id);
          setNavOpen(false);
        }}
        role="menuitem"
      >
        <Icon className={styles.navPanelIcon} />
        <span>{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className={styles.navPanelBadge}>{item.badge}</span>
        )}
      </button>
    );
  };

  // Not connected state
  if (!publicKey) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.accessDenied}>
          <HiOutlineKey className={styles.accessDeniedIcon} />
          <h1 className={styles.accessDeniedTitle}>Connect Wallet</h1>
          <p className={styles.accessDeniedText}>
            Please connect your wallet to access the admin dashboard.
          </p>
        </div>
      </div>
    );
  }

  // Not admin state
  if (isAdmin === false) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.accessDenied}>
          <HiOutlineLockClosed className={styles.accessDeniedIcon} />
          <h1 className={styles.accessDeniedTitle}>Access Denied</h1>
          <p className={styles.accessDeniedText}>
            Your wallet is not authorized as an admin. If you believe this is an error, check your
            admin config or switch wallets.
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (isAdmin === null) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.loading}>
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>Verifying admin access...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* FAB Nav Bubble — gradient-border pill matching AI Assistant & WalletNavbar */}
      <div className={styles.fabContainer}>
        <div className={styles.fabLabel}>
          {[...navItems, ...nftNavItems, ...securityNavItems].find((i) => i.id === tabIndex)
            ?.label ?? 'Menu'}
        </div>
        <motion.button
          className={styles.fab}
          onClick={() => setNavOpen((prev) => !prev)}
          whileTap={{ scale: 0.95 }}
          aria-label="Admin navigation menu"
          aria-expanded={navOpen}
        >
          {navOpen ? <HiOutlineX /> : <HiOutlineViewGrid />}
          <span className={styles.fabIconLabel}>{navOpen ? 'Close' : 'Nav'}</span>
        </motion.button>
      </div>

      <AnimatePresence>
        {navOpen && (
          <motion.div
            key="nav-backdrop"
            className={styles.navBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setNavOpen(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {navOpen && (
          <motion.div
            key="nav-panel"
            className={styles.navPanel}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            role="menu"
          >
            <div className={styles.navGroup}>
              <div className={styles.navGroupLabel}>Operations</div>
              {navItems.map((item) => renderNavPanelItem(item))}
            </div>
            <div className={styles.navGroupDivider} />
            <div className={styles.navGroup}>
              <div className={styles.navGroupLabel}>NFT Management</div>
              {nftNavItems.map((item) => renderNavPanelItem(item))}
            </div>
            <div className={styles.navGroupDivider} />
            <div className={styles.navGroup}>
              <div className={styles.navGroupLabel}>Security &amp; Config</div>
              {securityNavItems.map((item) => renderNavPanelItem(item))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className={styles.mainContent}>
        <div className={styles.contentBody}>
          {/* Quick Stats Overview */}
          {tabIndex === 5 && (
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statIcon}>
                  <HiOutlineClipboardList />
                </div>
                <div className={styles.statValue}>{saleRequests.length}</div>
                <div className={styles.statLabel}>Pending Requests</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statIcon}>
                  <HiOutlineLockClosed />
                </div>
                <div className={styles.statValue}>{activeEscrows.length}</div>
                <div className={styles.statLabel}>Active Escrows</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statIcon}>
                  <HiOutlineShieldCheck />
                </div>
                <div className={styles.statValue}>{squadsProposals.length}</div>
                <div className={styles.statLabel}>Squads Proposals</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statIcon}>
                  <HiOutlineUserGroup />
                </div>
                <div className={styles.statValue}>{adminList.length}</div>
                <div className={styles.statLabel}>Active Admins</div>
              </div>
            </div>
          )}

          {renderTabContent()}
        </div>
      </main>

      {/* Status Bar */}
      {status && <div className={styles.statusBar}>{status}</div>}
    </div>
  );
};

export default AdminDashboard;
