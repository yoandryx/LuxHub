// src/components/admins/MintRequestsPanel.tsx
// Admin panel to review, approve, and mint vendor mint requests
// Two-step flow: Review (approve/reject) → Mint (for approved requests)
// Uses UMI with walletAdapterIdentity for client-side minting (matches createNFT.tsx)
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import {
  mplTokenMetadata,
  createNft,
  transferV1,
  TokenStandard,
} from '@metaplex-foundation/mpl-token-metadata';
import { generateSigner, publicKey as umiPublicKey, percentAmount } from '@metaplex-foundation/umi';
import toast from 'react-hot-toast';
import { getClusterConfig } from '@/lib/solana/clusterConfig';
import { getProgram } from '@/utils/programUtils';
import styles from '../../styles/AdminDashboard.module.css';
import {
  HiOutlineRefresh,
  HiOutlineCheck,
  HiOutlineX,
  HiOutlineExternalLink,
  HiOutlineFilter,
  HiOutlinePhotograph,
  HiOutlineCube,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineSparkles,
  HiOutlineShieldCheck,
  HiOutlineUserGroup,
} from 'react-icons/hi';

interface MintRequest {
  _id: string;
  title: string;
  brand: string;
  model: string;
  referenceNumber: string;
  serialNumber?: string;
  priceUSD: number;
  wallet: string;
  imageUrl?: string;
  imageCid?: string;
  description?: string;
  material?: string;
  productionYear?: string;
  movement?: string;
  caseSize?: string;
  waterResistance?: string;
  dialColor?: string;
  condition?: string;
  boxPapers?: string;
  limitedEdition?: string;
  country?: string;
  certificate?: string;
  warrantyInfo?: string;
  provenance?: string;
  features?: string;
  releaseDate?: string;
  status: 'pending' | 'approved' | 'rejected' | 'minted';
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  mintedBy?: string;
  mintedAt?: string;
  mintAddress?: string;
  squadsMemberWallet?: string;
  requestSource?: 'vendor' | 'admin';
  transferDestination?: string;
  transferDestinationType?: 'requester' | 'vendor' | 'custom' | 'admin';
  transferredTo?: string;
  transferSuccess?: boolean;
  createdAt: string;
}

interface VendorOption {
  wallet: string;
  name: string;
  username?: string;
}

interface SquadsMembership {
  isMember: boolean;
  canMint: boolean;
  squadsConfigured: boolean;
  permissions?: {
    canInitiate: boolean;
    canVote: boolean;
    canExecute: boolean;
  };
}

// Convert Dropbox share URL to displayable image URL
const getDisplayImageUrl = (url?: string): string | null => {
  if (!url) return null;
  if (url.includes('gateway.irys.xyz') || url.includes('ipfs') || url.includes('pinata')) {
    return url;
  }
  if (url.includes('dropbox.com')) {
    return url
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/[?&]dl=0/, '?raw=1')
      .replace(/[?&]dl=1/, '?raw=1');
  }
  return url;
};

const MintRequestsPanel: React.FC = () => {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [requests, setRequests] = useState<MintRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'minted' | 'all'>(
    'pending'
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    steps?: string[];
    confirmLabel: string;
    confirmColor: string;
    onConfirm: () => void;
    rejectReason?: boolean;
    requestId?: string;
  } | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [squadsMembership, setSquadsMembership] = useState<SquadsMembership | null>(null);
  const [checkingSquads, setCheckingSquads] = useState(false);

  // Transfer destination state
  const [transferType, setTransferType] = useState<
    Record<string, 'requester' | 'vendor' | 'custom' | 'admin'>
  >({});
  const [customAddress, setCustomAddress] = useState<Record<string, string>>({});
  const [selectedVendor, setSelectedVendor] = useState<Record<string, string>>({});
  const [verifiedVendors, setVerifiedVendors] = useState<VendorOption[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);

  // Check Squads membership when wallet connects
  useEffect(() => {
    const checkMembership = async () => {
      if (!wallet.publicKey) {
        setSquadsMembership(null);
        return;
      }

      setCheckingSquads(true);
      try {
        const res = await fetch(
          `/api/squads/check-membership?wallet=${wallet.publicKey.toBase58()}`
        );
        const data = await res.json();
        setSquadsMembership(data);
      } catch (error) {
        console.error('Failed to check Squads membership:', error);
        setSquadsMembership({ isMember: false, canMint: false, squadsConfigured: false });
      } finally {
        setCheckingSquads(false);
      }
    };

    checkMembership();
  }, [wallet.publicKey]);

  // Fetch verified vendors for transfer dropdown
  useEffect(() => {
    const fetchVendors = async () => {
      setLoadingVendors(true);
      try {
        const res = await fetch('/api/vendor/vendorList?approved=true');
        const data = await res.json();
        if (data.vendors) {
          setVerifiedVendors(
            data.vendors.map((v: any) => ({
              wallet: v.wallet,
              name: v.name || v.username || 'Unknown Vendor',
              username: v.username,
            }))
          );
        }
      } catch (error) {
        console.error('Failed to fetch vendors:', error);
      } finally {
        setLoadingVendors(false);
      }
    };

    fetchVendors();
  }, []);

  // Get transfer destination wallet based on selection
  const getTransferDestination = (request: MintRequest): string | null => {
    const type = transferType[request._id] || 'requester';

    switch (type) {
      case 'requester':
        return request.wallet; // Original requester (vendor who submitted)
      case 'vendor':
        return selectedVendor[request._id] || null; // Admin-selected vendor
      case 'custom':
        return customAddress[request._id] || null; // Custom address
      case 'admin':
        return null; // Keep in admin wallet (no transfer)
      default:
        return request.wallet;
    }
  };

  // Check if requester is a verified vendor
  const isRequesterVerifiedVendor = (wallet: string): boolean => {
    return verifiedVendors.some((v) => v.wallet === wallet);
  };

  const fetchRequests = useCallback(async () => {
    if (!wallet.publicKey) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.append('status', filter);
      }

      const res = await fetch(`/api/admin/mint-requests?${params.toString()}`, {
        headers: {
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
      });
      const data = await res.json();

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setRequests(data.requests || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch mint requests:', err);
      toast.error('Failed to fetch mint requests');
    } finally {
      setLoading(false);
    }
  }, [filter, wallet.publicKey]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const closeModal = () => {
    setConfirmModal(null);
    setRejectReasonInput('');
  };

  // Step 1: Review (Approve without minting)
  const handleReview = async (requestId: string, action: 'approve' | 'reject') => {
    if (!wallet.publicKey) {
      toast.error('Please connect your wallet');
      return;
    }

    const request = requests.find((r) => r._id === requestId);

    if (action === 'reject') {
      // Show reject modal with reason input
      setRejectReasonInput(adminNotes[requestId] || '');
      setConfirmModal({
        open: true,
        title: 'Reject Mint Request',
        message: request
          ? `${request.brand} ${request.model} — ${request.title}`
          : 'This mint request',
        confirmLabel: 'Reject Request',
        confirmColor: 'rgba(239, 68, 68, 0.8)',
        rejectReason: true,
        requestId,
        onConfirm: () => {},
      });
      return;
    }

    // Approve flow
    setConfirmModal({
      open: true,
      title: 'Approve Mint Request',
      message: request
        ? `${request.brand} ${request.model} — ${request.title}`
        : 'This mint request',
      steps: [
        'Request will be marked as approved',
        'Any admin with minting permission can mint it later',
        'No on-chain transaction yet',
      ],
      confirmLabel: 'Approve',
      confirmColor: 'rgba(59, 130, 246, 0.8)',
      requestId,
      onConfirm: () => {},
    });
    return;
  };

  // Actually execute the review after modal confirmation
  const executeReview = async (requestId: string, action: 'approve' | 'reject', notes?: string) => {
    if (!wallet.publicKey) return;

    if (action === 'reject' && notes) {
      setAdminNotes((prev) => ({ ...prev, [requestId]: notes }));
    }

    closeModal();
    setProcessing(requestId);
    const toastId = toast.loading(action === 'approve' ? 'Approving...' : 'Rejecting...');

    try {
      const res = await fetch('/api/admin/mint-requests/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify({
          mintRequestId: requestId,
          action,
          adminNotes: notes || adminNotes[requestId] || '',
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`Request ${action}d successfully`, { id: toastId });
        await fetchRequests();
      } else {
        toast.error(data.error || `Failed to ${action}`, { id: toastId });
      }
    } catch (err) {
      console.error(`Failed to ${action}:`, err);
      toast.error(`Failed to ${action} request`, { id: toastId });
    } finally {
      setProcessing(null);
    }
  };

  // Step 2: Mint (for approved requests only) - UMI CLIENT-SIDE MINTING
  // Matches the pattern from createNFT.tsx for consistency
  const handleMint = async (requestId: string, request: MintRequest) => {
    console.log('========================================');
    console.log('[MINT] Starting mint process for request:', requestId);
    console.log('========================================');

    if (!wallet.publicKey || !wallet.signTransaction) {
      console.error('[MINT] ❌ Wallet not connected or does not support signing');
      toast.error('Please connect a wallet that supports signing');
      return;
    }

    // Determine transfer destination
    const transferDest = getTransferDestination(request);
    const transferTypeSelected = transferType[requestId] || 'requester';

    // Validate custom address if selected
    if (transferTypeSelected === 'custom' && !transferDest) {
      toast.error('Please enter a valid wallet address for transfer');
      return;
    }

    if (transferTypeSelected === 'vendor' && !transferDest) {
      toast.error('Please select a vendor from the dropdown');
      return;
    }

    console.log('[MINT] ✅ Wallet connected:', wallet.publicKey.toBase58());
    console.log('[MINT] Transfer destination:', transferDest || 'Admin Wallet (no transfer)');
    console.log('[MINT] Transfer type:', transferTypeSelected);

    const transferNote = transferDest
      ? `Transfer to: ${transferDest.slice(0, 8)}...`
      : 'NFT will stay in admin wallet';

    setConfirmModal({
      open: true,
      title: 'Mint NFT',
      message: `${request.brand} ${request.model} — ${request.title}`,
      steps: [
        'Upload image to permanent storage (Irys)',
        'Mint the NFT on-chain with your wallet',
        transferDest ? `Transfer to ${transferDest.slice(0, 8)}...` : 'Keep in admin wallet',
        'Auto-list on marketplace',
      ],
      confirmLabel: 'Mint NFT',
      confirmColor: 'rgba(34, 197, 94, 0.8)',
      requestId,
      onConfirm: () => {},
    });
    return;
  };

  // Actually execute the mint after modal confirmation (for already-approved requests)
  const executeMint = async (requestId: string) => {
    const request = requests.find((r) => r._id === requestId);
    if (!request || !wallet.publicKey || !wallet.signTransaction) return;

    const transferDest = getTransferDestination(request);
    const transferTypeSelected = transferType[requestId] || 'requester';

    closeModal();
    setProcessing(requestId);
    const toastId = toast.loading('Preparing metadata...');

    try {
      // Step 1: Generate signer first so we know the mint address for metadata
      const umi = createUmi(connection.rpcEndpoint)
        .use(walletAdapterIdentity(wallet))
        .use(mplTokenMetadata());

      const mintSigner = generateSigner(umi);
      const mintAddress = mintSigner.publicKey.toString();

      // Step 2: Prepare metadata with mint address for external_url
      const prepareRes = await fetch('/api/admin/mint-requests/prepare-mint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify({ mintRequestId: requestId, mintAddress }),
      });

      const prepareData = await prepareRes.json();

      if (!prepareData.success) {
        toast.error(prepareData.error || 'Failed to prepare metadata', { id: toastId });
        return;
      }

      toast.loading('Minting NFT with your wallet...', { id: toastId });

      // Step 3: Mint on-chain (SPL Token + Metaplex Token Metadata)
      await createNft(umi, {
        mint: mintSigner,
        name: (prepareData.title || '').slice(0, 32),
        uri: prepareData.metadataUri,
        sellerFeeBasisPoints: percentAmount(5),
        tokenOwner: umi.identity.publicKey,
      }).sendAndConfirm(umi, { confirm: { commitment: 'finalized' } });

      // Step 4: Initialize on-chain escrow (NFT moves from admin wallet to escrow vault)
      toast.loading('Initializing on-chain escrow...', { id: toastId });

      const sellerWallet = transferDest || wallet.publicKey.toBase58();
      let escrowPdaStr: string;

      try {
        const program = getProgram(wallet);
        const programId = new PublicKey(program.programId);
        const { usdcMint } = getClusterConfig();
        const USDC_MINT = new PublicKey(usdcMint);
        const nftMintPk = new PublicKey(mintAddress);
        const adminPk = wallet.publicKey;

        // Generate unique seed for this escrow
        const seed = Date.now();
        const seedBn = new BN(seed);

        // Derive escrow PDA
        const [escrowPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('state'), seedBn.toArrayLike(Buffer, 'le', 8)],
          programId
        );
        escrowPdaStr = escrowPda.toBase58();

        // Derive config PDA
        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('luxhub-config')],
          programId
        );

        // Derive ATAs
        const sellerAtaB = getAssociatedTokenAddressSync(nftMintPk, adminPk, false);
        const nftVault = getAssociatedTokenAddressSync(nftMintPk, escrowPda, true);
        const usdcVault = getAssociatedTokenAddressSync(USDC_MINT, escrowPda, true);

        // Calculate price in USDC atomic units (6 decimals)
        const priceUsdcAtomic = Math.round((request.priceUSD || 1) * 1_000_000);
        const fileCid = prepareData.imageUrl?.split('/').pop() || mintAddress;

        console.log('[MINT] Step 4: Initializing escrow...');
        console.log('[MINT]   - Escrow PDA:', escrowPdaStr);
        console.log('[MINT]   - Seed:', seed);
        console.log('[MINT]   - Price USDC:', priceUsdcAtomic);
        console.log('[MINT]   - NFT Mint:', mintAddress);
        console.log('[MINT]   - Seller (vendor):', sellerWallet);

        await program.methods
          .initialize(
            new BN(seed),
            new BN(1),              // initializer_amount (1 NFT)
            new BN(priceUsdcAtomic), // taker_amount (USDC price)
            fileCid,
            new BN(priceUsdcAtomic)  // sale_price
          )
          .accounts({
            admin: adminPk,
            seller: adminPk, // Admin is the current NFT owner (seller signs to transfer NFT to vault)
            config: configPda,
            mintA: USDC_MINT,
            mintB: nftMintPk,
            sellerAtaB: sellerAtaB,
            escrow: escrowPda,
            nftVault: nftVault,
            wsolVault: usdcVault,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc({ commitment: 'finalized' });

        console.log('[MINT] ✅ Escrow initialized on-chain:', escrowPdaStr);
      } catch (escrowErr: any) {
        console.error('[MINT] ❌ Escrow initialization failed:', escrowErr.message || escrowErr);
        toast.error('NFT minted but escrow initialization failed. Contact admin.', { id: toastId });
        setProcessing(null);
        return;
      }

      toast.loading('Creating marketplace listing...', { id: toastId });

      // Step 5: Record the mint in the database with real escrow PDA
      console.log('[MINT] Step 5: Calling confirm-mint API...');
      const confirmRes = await fetch('/api/admin/mint-requests/confirm-mint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify({
          mintRequestId: requestId,
          mintAddress,
          signature: mintAddress,
          escrowPda: escrowPdaStr, // Real on-chain PDA
          escrowSeed: seed, // Seed used to derive PDA (needed for confirm_delivery)
          transferToVendor: false, // NFT is in escrow vault, not vendor wallet
          transferDestination: sellerWallet,
          transferDestinationType: transferTypeSelected,
          transferSuccess: true,
        }),
      });

      const confirmData = await confirmRes.json();
      console.log('[MINT] Confirm response:', JSON.stringify(confirmData, null, 2));

      if (confirmData.success) {
        console.log('[MINT] ========================================');
        console.log('[MINT] ✅ MINT COMPLETE - ALL STEPS SUCCESSFUL!');
        console.log('[MINT] ========================================');
        console.log('[MINT] Summary:');
        console.log('[MINT]   - Mint Address:', mintAddress);
        console.log('[MINT]   - Asset ID:', confirmData.assetId);
        console.log('[MINT]   - Escrow ID:', confirmData.escrowId);
        console.log('[MINT]   - Vendor Wallet:', confirmData.vendorWallet);
        console.log('[MINT]   - Listing Price: $' + confirmData.listingPriceUSD);
        console.log('[MINT] ========================================');

        toast.success(
          <div>
            NFT minted & listed on marketplace!
            <br />
            <a
              href={getClusterConfig().explorerUrl(mintAddress)}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#c8a1ff' }}
            >
              View on Explorer
            </a>
          </div>,
          { id: toastId, duration: 5000 }
        );
        await fetchRequests();
      } else {
        console.log('[MINT] ⚠️ Mint succeeded but confirm-mint returned error:', confirmData.error);
        toast.success(
          <div>
            NFT minted! (listing pending)
            <br />
            Mint: {mintAddress.slice(0, 8)}...
          </div>,
          { id: toastId }
        );
        await fetchRequests();
      }
    } catch (err: any) {
      console.error('[MINT] ❌ MINT FAILED:', err);
      console.error('[MINT] Error details:', err.message || err);
      console.error('[MINT] Stack:', err.stack);
      if (err.message?.includes('User rejected')) {
        toast.error('Transaction cancelled by user', { id: toastId });
      } else {
        toast.error(err.message || 'Failed to mint NFT', { id: toastId });
      }
    } finally {
      console.log('[MINT] Process finished, resetting state');
      setProcessing(null);
    }
  };

  // Approve and mint in one step - UMI CLIENT-SIDE MINTING
  const handleApproveAndMint = async (requestId: string) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error('Please connect a wallet that supports signing');
      return;
    }

    const request = requests.find((r) => r._id === requestId);
    setConfirmModal({
      open: true,
      title: 'Approve + Mint NFT',
      message: request ? `${request.brand} ${request.model} — ${request.title}` : 'This NFT',
      steps: [
        'Approve the mint request',
        'Upload image to permanent storage (Irys)',
        'Mint the NFT on-chain with your wallet',
        'Transfer to designated recipient',
      ],
      confirmLabel: 'Approve + Mint',
      confirmColor: 'rgba(34, 197, 94, 0.8)',
      requestId,
      onConfirm: () => {},
    });
    return;
  };

  // Actually execute the approve + mint after modal confirmation
  const executeApproveAndMint = async (requestId: string) => {
    if (!wallet.publicKey || !wallet.signTransaction) return;

    closeModal();
    setProcessing(requestId);
    const toastId = toast.loading('Approving request...');

    try {
      // Step 1: Approve the request first
      const approveRes = await fetch('/api/admin/mint-requests/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify({
          mintRequestId: requestId,
          action: 'approve',
          adminNotes: adminNotes[requestId] || '',
        }),
      });

      const approveData = await approveRes.json();
      if (!approveRes.ok) {
        toast.error(approveData.error || 'Failed to approve', { id: toastId });
        return;
      }

      // Step 2: Generate signer first so we know the mint address
      const umi = createUmi(connection.rpcEndpoint)
        .use(walletAdapterIdentity(wallet))
        .use(mplTokenMetadata());

      const mintSigner = generateSigner(umi);
      const mintAddress = mintSigner.publicKey.toString();

      toast.loading('Preparing metadata...', { id: toastId });

      // Step 3: Prepare metadata with mint address for external_url
      const prepareRes = await fetch('/api/admin/mint-requests/prepare-mint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify({ mintRequestId: requestId, mintAddress }),
      });

      const prepareData = await prepareRes.json();

      if (!prepareData.success) {
        toast.error(prepareData.error || 'Failed to prepare metadata', { id: toastId });
        return;
      }

      toast.loading('Minting NFT with your wallet...', { id: toastId });

      // Step 4: Mint with the pre-generated signer (SPL Token + Metaplex Token Metadata)
      console.log('[MINT] Approve & Mint:', prepareData.title);

      await createNft(umi, {
        mint: mintSigner,
        name: (prepareData.title || '').slice(0, 32),
        uri: prepareData.metadataUri,
        sellerFeeBasisPoints: percentAmount(5),
        tokenOwner: umi.identity.publicKey,
      }).sendAndConfirm(umi, { confirm: { commitment: 'finalized' } });
      console.log('[MINT] Success! Mint address:', mintAddress);

      // Step 5: Initialize on-chain escrow (NFT moves from admin wallet to escrow vault)
      toast.loading('Initializing on-chain escrow...', { id: toastId });

      const sellerWallet = prepareData.vendorWallet || wallet.publicKey.toBase58();
      let escrowPdaStr: string;

      try {
        const program = getProgram(wallet);
        const programId = new PublicKey(program.programId);
        const { usdcMint } = getClusterConfig();
        const USDC_MINT_PK = new PublicKey(usdcMint);
        const nftMintPk = new PublicKey(mintAddress);
        const adminPk = wallet.publicKey;

        const seed = Date.now();
        const seedBn = new BN(seed);

        const [escrowPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('state'), seedBn.toArrayLike(Buffer, 'le', 8)],
          programId
        );
        escrowPdaStr = escrowPda.toBase58();

        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('luxhub-config')],
          programId
        );

        const sellerAtaB = getAssociatedTokenAddressSync(nftMintPk, adminPk, false);
        const nftVault = getAssociatedTokenAddressSync(nftMintPk, escrowPda, true);
        const usdcVault = getAssociatedTokenAddressSync(USDC_MINT_PK, escrowPda, true);

        const request = requests.find((r) => r._id === requestId);
        const priceUsdcAtomic = Math.round((request?.priceUSD || 1) * 1_000_000);
        const fileCid = prepareData.imageUrl?.split('/').pop() || mintAddress;

        console.log('[MINT] Step 5: Initializing escrow PDA:', escrowPdaStr);

        await program.methods
          .initialize(
            new BN(seed),
            new BN(1),
            new BN(priceUsdcAtomic),
            fileCid,
            new BN(priceUsdcAtomic)
          )
          .accounts({
            admin: adminPk,
            seller: adminPk,
            config: configPda,
            mintA: USDC_MINT_PK,
            mintB: nftMintPk,
            sellerAtaB: sellerAtaB,
            escrow: escrowPda,
            nftVault: nftVault,
            wsolVault: usdcVault,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc({ commitment: 'finalized' });

        console.log('[MINT] ✅ Escrow initialized:', escrowPdaStr);
      } catch (escrowErr: any) {
        console.error('[MINT] ❌ Escrow init failed:', escrowErr.message || escrowErr);
        toast.error('NFT minted but escrow failed. Contact admin.', { id: toastId });
        setProcessing(null);
        return;
      }

      toast.loading('Creating marketplace listing...', { id: toastId });

      // Step 6: Confirm in database with real escrow PDA
      const confirmRes = await fetch('/api/admin/mint-requests/confirm-mint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify({
          mintRequestId: requestId,
          mintAddress,
          signature: mintAddress,
          escrowPda: escrowPdaStr,
          escrowSeed: seed,
          transferToVendor: false,
          transferDestination: sellerWallet,
          transferDestinationType: 'requester',
          transferSuccess: true,
        }),
      });

      const confirmData = await confirmRes.json();

      if (confirmData.success) {
        toast.success(`NFT minted: ${mintAddress.slice(0, 8)}...`, { id: toastId });
        await fetchRequests();
      } else {
        toast.success(`Minted (DB pending): ${mintAddress.slice(0, 8)}...`, { id: toastId });
        await fetchRequests();
      }
    } catch (err: any) {
      console.error('Failed to mint:', err);
      if (err.message?.includes('User rejected')) {
        toast.error('Transaction cancelled by user', { id: toastId });
      } else {
        toast.error(err.message || 'Failed to mint NFT', { id: toastId });
      }
    } finally {
      setProcessing(null);
    }
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#f59e0b';
      case 'approved':
        return '#3b82f6';
      case 'minted':
        return '#22c55e';
      case 'rejected':
        return '#ef4444';
      default:
        return '#a1a1a1';
    }
  };

  const shortenWallet = (wallet?: string) => {
    if (!wallet) return 'N/A';
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h3>
          <HiOutlineCube /> Mint Requests
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Squads Membership Badge */}
          {checkingSquads ? (
            <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.35)' }}>
              Checking Squads...
            </span>
          ) : squadsMembership?.squadsConfigured ? (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: squadsMembership.isMember
                  ? 'rgba(34, 197, 94, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                color: squadsMembership.isMember ? '#22c55e' : '#ef4444',
                border: `1px solid ${squadsMembership.isMember ? '#22c55e40' : '#ef444440'}`,
              }}
            >
              <HiOutlineUserGroup />
              {squadsMembership.isMember ? 'Squads Member' : 'Not a Member'}
            </span>
          ) : null}

          <button className={styles.refreshBtn} onClick={fetchRequests} disabled={loading}>
            <HiOutlineRefresh className={loading ? styles.spinning : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          borderBottom: '1px solid rgba(185, 145, 255, 0.08)',
          paddingBottom: '10px',
          flexWrap: 'wrap',
        }}
      >
        {(['pending', 'approved', 'minted', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 16px',
              background: filter === f ? 'rgba(185, 145, 255, 0.12)' : '#0a0a0c',
              border: '1px solid',
              borderColor: filter === f ? 'rgba(185, 145, 255, 0.4)' : 'rgba(185, 145, 255, 0.08)',
              borderRadius: '10px',
              color: filter === f ? '#c8a1ff' : 'rgba(255, 255, 255, 0.5)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              textTransform: 'capitalize',
              transition: 'all 0.25s ease',
            }}
          >
            <HiOutlineFilter style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            {f}
          </button>
        ))}
      </div>

      {/* Info Banner for Two-Step Flow */}
      {filter === 'pending' && (
        <div
          style={{
            padding: '14px 18px',
            background: 'rgba(185, 145, 255, 0.06)',
            border: '1px solid rgba(185, 145, 255, 0.15)',
            borderRadius: '12px',
            marginBottom: '20px',
            fontSize: '0.85rem',
            color: 'rgba(200, 161, 255, 0.8)',
          }}
        >
          <strong>Two-Step Flow:</strong> Review requests first (approve/reject), then mint approved
          ones. Squads members can mint with audit trail.
        </div>
      )}

      {/* Requests List */}
      {loading ? (
        <div className={styles.loadingTab}>Loading mint requests...</div>
      ) : requests.length === 0 ? (
        <div
          style={{ textAlign: 'center', padding: '60px 40px', color: 'rgba(255, 255, 255, 0.4)' }}
        >
          <HiOutlineCube
            style={{ fontSize: '2.5rem', marginBottom: '12px', color: 'rgba(185, 145, 255, 0.3)' }}
          />
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            No {filter !== 'all' ? filter : ''} mint requests found
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {requests.map((request) => (
            <div
              key={request._id}
              style={{
                position: 'relative',
                background: 'rgba(10, 10, 14, 0.6)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(185, 145, 255, 0.1)',
                borderRadius: '14px',
                overflow: 'hidden',
                transition: 'all 0.25s ease',
              }}
            >
              {/* Request Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                }}
                onClick={() => setExpandedId(expandedId === request._id ? null : request._id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {/* Image Preview */}
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '10px',
                      background: 'rgba(10, 10, 14, 0.7)',
                      border: '1px solid rgba(185, 145, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {getDisplayImageUrl(request.imageUrl) ? (
                      <img
                        src={getDisplayImageUrl(request.imageUrl)!}
                        alt={request.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <HiOutlinePhotograph
                        style={{ fontSize: '1.5rem', color: 'rgba(255, 255, 255, 0.35)' }}
                      />
                    )}
                  </div>

                  {/* Info */}
                  <div>
                    <div style={{ fontWeight: 600, color: '#fff' }}>{request.title}</div>
                    <div style={{ fontSize: '0.8rem', color: '#a1a1a1' }}>
                      {request.brand} {request.model} - #{request.referenceNumber}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#c8a1ff', fontWeight: 500 }}>
                      ${request.priceUSD?.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {/* Status Badge */}
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background: `${getStatusColor(request.status)}20`,
                      color: getStatusColor(request.status),
                    }}
                  >
                    {request.status}
                  </span>

                  {/* Squads Verified Badge */}
                  {request.squadsMemberWallet && (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.65rem',
                        background: 'rgba(200, 161, 255, 0.1)',
                        color: '#c8a1ff',
                      }}
                    >
                      <HiOutlineShieldCheck /> Squads
                    </span>
                  )}

                  {/* Expand Icon */}
                  {expandedId === request._id ? (
                    <HiOutlineChevronUp style={{ color: 'rgba(255, 255, 255, 0.35)' }} />
                  ) : (
                    <HiOutlineChevronDown style={{ color: 'rgba(255, 255, 255, 0.35)' }} />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === request._id && (
                <div
                  style={{
                    padding: '20px',
                    borderTop: '1px solid rgba(185, 145, 255, 0.08)',
                    background: 'rgba(10, 10, 14, 0.5)',
                    backdropFilter: 'blur(24px)',
                  }}
                >
                  {/* Image + Details Side by Side */}
                  <div style={{ display: 'flex', gap: '20px', marginBottom: '16px' }}>
                    {/* Image - compact left column */}
                    {getDisplayImageUrl(request.imageUrl) && (
                      <div style={{ flexShrink: 0 }}>
                        <img
                          src={getDisplayImageUrl(request.imageUrl)!}
                          alt={request.title}
                          style={{
                            width: '140px',
                            height: '140px',
                            borderRadius: '12px',
                            border: '1px solid rgba(185, 145, 255, 0.15)',
                            objectFit: 'cover',
                          }}
                        />
                      </div>
                    )}

                    {/* Details Grid - fills remaining space */}
                    <div
                      style={{
                        flex: 1,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                        gap: '10px',
                        alignContent: 'start',
                      }}
                    >
                      <div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                          Vendor Wallet
                        </span>
                        <div
                          style={{ color: '#fff', fontSize: '0.85rem', fontFamily: 'monospace' }}
                        >
                          {shortenWallet(request.wallet)}
                        </div>
                      </div>
                      <div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                          Submitted
                        </span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                          {formatDate(request.createdAt)}
                        </div>
                      </div>
                      <div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                          Reference #
                        </span>
                        <div style={{ color: '#c8a1ff', fontSize: '0.85rem', fontWeight: 600 }}>
                          {request.referenceNumber}
                        </div>
                      </div>
                      {request.serialNumber && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Serial Number
                          </span>
                          <div
                            style={{
                              color: '#f59e0b',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              fontFamily: 'monospace',
                            }}
                          >
                            {request.serialNumber}
                          </div>
                        </div>
                      )}
                      <div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                          Price
                        </span>
                        <div style={{ color: '#22c55e', fontSize: '0.85rem', fontWeight: 600 }}>
                          ${request.priceUSD?.toLocaleString()}
                        </div>
                      </div>

                      {/* All Specifications */}
                      {request.material && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Material
                          </span>
                          <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                            {request.material}
                          </div>
                        </div>
                      )}
                      {request.movement && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Movement
                          </span>
                          <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                            {request.movement}
                          </div>
                        </div>
                      )}
                      {request.caseSize && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Case Size
                          </span>
                          <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                            {request.caseSize}
                          </div>
                        </div>
                      )}
                      {request.dialColor && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Dial Color
                          </span>
                          <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                            {request.dialColor}
                          </div>
                        </div>
                      )}
                      {request.waterResistance && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Water Resistance
                          </span>
                          <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                            {request.waterResistance}
                          </div>
                        </div>
                      )}
                      {request.condition && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Condition
                          </span>
                          <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                            {request.condition}
                          </div>
                        </div>
                      )}
                      {request.productionYear && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Production Year
                          </span>
                          <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                            {request.productionYear}
                          </div>
                        </div>
                      )}
                      {request.boxPapers && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Box & Papers
                          </span>
                          <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                            {request.boxPapers}
                          </div>
                        </div>
                      )}
                      {request.country && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Country
                          </span>
                          <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                            {request.country}
                          </div>
                        </div>
                      )}

                      {/* Audit Trail */}
                      {request.reviewedBy && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Reviewed By
                          </span>
                          <div
                            style={{
                              color: '#3b82f6',
                              fontSize: '0.85rem',
                              fontFamily: 'monospace',
                            }}
                          >
                            {shortenWallet(request.reviewedBy)}
                          </div>
                        </div>
                      )}
                      {request.reviewedAt && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Reviewed At
                          </span>
                          <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                            {formatDate(request.reviewedAt)}
                          </div>
                        </div>
                      )}
                      {request.mintedBy && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Minted By
                          </span>
                          <div
                            style={{
                              color: '#22c55e',
                              fontSize: '0.85rem',
                              fontFamily: 'monospace',
                            }}
                          >
                            {shortenWallet(request.mintedBy)}
                          </div>
                        </div>
                      )}
                      {request.mintedAt && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Minted At
                          </span>
                          <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                            {formatDate(request.mintedAt)}
                          </div>
                        </div>
                      )}

                      {/* Mint Address */}
                      {request.mintAddress && (
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                            Mint Address
                          </span>
                          <div
                            style={{
                              color: '#22c55e',
                              fontSize: '0.85rem',
                              fontFamily: 'monospace',
                            }}
                          >
                            {request.mintAddress?.slice(0, 8)}...
                            <a
                              href={getClusterConfig().explorerUrl(request.mintAddress)}
                              target="_blank"
                              rel="noreferrer"
                              style={{ marginLeft: '4px', color: '#c8a1ff' }}
                            >
                              <HiOutlineExternalLink />
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {request.description && (
                    <div style={{ marginBottom: '16px' }}>
                      <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                        Description
                      </span>
                      <div
                        style={{
                          color: '#fff',
                          fontSize: '0.85rem',
                          background: 'rgba(10, 10, 14, 0.7)',
                          padding: '14px',
                          borderRadius: '10px',
                          border: '1px solid rgba(185, 145, 255, 0.1)',
                          marginTop: '4px',
                        }}
                      >
                        {request.description}
                      </div>
                    </div>
                  )}

                  {/* Admin Notes */}
                  {request.adminNotes && (
                    <div style={{ marginBottom: '16px' }}>
                      <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>
                        Admin Notes
                      </span>
                      <div style={{ color: '#f59e0b', fontSize: '0.85rem' }}>
                        {request.adminNotes}
                      </div>
                    </div>
                  )}

                  {/* Actions for PENDING requests - Review Step */}
                  {request.status === 'pending' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <input
                        type="text"
                        placeholder="Admin notes (optional for approval, required for rejection)"
                        value={adminNotes[request._id] || ''}
                        onChange={(e) =>
                          setAdminNotes((prev) => ({ ...prev, [request._id]: e.target.value }))
                        }
                        style={{
                          padding: '10px 14px',
                          background: 'rgba(10, 10, 14, 0.7)',
                          border: '1px solid rgba(185, 145, 255, 0.12)',
                          borderRadius: '10px',
                          color: '#fff',
                          fontSize: '0.85rem',
                          width: '100%',
                          outline: 'none',
                          transition: 'border-color 0.2s ease',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '12px' }}>
                        {/* Approve Only - marks as approved, does NOT mint */}
                        <button
                          onClick={() => handleReview(request._id, 'approve')}
                          disabled={processing === request._id}
                          style={{
                            flex: 1,
                            padding: '12px 16px',
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.4)',
                            borderRadius: '10px',
                            color: '#93c5fd',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: processing === request._id ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            opacity: processing === request._id ? 0.6 : 1,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <HiOutlineCheck />
                          Approve Only
                        </button>

                        {/* Approve + Mint - approves AND mints on-chain in one step */}
                        <button
                          onClick={() => handleApproveAndMint(request._id)}
                          disabled={processing === request._id}
                          style={{
                            flex: 1,
                            padding: '12px 16px',
                            background:
                              'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(16, 185, 129, 0.15) 100%)',
                            border: '1px solid rgba(34, 197, 94, 0.4)',
                            borderRadius: '10px',
                            color: '#86efac',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: processing === request._id ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            opacity: processing === request._id ? 0.6 : 1,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <HiOutlineSparkles />
                          {processing === request._id ? 'Minting...' : 'Approve + Mint'}
                        </button>

                        {/* Reject */}
                        <button
                          onClick={() => handleReview(request._id, 'reject')}
                          disabled={processing === request._id}
                          style={{
                            flex: 1,
                            padding: '12px 16px',
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            borderRadius: '10px',
                            color: '#fca5a5',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: processing === request._id ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            opacity: processing === request._id ? 0.6 : 1,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <HiOutlineX />
                          Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions for APPROVED requests - Mint Step */}
                  {request.status === 'approved' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div
                        style={{
                          padding: '14px 18px',
                          background: 'rgba(34, 197, 94, 0.08)',
                          border: '1px solid rgba(34, 197, 94, 0.2)',
                          borderRadius: '12px',
                          fontSize: '0.85rem',
                          color: '#86efac',
                        }}
                      >
                        Approved by <strong>{shortenWallet(request.reviewedBy)}</strong> on{' '}
                        {request.reviewedAt ? formatDate(request.reviewedAt) : 'N/A'}. Ready to
                        mint.
                      </div>
                      {/* Transfer Destination Selector */}
                      <div
                        style={{
                          padding: '18px',
                          background: 'rgba(10, 10, 14, 0.7)',
                          border: '1px solid rgba(185, 145, 255, 0.15)',
                          borderRadius: '12px',
                          marginBottom: '12px',
                        }}
                      >
                        <div style={{ marginBottom: '12px' }}>
                          <span style={{ color: '#c8a1ff', fontSize: '0.85rem', fontWeight: 600 }}>
                            Transfer Destination
                          </span>
                          <p style={{ color: '#888', fontSize: '0.75rem', margin: '4px 0 0 0' }}>
                            Choose where to send the NFT after minting
                          </p>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '8px',
                            marginBottom: '12px',
                          }}
                        >
                          {/* Requester Option */}
                          <button
                            onClick={() =>
                              setTransferType((prev) => ({ ...prev, [request._id]: 'requester' }))
                            }
                            style={{
                              padding: '10px 12px',
                              background:
                                (transferType[request._id] || 'requester') === 'requester'
                                  ? 'rgba(34, 197, 94, 0.2)'
                                  : '#0a0a0c',
                              border: `1px solid ${(transferType[request._id] || 'requester') === 'requester' ? '#22c55e' : 'rgba(185, 145, 255, 0.1)'}`,
                              borderRadius: '6px',
                              color:
                                (transferType[request._id] || 'requester') === 'requester'
                                  ? '#22c55e'
                                  : '#aaa',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>Vendor (Requester)</div>
                            <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                              {shortenWallet(request.wallet)}
                              {isRequesterVerifiedVendor(request.wallet) && ' ✓'}
                            </div>
                          </button>

                          {/* Choose Vendor Option */}
                          <button
                            onClick={() =>
                              setTransferType((prev) => ({ ...prev, [request._id]: 'vendor' }))
                            }
                            style={{
                              padding: '10px 12px',
                              background:
                                transferType[request._id] === 'vendor'
                                  ? 'rgba(59, 130, 246, 0.2)'
                                  : '#0a0a0c',
                              border: `1px solid ${transferType[request._id] === 'vendor' ? '#3b82f6' : 'rgba(185, 145, 255, 0.1)'}`,
                              borderRadius: '6px',
                              color: transferType[request._id] === 'vendor' ? '#3b82f6' : '#aaa',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>Choose Vendor</div>
                            <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Select from list</div>
                          </button>

                          {/* Custom Address Option */}
                          <button
                            onClick={() =>
                              setTransferType((prev) => ({ ...prev, [request._id]: 'custom' }))
                            }
                            style={{
                              padding: '10px 12px',
                              background:
                                transferType[request._id] === 'custom'
                                  ? 'rgba(245, 158, 11, 0.2)'
                                  : '#0a0a0c',
                              border: `1px solid ${transferType[request._id] === 'custom' ? '#f59e0b' : 'rgba(185, 145, 255, 0.1)'}`,
                              borderRadius: '6px',
                              color: transferType[request._id] === 'custom' ? '#f59e0b' : '#aaa',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>Custom Address</div>
                            <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Enter wallet</div>
                          </button>

                          {/* Keep in Admin Wallet Option */}
                          <button
                            onClick={() =>
                              setTransferType((prev) => ({ ...prev, [request._id]: 'admin' }))
                            }
                            style={{
                              padding: '10px 12px',
                              background:
                                transferType[request._id] === 'admin'
                                  ? 'rgba(200, 161, 255, 0.2)'
                                  : '#0a0a0c',
                              border: `1px solid ${transferType[request._id] === 'admin' ? '#c8a1ff' : 'rgba(185, 145, 255, 0.1)'}`,
                              borderRadius: '6px',
                              color: transferType[request._id] === 'admin' ? '#c8a1ff' : '#aaa',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>Admin Wallet</div>
                            <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>No transfer</div>
                          </button>
                        </div>

                        {/* Vendor Dropdown (shown when "Choose Vendor" selected) */}
                        {transferType[request._id] === 'vendor' && (
                          <select
                            value={selectedVendor[request._id] || ''}
                            onChange={(e) =>
                              setSelectedVendor((prev) => ({
                                ...prev,
                                [request._id]: e.target.value,
                              }))
                            }
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              background: 'rgba(10, 10, 14, 0.7)',
                              border: '1px solid rgba(185, 145, 255, 0.15)',
                              borderRadius: '10px',
                              color: '#fff',
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="">Select a vendor...</option>
                            {verifiedVendors.map((v) => (
                              <option key={v.wallet} value={v.wallet}>
                                {v.name} ({shortenWallet(v.wallet)})
                              </option>
                            ))}
                          </select>
                        )}

                        {/* Custom Address Input (shown when "Custom Address" selected) */}
                        {transferType[request._id] === 'custom' && (
                          <input
                            type="text"
                            placeholder="Enter wallet address (e.g., BTeix...)"
                            value={customAddress[request._id] || ''}
                            onChange={(e) =>
                              setCustomAddress((prev) => ({
                                ...prev,
                                [request._id]: e.target.value,
                              }))
                            }
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              background: 'rgba(10, 10, 14, 0.7)',
                              border: '1px solid rgba(185, 145, 255, 0.15)',
                              borderRadius: '10px',
                              color: '#fff',
                              fontSize: '0.85rem',
                              fontFamily: 'monospace',
                            }}
                          />
                        )}
                      </div>

                      <button
                        onClick={() => handleMint(request._id, request)}
                        disabled={processing === request._id}
                        style={{
                          padding: '14px 20px',
                          background:
                            'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(16, 185, 129, 0.15) 100%)',
                          border: '1px solid rgba(34, 197, 94, 0.4)',
                          borderRadius: '12px',
                          color: '#86efac',
                          fontSize: '1rem',
                          fontWeight: 600,
                          cursor: processing === request._id ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          opacity: processing === request._id ? 0.6 : 1,
                          width: '100%',
                          transition: 'all 0.25s ease',
                        }}
                      >
                        <HiOutlineSparkles />
                        {processing === request._id ? 'Minting...' : 'Mint NFT'}
                        {squadsMembership?.isMember && (
                          <span
                            style={{
                              marginLeft: '8px',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.7rem',
                              background: 'rgba(255,255,255,0.2)',
                            }}
                          >
                            <HiOutlineShieldCheck style={{ verticalAlign: 'middle' }} /> Squads
                            Verified
                          </span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal?.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
          }}
          onClick={closeModal}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '440px',
              background: 'rgba(10, 10, 14, 0.85)',
              backdropFilter: 'blur(48px)',
              WebkitBackdropFilter: 'blur(48px)',
              border: '1px solid rgba(185, 145, 255, 0.2)',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(185, 145, 255, 0.08)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title */}
            <h3
              style={{
                margin: '0 0 8px 0',
                fontSize: '1.1rem',
                fontWeight: 700,
                color: '#fff',
                letterSpacing: '0.3px',
              }}
            >
              {confirmModal.title}
            </h3>

            {/* Subtitle / asset name */}
            <p
              style={{
                margin: '0 0 20px 0',
                fontSize: '0.85rem',
                color: 'rgba(255, 255, 255, 0.5)',
              }}
            >
              {confirmModal.message}
            </p>

            {/* Steps list */}
            {confirmModal.steps && (
              <div
                style={{
                  background: 'rgba(185, 145, 255, 0.04)',
                  border: '1px solid rgba(185, 145, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '20px',
                }}
              >
                {confirmModal.steps.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      marginBottom: i < confirmModal.steps!.length - 1 ? '10px' : 0,
                      fontSize: '0.85rem',
                      color: 'rgba(255, 255, 255, 0.7)',
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: 'rgba(185, 145, 255, 0.12)',
                        border: '1px solid rgba(185, 145, 255, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#c8a1ff',
                      }}
                    >
                      {i + 1}
                    </span>
                    {step}
                  </div>
                ))}
              </div>
            )}

            {/* Reject reason input */}
            {confirmModal.rejectReason && (
              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'rgba(255, 255, 255, 0.5)',
                    marginBottom: '6px',
                  }}
                >
                  Reason for rejection (required)
                </label>
                <textarea
                  value={rejectReasonInput}
                  onChange={(e) => setRejectReasonInput(e.target.value)}
                  placeholder="Explain why this request is being rejected..."
                  rows={3}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: '#0f0f12',
                    border: '1px solid rgba(185, 145, 255, 0.12)',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '0.85rem',
                    resize: 'vertical',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            )}

            {/* Wallet signing notice for mint actions */}
            {confirmModal.title.includes('Mint') && (
              <p
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '0.78rem',
                  color: 'rgba(200, 161, 255, 0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <HiOutlineShieldCheck style={{ flexShrink: 0 }} />
                Your wallet will be prompted to sign the transaction.
              </p>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={closeModal}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!confirmModal.requestId) return;
                  if (confirmModal.rejectReason) {
                    if (!rejectReasonInput.trim()) {
                      toast.error('Please provide a reason for rejection');
                      return;
                    }
                    executeReview(confirmModal.requestId, 'reject', rejectReasonInput.trim());
                  } else if (confirmModal.title === 'Approve + Mint NFT') {
                    executeApproveAndMint(confirmModal.requestId);
                  } else if (confirmModal.title === 'Mint NFT') {
                    executeMint(confirmModal.requestId);
                  } else {
                    executeReview(confirmModal.requestId, 'approve');
                  }
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: confirmModal.confirmColor,
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MintRequestsPanel;
