// src/components/admins/MintRequestsPanel.tsx
// Admin panel to review, approve, and mint vendor mint requests
// Two-step flow: Review (approve/reject) → Mint (for approved requests)
// Uses UMI with walletAdapterIdentity for client-side minting (matches createNFT.tsx)
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import {
  mplCore,
  create as createAsset,
  transfer,
  fetchAsset,
} from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import toast from 'react-hot-toast';
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

  // Step 1: Review (Approve without minting)
  const handleReview = async (requestId: string, action: 'approve' | 'reject') => {
    if (!wallet.publicKey) {
      toast.error('Please connect your wallet');
      return;
    }

    if (action === 'reject' && !adminNotes[requestId]) {
      const reason = prompt('Reason for rejection:');
      if (!reason) {
        toast.error('Please provide a reason for rejection');
        return;
      }
      setAdminNotes((prev) => ({ ...prev, [requestId]: reason }));
    }

    const confirmed = window.confirm(
      action === 'approve'
        ? 'Approve this mint request? After approval, any admin with minting permission can mint the NFT.'
        : 'Reject this mint request?'
    );

    if (!confirmed) return;

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
          adminNotes: adminNotes[requestId] || '',
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

    const confirmed = window.confirm(
      'Mint this NFT? This will:\n\n' +
        '1. Upload the image to permanent storage (Irys)\n' +
        '2. Mint the NFT with your wallet\n' +
        `3. ${transferDest ? 'Transfer to: ' + transferDest.slice(0, 8) + '...' : 'Keep in admin wallet'}\n` +
        '4. Auto-list on marketplace\n\n' +
        'Your wallet will be prompted to sign.'
    );

    if (!confirmed) {
      console.log('[MINT] ❌ User cancelled mint confirmation');
      return;
    }

    setProcessing(requestId);
    const toastId = toast.loading('Preparing metadata...');

    try {
      // Step 1: Prepare metadata (uploads image/metadata to storage)
      console.log('[MINT] Step 1: Calling prepare-mint API...');
      const prepareRes = await fetch('/api/admin/mint-requests/prepare-mint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify({ mintRequestId: requestId }),
      });

      const prepareData = await prepareRes.json();
      console.log('[MINT] Prepare response:', JSON.stringify(prepareData, null, 2));

      if (!prepareData.success) {
        console.error('[MINT] ❌ Prepare failed:', prepareData.error);
        toast.error(prepareData.error || 'Failed to prepare metadata', { id: toastId });
        return;
      }

      console.log('[MINT] ✅ Metadata prepared successfully');
      console.log('[MINT]   - Title:', prepareData.title);
      console.log('[MINT]   - Metadata URI:', prepareData.metadataUri);
      console.log('[MINT]   - Image URL:', prepareData.imageUrl);
      console.log('[MINT]   - Vendor Wallet:', prepareData.vendorWallet);

      toast.loading('Minting NFT with your wallet...', { id: toastId });

      // Step 2: Create UMI instance with wallet adapter (matching createNFT.tsx)
      console.log('[MINT] Step 2: Creating UMI instance...');
      console.log('[MINT]   - RPC:', connection.rpcEndpoint);
      const umi = createUmi(connection.rpcEndpoint)
        .use(walletAdapterIdentity(wallet))
        .use(mplCore());
      console.log('[MINT] ✅ UMI instance created');

      // Step 3: Generate asset signer and mint
      console.log('[MINT] Step 3: Generating asset signer...');
      const assetSigner = generateSigner(umi);
      const nftOwner = umi.identity.publicKey;
      console.log('[MINT]   - Asset Public Key:', assetSigner.publicKey.toString());
      console.log('[MINT]   - NFT Owner (admin):', nftOwner.toString());

      console.log('[MINT] Step 4: Calling createAsset on-chain...');
      console.log('[MINT]   - Name:', prepareData.title);
      console.log('[MINT]   - URI:', prepareData.metadataUri);

      // Send and confirm with finalized commitment for reliability
      const mintResult = await createAsset(umi, {
        asset: assetSigner,
        name: prepareData.title,
        uri: prepareData.metadataUri,
        owner: nftOwner,
      }).sendAndConfirm(umi, { confirm: { commitment: 'finalized' } });

      const mintAddress = assetSigner.publicKey.toString();
      console.log('[MINT] ✅ NFT MINTED SUCCESSFULLY!');
      console.log('[MINT]   - Mint Address:', mintAddress);
      console.log(
        '[MINT]   - Signature:',
        mintResult.signature
          ? Buffer.from(mintResult.signature).toString('base64').slice(0, 20) + '...'
          : 'N/A'
      );
      console.log(
        '[MINT]   - Explorer: https://explorer.solana.com/address/' +
          mintAddress +
          '?cluster=devnet'
      );

      // Transfer NFT to destination wallet (if specified)
      let transferSuccess = false;
      let actualTransferDest: string | null = null;
      let fetchedAsset = null;

      if (transferDest) {
        console.log('[MINT] Step 5: Transferring NFT to destination...');
        console.log('[MINT]   - From:', wallet.publicKey.toBase58());
        console.log('[MINT]   - To:', transferDest);
        toast.loading(`Transferring to ${transferDest.slice(0, 8)}...`, { id: toastId });

        // Retry fetching the asset with exponential backoff (devnet can be slow)
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            const waitTime = attempt * 2000; // 2s, 4s, 6s, 8s, 10s
            console.log(
              `[MINT]   - Attempt ${attempt}/5: Waiting ${waitTime / 1000}s before fetch...`
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));

            console.log(`[MINT]   - Attempt ${attempt}/5: Fetching asset from chain...`);
            fetchedAsset = await fetchAsset(umi, umiPublicKey(mintAddress));
            console.log(`[MINT]   - ✅ Asset found on attempt ${attempt}!`);
            console.log(`[MINT]   - Asset owner:`, fetchedAsset.owner?.toString());
            break;
          } catch (fetchErr: any) {
            console.log(`[MINT]   - ❌ Attempt ${attempt}/5 failed:`, fetchErr.message || fetchErr);
            if (attempt === 5) {
              console.log('[MINT]   - All fetch attempts exhausted');
            }
          }
        }

        if (fetchedAsset) {
          try {
            console.log('[MINT]   - Initiating transfer...');
            await transfer(umi, {
              asset: fetchedAsset,
              newOwner: umiPublicKey(transferDest),
            }).sendAndConfirm(umi, { confirm: { commitment: 'finalized' } });
            transferSuccess = true;
            actualTransferDest = transferDest;
            console.log('[MINT] ✅ NFT transferred to:', transferDest);
          } catch (transferErr: any) {
            console.error(
              '[MINT] ❌ Transfer transaction failed:',
              transferErr.message || transferErr
            );
          }
        } else {
          console.log('[MINT] ⚠️ Could not fetch asset after 5 attempts - NFT stays with admin');
          console.log('[MINT]   - NFT can be transferred manually later');
        }
      } else {
        console.log('[MINT] Step 5: Skipping transfer - NFT stays in admin wallet');
        transferSuccess = true; // Consider "no transfer needed" as success
      }

      toast.loading('Creating marketplace listing...', { id: toastId });

      // Step 6: Record the mint in the database
      console.log('[MINT] Step 6: Calling confirm-mint API...');
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
          transferToVendor: transferSuccess && !!actualTransferDest,
          transferDestination: actualTransferDest || wallet.publicKey.toBase58(),
          transferDestinationType: transferTypeSelected,
          transferSuccess,
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
              href={`https://explorer.solana.com/address/${mintAddress}?cluster=devnet`}
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

    const confirmed = window.confirm(
      'Approve and mint this NFT? This will:\n\n' +
        '1. Approve the mint request\n' +
        '2. Upload image to permanent storage\n' +
        '3. Mint the NFT with your wallet\n\n' +
        'Your wallet will be prompted to sign.'
    );

    if (!confirmed) return;

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

      toast.loading('Preparing metadata...', { id: toastId });

      // Step 2: Prepare metadata (upload image/metadata)
      const prepareRes = await fetch('/api/admin/mint-requests/prepare-mint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify({ mintRequestId: requestId }),
      });

      const prepareData = await prepareRes.json();

      if (!prepareData.success) {
        toast.error(prepareData.error || 'Failed to prepare metadata', { id: toastId });
        return;
      }

      toast.loading('Minting NFT with your wallet...', { id: toastId });

      // Step 3: Create UMI and mint (matching createNFT.tsx pattern)
      const umi = createUmi(connection.rpcEndpoint)
        .use(walletAdapterIdentity(wallet))
        .use(mplCore());

      const assetSigner = generateSigner(umi);
      const nftOwner = umi.identity.publicKey;

      console.log('[MINT] Approve & Mint:', prepareData.title);

      await createAsset(umi, {
        asset: assetSigner,
        name: prepareData.title,
        uri: prepareData.metadataUri,
        owner: nftOwner,
      }).sendAndConfirm(umi, { confirm: { commitment: 'finalized' } });

      const mintAddress = assetSigner.publicKey.toString();
      console.log('[MINT] Success! Mint address:', mintAddress);

      // Transfer NFT to vendor wallet with retry logic
      toast.loading('Transferring to vendor...', { id: toastId });
      let transferSuccess = false;
      let fetchedAsset = null;

      // Retry fetching the asset with exponential backoff
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const waitTime = attempt * 2000; // 2s, 4s, 6s, 8s, 10s
          console.log(`[MINT] Attempt ${attempt}/5: Waiting ${waitTime / 1000}s before fetch...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          fetchedAsset = await fetchAsset(umi, umiPublicKey(mintAddress));
          console.log(`[MINT] Asset found on attempt ${attempt}!`);
          break;
        } catch (fetchErr: any) {
          console.log(`[MINT] Attempt ${attempt}/5 failed:`, fetchErr.message);
        }
      }

      // For Approve & Mint, default to transferring to the requester (vendor)
      const transferDest = prepareData.vendorWallet;
      let actualTransferDest: string | null = null;

      if (fetchedAsset && transferDest) {
        try {
          await transfer(umi, {
            asset: fetchedAsset,
            newOwner: umiPublicKey(transferDest),
          }).sendAndConfirm(umi, { confirm: { commitment: 'finalized' } });
          transferSuccess = true;
          actualTransferDest = transferDest;
          console.log('[MINT] Transferred to vendor:', transferDest);
        } catch (transferErr: any) {
          console.error('[MINT] Transfer transaction failed:', transferErr.message);
        }
      } else {
        console.log('[MINT] Could not fetch asset after 5 attempts - will transfer manually');
      }

      toast.loading('Creating marketplace listing...', { id: toastId });

      // Step 4: Confirm in database
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
          transferToVendor: transferSuccess && !!actualTransferDest,
          transferDestination: actualTransferDest || wallet.publicKey.toBase58(),
          transferDestinationType: 'requester', // Default for quick mint
          transferSuccess,
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
            <span style={{ fontSize: '0.75rem', color: '#666' }}>Checking Squads...</span>
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
          marginBottom: '16px',
          borderBottom: '1px solid #222',
          paddingBottom: '8px',
          flexWrap: 'wrap',
        }}
      >
        {(['pending', 'approved', 'minted', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 16px',
              background: filter === f ? 'rgba(200, 161, 255, 0.1)' : 'transparent',
              border: '1px solid',
              borderColor: filter === f ? '#c8a1ff' : '#333',
              borderRadius: '6px',
              color: filter === f ? '#c8a1ff' : '#a1a1a1',
              cursor: 'pointer',
              fontSize: '0.875rem',
              textTransform: 'capitalize',
              transition: 'all 0.2s',
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
            padding: '12px 16px',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '0.85rem',
            color: '#93c5fd',
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
        <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1a1' }}>
          <HiOutlineCube style={{ fontSize: '2rem', marginBottom: '8px' }} />
          <p>No {filter !== 'all' ? filter : ''} mint requests found</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {requests.map((request) => (
            <div
              key={request._id}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid #222',
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            >
              {/* Request Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedId(expandedId === request._id ? null : request._id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {/* Image Preview */}
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '8px',
                      background: '#1a1a1a',
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
                      <HiOutlinePhotograph style={{ fontSize: '1.5rem', color: '#666' }} />
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
                    <HiOutlineChevronUp style={{ color: '#666' }} />
                  ) : (
                    <HiOutlineChevronDown style={{ color: '#666' }} />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === request._id && (
                <div
                  style={{
                    padding: '16px',
                    borderTop: '1px solid #222',
                    background: 'rgba(0, 0, 0, 0.2)',
                  }}
                >
                  {/* Large Image Preview */}
                  {getDisplayImageUrl(request.imageUrl) && (
                    <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                      <img
                        src={getDisplayImageUrl(request.imageUrl)!}
                        alt={request.title}
                        style={{
                          maxWidth: '300px',
                          maxHeight: '300px',
                          borderRadius: '12px',
                          border: '1px solid #333',
                          objectFit: 'contain',
                        }}
                      />
                      <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '8px' }}>
                        Image will be uploaded to Irys (permanent storage) on mint
                      </div>
                    </div>
                  )}

                  {/* Details Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: '12px',
                      marginBottom: '16px',
                    }}
                  >
                    <div>
                      <span style={{ color: '#666', fontSize: '0.75rem' }}>Vendor Wallet</span>
                      <div style={{ color: '#fff', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                        {shortenWallet(request.wallet)}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#666', fontSize: '0.75rem' }}>Submitted</span>
                      <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                        {formatDate(request.createdAt)}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#666', fontSize: '0.75rem' }}>Reference #</span>
                      <div style={{ color: '#c8a1ff', fontSize: '0.85rem', fontWeight: 600 }}>
                        {request.referenceNumber}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#666', fontSize: '0.75rem' }}>Price</span>
                      <div style={{ color: '#22c55e', fontSize: '0.85rem', fontWeight: 600 }}>
                        ${request.priceUSD?.toLocaleString()}
                      </div>
                    </div>

                    {/* All Specifications */}
                    {request.material && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Material</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>{request.material}</div>
                      </div>
                    )}
                    {request.movement && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Movement</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>{request.movement}</div>
                      </div>
                    )}
                    {request.caseSize && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Case Size</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>{request.caseSize}</div>
                      </div>
                    )}
                    {request.dialColor && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Dial Color</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                          {request.dialColor}
                        </div>
                      </div>
                    )}
                    {request.waterResistance && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Water Resistance</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                          {request.waterResistance}
                        </div>
                      </div>
                    )}
                    {request.condition && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Condition</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                          {request.condition}
                        </div>
                      </div>
                    )}
                    {request.productionYear && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Production Year</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                          {request.productionYear}
                        </div>
                      </div>
                    )}
                    {request.boxPapers && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Box & Papers</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                          {request.boxPapers}
                        </div>
                      </div>
                    )}
                    {request.country && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Country</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>{request.country}</div>
                      </div>
                    )}

                    {/* Audit Trail */}
                    {request.reviewedBy && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Reviewed By</span>
                        <div
                          style={{ color: '#3b82f6', fontSize: '0.85rem', fontFamily: 'monospace' }}
                        >
                          {shortenWallet(request.reviewedBy)}
                        </div>
                      </div>
                    )}
                    {request.reviewedAt && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Reviewed At</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                          {formatDate(request.reviewedAt)}
                        </div>
                      </div>
                    )}
                    {request.mintedBy && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Minted By</span>
                        <div
                          style={{ color: '#22c55e', fontSize: '0.85rem', fontFamily: 'monospace' }}
                        >
                          {shortenWallet(request.mintedBy)}
                        </div>
                      </div>
                    )}
                    {request.mintedAt && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Minted At</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                          {formatDate(request.mintedAt)}
                        </div>
                      </div>
                    )}

                    {/* Mint Address */}
                    {request.mintAddress && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Mint Address</span>
                        <div
                          style={{ color: '#22c55e', fontSize: '0.85rem', fontFamily: 'monospace' }}
                        >
                          {request.mintAddress?.slice(0, 8)}...
                          <a
                            href={`https://explorer.solana.com/address/${request.mintAddress}?cluster=devnet`}
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

                  {/* Description */}
                  {request.description && (
                    <div style={{ marginBottom: '16px' }}>
                      <span style={{ color: '#666', fontSize: '0.75rem' }}>Description</span>
                      <div
                        style={{
                          color: '#fff',
                          fontSize: '0.85rem',
                          background: 'rgba(255,255,255,0.02)',
                          padding: '12px',
                          borderRadius: '8px',
                          border: '1px solid #222',
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
                      <span style={{ color: '#666', fontSize: '0.75rem' }}>Admin Notes</span>
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
                          padding: '10px 12px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '0.875rem',
                          width: '100%',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '12px' }}>
                        {/* Approve Only (Review Step) */}
                        <button
                          onClick={() => handleReview(request._id, 'approve')}
                          disabled={processing === request._id}
                          style={{
                            flex: 1,
                            padding: '12px 16px',
                            background: '#3b82f6',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            cursor: processing === request._id ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            opacity: processing === request._id ? 0.6 : 1,
                          }}
                        >
                          <HiOutlineCheck />
                          Approve
                        </button>

                        {/* Approve & Mint in One Step (Legacy/Quick) */}
                        <button
                          onClick={() => handleApproveAndMint(request._id)}
                          disabled={processing === request._id}
                          style={{
                            flex: 1,
                            padding: '12px 16px',
                            background: '#22c55e',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            cursor: processing === request._id ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            opacity: processing === request._id ? 0.6 : 1,
                          }}
                        >
                          <HiOutlineSparkles />
                          {processing === request._id ? 'Minting...' : 'Approve & Mint'}
                        </button>

                        {/* Reject */}
                        <button
                          onClick={() => handleReview(request._id, 'reject')}
                          disabled={processing === request._id}
                          style={{
                            flex: 1,
                            padding: '12px 16px',
                            background: '#ef4444',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            cursor: processing === request._id ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            opacity: processing === request._id ? 0.6 : 1,
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
                          padding: '12px 16px',
                          background: 'rgba(59, 130, 246, 0.1)',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                          borderRadius: '8px',
                          fontSize: '0.85rem',
                          color: '#93c5fd',
                        }}
                      >
                        Approved by <strong>{shortenWallet(request.reviewedBy)}</strong> on{' '}
                        {request.reviewedAt ? formatDate(request.reviewedAt) : 'N/A'}. Ready to
                        mint.
                      </div>
                      {/* Transfer Destination Selector */}
                      <div
                        style={{
                          padding: '16px',
                          background: 'rgba(200, 161, 255, 0.05)',
                          border: '1px solid rgba(200, 161, 255, 0.2)',
                          borderRadius: '8px',
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
                                  : 'rgba(255, 255, 255, 0.05)',
                              border: `1px solid ${(transferType[request._id] || 'requester') === 'requester' ? '#22c55e' : '#333'}`,
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
                                  : 'rgba(255, 255, 255, 0.05)',
                              border: `1px solid ${transferType[request._id] === 'vendor' ? '#3b82f6' : '#333'}`,
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
                                  : 'rgba(255, 255, 255, 0.05)',
                              border: `1px solid ${transferType[request._id] === 'custom' ? '#f59e0b' : '#333'}`,
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
                                  : 'rgba(255, 255, 255, 0.05)',
                              border: `1px solid ${transferType[request._id] === 'admin' ? '#c8a1ff' : '#333'}`,
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
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid #333',
                              borderRadius: '6px',
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
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid #333',
                              borderRadius: '6px',
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
                          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                          border: 'none',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '1rem',
                          fontWeight: 600,
                          cursor: processing === request._id ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          opacity: processing === request._id ? 0.6 : 1,
                          width: '100%',
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
    </div>
  );
};

export default MintRequestsPanel;
