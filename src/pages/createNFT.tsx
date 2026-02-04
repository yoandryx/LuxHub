// src/pages/createNFT.tsx
import { useState, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplCore, transfer, fetchAsset } from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import { create as createAsset, update as updateAsset } from '@metaplex-foundation/mpl-core';
import { createMetadata } from '../utils/metadata';

// Upload metadata via server-side API (supports Irys/Pinata based on config)
async function uploadMetadataViaApi(metadata: object, name: string): Promise<string> {
  const response = await fetch('/api/storage/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'metadata',
      data: metadata,
      name,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload metadata');
  }

  const result = await response.json();
  console.log('[UPLOAD] Storage result:', result);
  return result.url;
}
import { NftDetailCard } from '../components/marketplace/NftDetailCard';
import { NftForm } from '../components/admins/NftForm';
import styles from '../styles/CreateNFT.module.css';
import NFTPreviewCard from '../components/admins/NFTPreviewCard';
import UnifiedNFTCard, { NFTGridCard } from '../components/common/UnifiedNFTCard';
import type { NFTStatus } from '../components/common/UnifiedNFTCard';
import {
  FaCopy,
  FaExchangeAlt,
  FaLock,
  FaUpload,
  FaCheck,
  FaTimes,
  FaEye,
  FaEdit,
  FaLayerGroup,
  FaMagic,
  FaSpinner,
  FaClock,
  FaSync,
} from 'react-icons/fa';
import { HiOutlineSparkles, HiOutlineCollection, HiOutlineSwitchHorizontal } from 'react-icons/hi';
import pLimit from 'p-limit';
import useSWR, { mutate } from 'swr';

// SWR fetcher
const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Extended MintedNFT interface
interface MintedNFT {
  title: string;
  description: string;
  image: string;
  priceSol: number;
  metadataUri: string;
  mintAddress: string | null;
  currentOwner: string | null;
  mintedBy: string | null; // Admin wallet who originally minted this NFT
  ipfs_pin_hash: string | null;
  marketStatus: string | null;
  updatedAt: string | null;
  assetId: string | null;
  escrowPda: string | null;
}

// CSV Row interface for bulk minting (USD-first approach)
// Includes ALL form fields for minting
interface CsvRow {
  // Required fields
  title: string;
  brand: string;
  model: string;
  referenceNumber: string; // Can include letters and numbers (e.g., "116595RBOW-2024")
  priceUSD: string; // USD as source of truth (numeric)

  // Optional fields - image (at least one recommended)
  imageCid?: string;
  imageUrl?: string;

  // Optional fields - details
  description?: string;
  material?: string;
  productionYear?: string; // numeric (year)
  movement?: string;
  caseSize?: string;
  waterResistance?: string;
  dialColor?: string;
  country?: string;
  condition?: string;
  boxPapers?: string;
  limitedEdition?: string;
  certificate?: string;
  warrantyInfo?: string;
  features?: string;
  releaseDate?: string;

  // Legacy support
  priceSol?: string; // Will be converted to USD if priceUSD not present
  serialNumber?: string; // Legacy - maps to referenceNumber

  [key: string]: string | undefined;
}

// Validation result for a single CSV row
interface CsvValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Required fields for CSV validation
const CSV_REQUIRED_FIELDS = ['title', 'brand', 'model', 'referenceNumber', 'priceUSD'] as const;

// Numeric fields that should only contain numbers (and optionally decimal point)
const CSV_NUMERIC_FIELDS = ['priceUSD', 'priceSol', 'productionYear'] as const;

// Bulk mint result tracking
interface BulkMintResult {
  row: number;
  title: string;
  status: 'pending' | 'minting' | 'success' | 'error';
  mintAddress?: string;
  error?: string;
}

const fallbackGateway = 'https://gateway.pinata.cloud/ipfs/';
const irysGateway = 'https://gateway.irys.xyz/';

/**
 * Resolve a storage ID to a full gateway URL
 * Handles IPFS hashes (Qm..., bafy...) and Irys/Arweave TX IDs
 */
function resolveImageUrl(idOrUrl: string | undefined | null, gateway: string): string {
  if (!idOrUrl) return '/fallback.png';

  // Already a full URL
  if (idOrUrl.startsWith('http://') || idOrUrl.startsWith('https://')) {
    return idOrUrl;
  }

  // Local path (like /fallback.png)
  if (idOrUrl.startsWith('/')) {
    return idOrUrl;
  }

  // IPFS CIDv0 (starts with Qm, 46 chars) or CIDv1 (starts with bafy)
  if (idOrUrl.startsWith('Qm') || idOrUrl.startsWith('bafy')) {
    return `${gateway}${idOrUrl}`;
  }

  // Irys/Arweave transaction ID (43-char base64url, doesn't start with IPFS prefixes)
  // These are typically alphanumeric with - and _
  if (idOrUrl.length === 43 && /^[A-Za-z0-9_-]+$/.test(idOrUrl)) {
    return `${irysGateway}${idOrUrl}`;
  }

  // Default to IPFS gateway for unknown formats
  return `${gateway}${idOrUrl}`;
}

type Props = {
  initialMintedNFTs: MintedNFT[];
  initialSolPrice: number;
};

const CreateNFT = ({ initialMintedNFTs, initialSolPrice }: Props) => {
  const wallet = useWallet();
  const adminWallet = wallet.publicKey?.toBase58() || '';

  // Form state
  const [features, setFeatures] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'mint' | 'minted' | 'transferred'>('mint');
  const [mintMode, setMintMode] = useState<'single' | 'bulk'>('single');
  const [fileCid, setFileCid] = useState('');
  const [imageUri, setImageUri] = useState(''); // Full URL (Irys or IPFS gateway)
  const [priceSol, setPriceSol] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [material, setMaterial] = useState('');
  const [productionYear, setProductionYear] = useState('');
  const [limitedEdition, setLimitedEdition] = useState('');
  const [certificate, setCertificate] = useState('');
  const [warrantyInfo, setWarrantyInfo] = useState('');
  const [provenance, setProvenance] = useState(adminWallet);
  const [marketStatus, setMarketStatus] = useState('pending');
  const [movement, setMovement] = useState('');
  const [caseSize, setCaseSize] = useState('');
  const [waterResistance, setWaterResistance] = useState('');
  const [dialColor, setDialColor] = useState('');
  const [country, setCountry] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [boxPapers, setBoxPapers] = useState('');
  const [condition, setCondition] = useState('');

  // Minting state
  const [minting, setMinting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [mintedNFTs, setMintedNFTs] = useState<MintedNFT[]>(initialMintedNFTs);

  // UI state
  const [selectedMetadataUri, setSelectedMetadataUri] = useState<string | null>(null);
  const [transferInputs, setTransferInputs] = useState<{ [key: string]: string }>({});
  const [transferringNfts, setTransferringNfts] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editingNft, setEditingNft] = useState<MintedNFT | null>(null);
  const [poolEligible, setPoolEligible] = useState(true); // All NFTs are pool eligible by default
  const [currentVendorId, setCurrentVendorId] = useState<string | undefined>(undefined);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  // Bulk minting state
  const [bulkCsvFile, setBulkCsvFile] = useState<File | null>(null);
  const [bulkMintResults, setBulkMintResults] = useState<BulkMintResult[]>([]);
  const [isBulkMinting, setIsBulkMinting] = useState(false);
  const [parsedCsvRows, setParsedCsvRows] = useState<CsvRow[]>([]);
  const [selectedBulkNftIndex, setSelectedBulkNftIndex] = useState<number | null>(null);

  // Escrow creation state
  const [creatingEscrow, setCreatingEscrow] = useState<string | null>(null);
  const [escrowPrice, setEscrowPrice] = useState<{ [key: string]: string }>({});

  // Ownership sync state
  const [isSyncing, setIsSyncing] = useState(false);

  // Vendor transfer state
  const [selectedVendorTransfer, setSelectedVendorTransfer] = useState<{
    [mintAddress: string]: string;
  }>({});

  // Custom wallet transfer state (for manual address entry)
  const [customWalletInputs, setCustomWalletInputs] = useState<{
    [mintAddress: string]: string;
  }>({});
  const [showCustomInput, setShowCustomInput] = useState<{
    [mintAddress: string]: boolean;
  }>({});

  // Selection mode for bulk transfers
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNfts, setSelectedNfts] = useState<Set<string>>(new Set());
  const [bulkTransferTarget, setBulkTransferTarget] = useState<string>('');
  const [showBulkCustomInput, setShowBulkCustomInput] = useState(false);
  const [bulkCustomWallet, setBulkCustomWallet] = useState<string>('');

  // Toggle NFT selection
  const toggleNftSelection = (mintAddress: string) => {
    setSelectedNfts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(mintAddress)) {
        newSet.delete(mintAddress);
      } else {
        newSet.add(mintAddress);
      }
      return newSet;
    });
  };

  // Select all NFTs
  const selectAllNfts = () => {
    const allMints = ownedNfts.map((n) => n.mintAddress).filter(Boolean) as string[];
    setSelectedNfts(new Set(allMints));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedNfts(new Set());
    setSelectionMode(false);
  };

  // Bulk transfer selected NFTs
  const bulkTransferNfts = async (targetWallet: string) => {
    if (!targetWallet || selectedNfts.size === 0) return;

    const confirmed = window.confirm(
      `Transfer ${selectedNfts.size} NFT(s) to ${getRecipientName(targetWallet)}?\n\nAddress: ${targetWallet.slice(0, 8)}...${targetWallet.slice(-8)}`
    );

    if (!confirmed) return;

    // Find vendor ID if this wallet belongs to an approved vendor
    const vendor = approvedVendors.find(
      (v: { wallet?: string; walletAddress?: string }) =>
        (v.wallet || v.walletAddress) === targetWallet
    );
    const vendorId = vendor?._id;

    // Transfer each selected NFT
    for (const mintAddress of selectedNfts) {
      await transferNft(mintAddress, targetWallet, vendorId);
    }

    clearSelection();
  };

  // AI Analysis state
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // AI Verification state
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    confidence: number;
    authenticityScore: number;
    authenticityFlags: string[];
    listingApproved: boolean;
    recommendedActions: string[];
  } | null>(null);
  const [verificationWarnings, setVerificationWarnings] = useState<string[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [skipVerification, setSkipVerification] = useState(false);

  // Use SWR for SOL price
  const { data: solPriceData } = useSWR('/api/users/sol-price', fetcher, {
    refreshInterval: 60000,
    fallbackData: { price: initialSolPrice },
  });
  const solPrice = solPriceData?.price || initialSolPrice;

  // Fetch vault config for authenticated mints
  const { data: vaultConfigData } = useSWR('/api/vault/config', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300000, // Cache for 5 minutes
  });
  const vaultConfig = vaultConfigData?.data?.config;
  const luxhubVendor = vaultConfigData?.data?.luxhubVendor;

  // Fetch approved vendors for transfer dropdown
  const { data: vendorsData } = useSWR('/api/vendor/vendorList', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300000, // Cache for 5 minutes
  });
  const approvedVendors = vendorsData?.vendors || [];

  // Memoize gateway URL
  const gateway = useMemo(() => process.env.NEXT_PUBLIC_GATEWAY_URL || fallbackGateway, []);

  // Handlers
  const handleTransferInputChange = useCallback((key: string, value: string) => {
    setTransferInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleEscrowPriceChange = useCallback((key: string, value: string) => {
    setEscrowPrice((prev) => ({ ...prev, [key]: value }));
  }, []);

  const isValidSolanaAddress = useCallback((address: string): boolean => {
    try {
      const pubkey = new PublicKey(address);
      return PublicKey.isOnCurve(pubkey);
    } catch {
      return false;
    }
  }, []);

  const handleCopy = useCallback((label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1000);
  }, []);

  // Create UMI instance (memoized)
  const getUmi = useCallback(() => {
    return createUmi(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com')
      .use(walletAdapterIdentity(wallet))
      .use(mplCore());
  }, [wallet]);

  // AI Verification function
  const verifyListing = async (): Promise<boolean> => {
    if (skipVerification || !fileCid) return true;

    setIsVerifying(true);
    setVerificationResult(null);
    setVerificationWarnings([]);

    try {
      const imageUrl = `${gateway}${fileCid}`;
      const response = await fetch('/api/ai/verify-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          category: 'watches', // Default to watches, could be made dynamic
          vendorClaims: {
            brand: brand || 'Unknown',
            model: model || undefined,
            condition: condition || 'Good',
            estimatedValue: priceSol * solPrice,
          },
        }),
      });

      if (!response.ok) {
        console.warn('Verification API failed, proceeding without verification');
        return true;
      }

      const result = await response.json();
      setVerificationResult(result);

      if (!result.listingApproved) {
        setVerificationWarnings([...result.authenticityFlags, ...result.recommendedActions]);
      }

      // Return true to proceed - vendor sets their price, their asset
      return true;
    } catch (error) {
      console.warn('Verification failed, proceeding:', error);
      return true;
    } finally {
      setIsVerifying(false);
    }
  };

  // Main mint function
  const mintNFT = async () => {
    console.log('[MINT] ========== SINGLE MINT STARTED ==========');
    console.log('[MINT] Timestamp:', new Date().toISOString());
    console.log('[MINT] Wallet connected:', !!wallet.publicKey);
    console.log('[MINT] Wallet address:', wallet.publicKey?.toBase58() || 'N/A');

    if (!wallet.publicKey) return alert('Connect wallet');
    if (!fileCid) {
      console.log('[MINT] ERROR: No image CID provided');
      return alert('Please upload an image first');
    }
    if (!title) {
      console.log('[MINT] ERROR: No title provided');
      return alert('Please enter a title');
    }

    console.log('[MINT] Input validation passed');
    console.log('[MINT] Form data:', {
      title,
      brand,
      model,
      serialNumber,
      priceSol,
      fileCid,
      marketStatus,
      poolEligible,
      vendorId: currentVendorId,
    });

    setMinting(true);
    setProgress(0);
    setStatusMessage('Preparing to mint...');

    try {
      console.log('[MINT] Creating UMI instance...');
      const umi = getUmi();
      console.log('[MINT] UMI instance created');

      // Run AI verification (non-blocking - vendor proceeds regardless)
      setProgress(5);
      setStatusMessage('Running AI verification...');
      console.log('[MINT] Starting AI verification...');
      await verifyListing();
      console.log('[MINT] AI verification completed');

      // Create metadata JSON with LuxHub verification
      setProgress(15);
      setStatusMessage('Creating metadata...');
      console.log('[MINT] Creating metadata JSON...');

      // Note: NFTs always stay with the minter initially, then can be transferred to vendor/vault
      // Vault verification metadata is still included for LuxHub-authenticated mints
      const isVaultMint = false; // Disabled auto-transfer - minter keeps NFT
      const hasVaultConfig = Boolean(vaultConfig?.vaultPda);
      console.log('[MINT] Has vault config:', hasVaultConfig, '(auto-transfer disabled)');

      const metadataJson = createMetadata(
        title,
        description,
        fileCid,
        wallet.publicKey.toBase58(),
        brand,
        model,
        serialNumber,
        material,
        productionYear,
        limitedEdition,
        certificate,
        warrantyInfo,
        provenance,
        movement,
        caseSize,
        waterResistance,
        dialColor,
        country,
        releaseDate,
        wallet.publicKey.toBase58(),
        marketStatus,
        priceSol,
        boxPapers,
        condition,
        undefined, // serviceHistory
        undefined, // features
        imageUri, // Full image URL (Irys or IPFS)
        // LuxHub verification data for authenticated admin mints
        hasVaultConfig
          ? {
              isVaultMint: true, // Marks as LuxHub verified even if not auto-transferred
              vaultAddress: vaultConfig?.vaultPda,
              mintedBy: wallet.publicKey.toBase58(),
              collectionName: 'LuxHub Verified Timepieces',
            }
          : undefined
      );
      console.log(
        '[MINT] Metadata JSON created:',
        JSON.stringify(metadataJson, null, 2).slice(0, 500) + '...'
      );
      console.log('[MINT] LuxHub verification included:', !!metadataJson.luxhub_verification);

      // Upload metadata via server-side API (Irys/Pinata based on config)
      setProgress(30);
      setStatusMessage('Uploading metadata to storage...');
      console.log('[MINT] Uploading metadata via API...');

      const metadataUri = await uploadMetadataViaApi(metadataJson, title);

      console.log('[MINT] Metadata uploaded successfully');
      console.log('[MINT] Metadata URI:', metadataUri);
      setProgress(55);

      // Mint on-chain
      setStatusMessage('Minting Core NFT on Solana...');
      console.log('[MINT] Generating asset signer...');
      const assetSigner = generateSigner(umi);
      console.log('[MINT] Asset signer public key:', assetSigner.publicKey.toString());

      // NFT owner is always the minter - transfer to vault/vendor happens manually after
      const nftOwner = umi.identity.publicKey;
      console.log('[MINT] NFT Owner: Admin Wallet (minter)', wallet.publicKey.toBase58());
      console.log('[MINT] Sending createAsset transaction...');

      const txStartTime = Date.now();
      await createAsset(umi, {
        asset: assetSigner,
        name: title,
        uri: metadataUri,
        owner: nftOwner, // Set owner to vault PDA for vault mints
      }).sendAndConfirm(umi);
      const txDuration = Date.now() - txStartTime;

      const mintAddress = assetSigner.publicKey.toString();
      console.log('[MINT] On-chain mint successful!');
      console.log('[MINT] Mint address:', mintAddress);
      console.log('[MINT] Transaction duration:', txDuration, 'ms');
      setProgress(85);

      // Save to database
      setStatusMessage('Saving to database...');
      console.log('[MINT] Preparing database save...');
      // Use full imageUri if available, otherwise resolve from fileCid
      const newImage = imageUri || resolveImageUrl(fileCid, gateway);

      // NFT owner is always the minter initially
      const actualOwner = wallet.publicKey.toBase58();

      // Optimistic update
      const newNft: MintedNFT = {
        title,
        description,
        image: newImage,
        priceSol,
        metadataUri,
        mintAddress,
        currentOwner: actualOwner,
        mintedBy: wallet.publicKey.toBase58(), // Track who minted this NFT
        ipfs_pin_hash: fileCid,
        marketStatus,
        updatedAt: new Date().toISOString(),
        assetId: null,
        escrowPda: null,
      };
      console.log('[MINT] Optimistic update - adding NFT to local state');
      setMintedNFTs((prev) => [...prev, newNft]);

      // Save to MongoDB with AI verification data
      console.log('[MINT] Sending POST to /api/assets/create...');

      // Determine vendor ID: use selected vendor, or LuxHub official vendor for vault mints
      const vendorId =
        currentVendorId || (isVaultMint && luxhubVendor?.id ? luxhubVendor.id : undefined);
      console.log('[MINT] Vendor ID:', vendorId, '(LuxHub vault:', isVaultMint, ')');

      // Store full image URL for display, ID for reference
      const fullImageUrl = imageUri || (fileCid ? resolveImageUrl(fileCid, gateway) : '');

      const dbPayload = {
        ...(vendorId && { vendor: vendorId }),
        model,
        serial: serialNumber,
        description,
        priceUSD: priceSol * solPrice,
        images: fullImageUrl ? [fullImageUrl] : [], // Full URL for direct display
        imageIpfsUrls: fileCid ? [fileCid] : [], // ID/CID for reference
        metadataIpfsUrl: metadataUri,
        nftMint: mintAddress,
        nftOwnerWallet: actualOwner,
        mintedBy: wallet.publicKey.toBase58(), // Track original minter
        status: marketStatus,
        poolEligible,
        category: 'watches',
        // Store metadata attributes for display
        metaplexMetadata: {
          creator: wallet.publicKey.toBase58(),
          attributes: {
            brand,
            material,
            productionYear,
            movement,
            caseSize,
            dialColor,
            waterResistance,
            condition,
            boxPapers,
            country,
            limitedEdition,
            certificate,
            warrantyInfo,
            features,
            releaseDate,
          },
        },
        ...(verificationResult && {
          aiVerification: {
            verified: verificationResult.listingApproved,
            confidence: verificationResult.confidence,
            verifiedAt: new Date().toISOString(),
            flags: verificationResult.authenticityFlags,
            authenticityScore: verificationResult.authenticityScore,
            recommendedActions: verificationResult.recommendedActions,
            listingApproved: verificationResult.listingApproved,
          },
        }),
      };
      console.log('[MINT] DB payload:', JSON.stringify(dbPayload, null, 2));

      const response = await fetch('/api/assets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbPayload),
      });

      console.log('[MINT] DB response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[MINT] DB save failed:', errorData);
        throw new Error(errorData.error || 'DB save failed');
      }

      const { asset } = await response.json();
      console.log('[MINT] Asset saved to DB with ID:', asset._id);

      // Update with asset ID
      setMintedNFTs((prev) =>
        prev.map((n) => (n.mintAddress === mintAddress ? { ...n, assetId: asset._id } : n))
      );

      // Record in vault inventory if this is a vault mint
      if (isVaultMint) {
        console.log('[MINT] Recording in vault inventory...');
        try {
          const vaultResponse = await fetch('/api/vault/mint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nftMint: mintAddress,
              name: title,
              description,
              imageUrl: imageUri || `${gateway}${fileCid}`,
              metadataUri,
              mintSignature: mintAddress, // Using mint address as signature reference
              assetId: asset._id,
              tags: ['timepiece', brand.toLowerCase()].filter(Boolean),
              notes: `Minted via CreateNFT page`,
            }),
          });

          if (vaultResponse.ok) {
            const vaultResult = await vaultResponse.json();
            console.log('[MINT] Vault inventory recorded:', vaultResult.data?.inventoryId);
          } else {
            console.warn(
              '[MINT] Vault recording failed (non-blocking):',
              await vaultResponse.text()
            );
          }
        } catch (vaultError) {
          console.warn('[MINT] Vault recording error (non-blocking):', vaultError);
        }
      }

      setProgress(100);
      setStatusMessage('Minted successfully!');
      console.log('[MINT] ========== SINGLE MINT COMPLETED SUCCESSFULLY ==========');
      console.log('[MINT] Final mint address:', mintAddress);
      console.log('[MINT] Final metadata URI:', metadataUri);
      console.log('[MINT] Final asset ID:', asset._id);

      // Reset form after successful mint
      setTimeout(() => {
        console.log('[MINT] Resetting form...');
        resetForm();
      }, 2000);
    } catch (error: any) {
      console.error('[MINT] ========== SINGLE MINT FAILED ==========');
      console.error('[MINT] Error:', error);
      console.error('[MINT] Error message:', error.message);
      console.error('[MINT] Error stack:', error.stack);
      setStatusMessage(`Mint failed: ${error.message || 'Unknown error'}`);
      // Rollback optimistic update on complete failure
      console.log('[MINT] Rolling back optimistic update...');
      setMintedNFTs((prev) => prev.filter((n) => n.title !== title || n.ipfs_pin_hash !== fileCid));
    } finally {
      setMinting(false);
      console.log('[MINT] Minting state reset to false');
    }
  };

  // Reset form
  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setFileCid('');
    setImageUri('');
    setPriceSol(0);
    setBrand('');
    setModel('');
    setSerialNumber('');
    setMaterial('');
    setProductionYear('');
    setLimitedEdition('');
    setCertificate('');
    setWarrantyInfo('');
    setMovement('');
    setCaseSize('');
    setWaterResistance('');
    setDialColor('');
    setCountry('');
    setReleaseDate('');
    setBoxPapers('');
    setCondition('');
    setFeatures('');
    setProgress(0);
    setStatusMessage('');
    // Reset verification state
    setVerificationResult(null);
    setVerificationWarnings([]);
    setSkipVerification(false);
  }, []);

  // AI Image Analysis - auto-fill form from watch image
  const analyzeImageWithAI = useCallback(async (imageUrl: string) => {
    setAnalyzingImage(true);
    setAnalysisError(null);

    try {
      const response = await fetch('/api/ai/analyze-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze image');
      }

      const data = await response.json();

      // Auto-fill form fields from AI analysis
      if (data.brand) setBrand(data.brand);
      if (data.model) setModel(data.model);
      if (data.title) setTitle(data.title);
      if (data.description) setDescription(data.description);
      if (data.material) setMaterial(data.material);
      if (data.dialColor) setDialColor(data.dialColor);
      if (data.caseSize) setCaseSize(data.caseSize);
      if (data.movement) setMovement(data.movement);
      if (data.waterResistance) setWaterResistance(data.waterResistance);
      if (data.productionYear) setProductionYear(data.productionYear);
      if (data.condition) setCondition(data.condition);
      if (data.features) setFeatures(data.features);
      if (data.country) setCountry(data.country);
      if (data.estimatedPriceSol) setPriceSol(data.estimatedPriceSol);

      setStatusMessage('AI analysis complete! Review and adjust as needed.');
    } catch (err: any) {
      console.error('AI analysis error:', err);
      setAnalysisError(err.message || 'Failed to analyze image');
    } finally {
      setAnalyzingImage(false);
    }
  }, []);

  // Parse CSV line handling quoted fields with commas
  const parseCsvLine = useCallback((line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }, []);

  // Parse CSV file
  const parseCsvFile = useCallback(
    async (file: File): Promise<CsvRow[]> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const text = e.target?.result as string;
            const lines = text.split('\n').filter((line) => line.trim());

            if (lines.length < 2) {
              reject(new Error('CSV must have header row and at least one data row'));
              return;
            }

            // Parse headers and keep original case
            const headers = parseCsvLine(lines[0]);
            const rows: CsvRow[] = [];

            for (let i = 1; i < lines.length; i++) {
              const values = parseCsvLine(lines[i]);
              const row: any = {};

              headers.forEach((header, idx) => {
                // Map header to expected field name (handle case variations)
                const normalizedHeader = header.trim();
                row[normalizedHeader] = values[idx] || '';
              });

              // Always add the row, let validation handle missing fields
              rows.push(row as CsvRow);
            }

            resolve(rows);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
    },
    [parseCsvLine]
  );

  // Handle CSV file selection
  const handleCsvFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        console.log('[CSV-PARSE] No file selected');
        return;
      }

      console.log('[CSV-PARSE] ========== CSV FILE LOADED ==========');
      console.log('[CSV-PARSE] File name:', file.name);
      console.log('[CSV-PARSE] File size:', file.size, 'bytes');
      console.log('[CSV-PARSE] File type:', file.type);

      setBulkCsvFile(file);
      try {
        console.log('[CSV-PARSE] Parsing CSV file...');
        const rows = await parseCsvFile(file);
        console.log('[CSV-PARSE] Parsed rows count:', rows.length);
        console.log('[CSV-PARSE] First row sample:', JSON.stringify(rows[0], null, 2));

        setParsedCsvRows(rows);
        setBulkMintResults(
          rows.map((_, idx) => ({
            row: idx + 1,
            title: rows[idx].title,
            status: 'pending',
          }))
        );
        console.log('[CSV-PARSE] CSV parsing completed successfully');
      } catch (err: any) {
        console.error('[CSV-PARSE] CSV parsing failed:', err);
        console.error('[CSV-PARSE] Error message:', err.message);
        alert(`Failed to parse CSV: ${err.message}`);
        setBulkCsvFile(null);
        setParsedCsvRows([]);
      }
    },
    [parseCsvFile]
  );

  // Bulk mint single item (USD-first approach)
  const mintSingleFromRow = useCallback(
    async (row: CsvRow, index: number): Promise<BulkMintResult> => {
      console.log(`[BULK-MINT] ========== ROW ${index + 1} STARTED ==========`);
      console.log(`[BULK-MINT] Timestamp:`, new Date().toISOString());
      console.log(`[BULK-MINT] Row data:`, JSON.stringify(row, null, 2));

      const result: BulkMintResult = {
        row: index + 1,
        title: row.title,
        status: 'minting',
      };

      setBulkMintResults((prev) => prev.map((r, i) => (i === index ? result : r)));

      try {
        if (!wallet.publicKey) {
          console.error(`[BULK-MINT] Row ${index + 1}: Wallet not connected`);
          throw new Error('Wallet not connected');
        }

        console.log(`[BULK-MINT] Row ${index + 1}: Creating UMI instance...`);
        const umi = getUmi();

        // Get USD price (source of truth) and convert to SOL for metadata
        const priceUSD = row.priceUSD
          ? parseFloat(row.priceUSD) || 0
          : (parseFloat(row.priceSol || '0') || 0) * solPrice; // Legacy fallback
        const priceSolConverted = solPrice > 0 ? priceUSD / solPrice : 0;

        console.log(
          `[BULK-MINT] Row ${index + 1}: Price conversion - USD: ${priceUSD}, SOL: ${priceSolConverted}`
        );

        // Get reference number (supports legacy serialNumber)
        const refNumber = row.referenceNumber || row.serialNumber || '';
        console.log(`[BULK-MINT] Row ${index + 1}: Reference number: ${refNumber}`);

        // Create metadata (stores both USD and SOL equivalent)
        console.log(`[BULK-MINT] Row ${index + 1}: Creating metadata JSON...`);
        const metadataJson = createMetadata(
          row.title,
          row.description || '',
          row.imageCid || '',
          wallet.publicKey.toBase58(),
          row.brand,
          row.model,
          refNumber,
          row.material || '',
          row.productionYear || '',
          row.limitedEdition || '',
          row.certificate || '',
          row.warrantyInfo || '',
          wallet.publicKey.toBase58(),
          row.movement || '',
          row.caseSize || '',
          row.waterResistance || '',
          row.dialColor || '',
          row.country || '',
          row.releaseDate || '',
          wallet.publicKey.toBase58(),
          'pending',
          priceSolConverted, // SOL equivalent at mint time (for display)
          row.boxPapers || '',
          row.condition || '',
          undefined, // serviceHistory
          undefined, // features
          row.imageUrl || undefined // Full image URL if provided in CSV
        );
        console.log(`[BULK-MINT] Row ${index + 1}: Metadata JSON created`);

        // Upload metadata via server-side API (Irys/Pinata based on config)
        console.log(`[BULK-MINT] Row ${index + 1}: Uploading metadata via API...`);

        const metadataUri = await uploadMetadataViaApi(metadataJson, row.title);

        console.log(`[BULK-MINT] Row ${index + 1}: Metadata uploaded: ${metadataUri}`);

        // Mint NFT
        console.log(`[BULK-MINT] Row ${index + 1}: Generating asset signer...`);
        const assetSigner = generateSigner(umi);
        console.log(
          `[BULK-MINT] Row ${index + 1}: Asset signer: ${assetSigner.publicKey.toString()}`
        );

        // NFT owner is always the minter - transfer to vault/vendor happens manually after
        const isVaultMintBulk = false; // Disabled auto-transfer - minter keeps NFT
        const nftOwner = umi.identity.publicKey;

        console.log(`[BULK-MINT] Row ${index + 1}: NFT Owner: Admin Wallet (minter)`);
        console.log(`[BULK-MINT] Row ${index + 1}: Sending on-chain transaction...`);
        const txStartTime = Date.now();
        await createAsset(umi, {
          asset: assetSigner,
          name: row.title,
          uri: metadataUri,
          owner: nftOwner, // Set owner to vault PDA for vault mints
        }).sendAndConfirm(umi);
        const txDuration = Date.now() - txStartTime;

        const mintAddress = assetSigner.publicKey.toString();
        console.log(`[BULK-MINT] Row ${index + 1}: On-chain mint successful!`);
        console.log(`[BULK-MINT] Row ${index + 1}: Mint address: ${mintAddress}`);
        console.log(`[BULK-MINT] Row ${index + 1}: Transaction duration: ${txDuration}ms`);

        // Save to DB with USD as source of truth
        console.log(`[BULK-MINT] Row ${index + 1}: Saving to database...`);

        // Vendor ID for DB record (if selected)
        const vendorId = currentVendorId || undefined;
        // NFT owner is always the minter initially
        const actualOwnerBulk = wallet.publicKey.toBase58();

        // Resolve full image URL for display
        const bulkImageUrl = row.imageCid ? resolveImageUrl(row.imageCid, gateway) : '';

        const dbPayload = {
          ...(vendorId && { vendor: vendorId }),
          model: row.model,
          serial: refNumber, // Reference number (supports alphanumeric)
          description: row.description,
          priceUSD, // USD is the source of truth
          images: bulkImageUrl ? [bulkImageUrl] : [], // Full URL for display
          imageIpfsUrls: row.imageCid ? [row.imageCid] : [], // ID/CID for reference
          metadataIpfsUrl: metadataUri,
          nftMint: mintAddress,
          nftOwnerWallet: actualOwnerBulk,
          mintedBy: wallet.publicKey.toBase58(), // Track original minter
          status: 'pending',
          poolEligible: true,
          // Additional metadata for the asset
          brand: row.brand,
          material: row.material,
          productionYear: row.productionYear,
          movement: row.movement,
          caseSize: row.caseSize,
          dialColor: row.dialColor,
          waterResistance: row.waterResistance,
          condition: row.condition,
          boxPapers: row.boxPapers,
          country: row.country,
          limitedEdition: row.limitedEdition,
          certificate: row.certificate,
          warrantyInfo: row.warrantyInfo,
          features: row.features,
          releaseDate: row.releaseDate,
        };
        console.log(
          `[BULK-MINT] Row ${index + 1}: DB payload:`,
          JSON.stringify(dbPayload, null, 2)
        );

        const dbResponse = await fetch('/api/assets/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dbPayload),
        });

        console.log(`[BULK-MINT] Row ${index + 1}: DB response status: ${dbResponse.status}`);
        if (!dbResponse.ok) {
          const errorData = await dbResponse.json();
          console.error(`[BULK-MINT] Row ${index + 1}: DB save failed:`, errorData);
          throw new Error(errorData.error || 'DB save failed');
        }
        const dbResult = await dbResponse.json();
        console.log(`[BULK-MINT] Row ${index + 1}: Asset saved with ID: ${dbResult.asset?._id}`);

        // Record in vault inventory if this is a vault mint
        if (isVaultMintBulk) {
          console.log(`[BULK-MINT] Row ${index + 1}: Recording in vault inventory...`);
          try {
            const imageUrl = row.imageUrl || (row.imageCid ? `${gateway}${row.imageCid}` : '');
            const vaultResponse = await fetch('/api/vault/mint', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nftMint: mintAddress,
                name: row.title,
                description: row.description,
                imageUrl,
                metadataUri,
                mintSignature: mintAddress,
                assetId: dbResult.asset?._id,
                tags: ['timepiece', 'bulk-mint', row.brand?.toLowerCase()].filter(Boolean),
                notes: `Bulk minted from CSV: ${bulkCsvFile?.name}`,
              }),
            });
            if (vaultResponse.ok) {
              console.log(`[BULK-MINT] Row ${index + 1}: Vault inventory recorded`);
            } else {
              console.warn(`[BULK-MINT] Row ${index + 1}: Vault recording failed (non-blocking)`);
            }
          } catch (vaultError) {
            console.warn(`[BULK-MINT] Row ${index + 1}: Vault error (non-blocking):`, vaultError);
          }
        }

        // Add to minted list (display SOL equivalent)
        const newNft: MintedNFT = {
          title: row.title,
          description: row.description || '',
          image: row.imageUrl || resolveImageUrl(row.imageCid, gateway),
          priceSol: priceSolConverted,
          metadataUri,
          mintAddress,
          currentOwner: wallet.publicKey.toBase58(),
          mintedBy: wallet.publicKey.toBase58(), // Track original minter
          ipfs_pin_hash: row.imageCid || null,
          marketStatus: 'pending',
          updatedAt: new Date().toISOString(),
          assetId: null,
          escrowPda: null,
        };
        console.log(`[BULK-MINT] Row ${index + 1}: Adding to local minted list...`);
        setMintedNFTs((prev) => [...prev, newNft]);

        console.log(`[BULK-MINT] ========== ROW ${index + 1} COMPLETED SUCCESSFULLY ==========`);
        console.log(`[BULK-MINT] Row ${index + 1}: Final mint address: ${mintAddress}`);
        console.log(`[BULK-MINT] Row ${index + 1}: Final metadata URI: ${metadataUri}`);
        return { ...result, status: 'success', mintAddress };
      } catch (err: any) {
        console.error(`[BULK-MINT] ========== ROW ${index + 1} FAILED ==========`);
        console.error(`[BULK-MINT] Row ${index + 1}: Error:`, err);
        console.error(`[BULK-MINT] Row ${index + 1}: Error message:`, err.message);
        console.error(`[BULK-MINT] Row ${index + 1}: Error stack:`, err.stack);
        return { ...result, status: 'error', error: err.message };
      }
    },
    [wallet, getUmi, gateway, currentVendorId, solPrice, vaultConfig, luxhubVendor, bulkCsvFile]
  );

  // Bulk mint from CSV
  const bulkMintFromCsv = async () => {
    console.log('[BULK-MINT] ========== BULK MINT SESSION STARTED ==========');
    console.log('[BULK-MINT] Timestamp:', new Date().toISOString());
    console.log('[BULK-MINT] Total rows to process:', parsedCsvRows.length);
    console.log('[BULK-MINT] CSV file:', bulkCsvFile?.name);
    console.log('[BULK-MINT] Wallet:', wallet.publicKey?.toBase58() || 'N/A');

    if (!bulkCsvFile || parsedCsvRows.length === 0) {
      console.log('[BULK-MINT] ERROR: No CSV file or no rows parsed');
      return;
    }
    if (!wallet.publicKey) {
      console.log('[BULK-MINT] ERROR: Wallet not connected');
      return alert('Connect wallet');
    }

    setIsBulkMinting(true);
    const limit = pLimit(2); // Process 2 at a time to avoid rate limits
    console.log('[BULK-MINT] Concurrency limit set to 2');

    const startTime = Date.now();
    try {
      const mintPromises = parsedCsvRows.map((row, index) =>
        limit(async () => {
          console.log(`[BULK-MINT] Starting row ${index + 1} of ${parsedCsvRows.length}...`);
          const result = await mintSingleFromRow(row, index);
          setBulkMintResults((prev) => prev.map((r, i) => (i === index ? result : r)));
          return result;
        })
      );

      const results = await Promise.all(mintPromises);
      const totalDuration = Date.now() - startTime;

      // Calculate summary
      const successCount = results.filter((r) => r.status === 'success').length;
      const errorCount = results.filter((r) => r.status === 'error').length;

      console.log('[BULK-MINT] ========== BULK MINT SESSION COMPLETED ==========');
      console.log('[BULK-MINT] Total duration:', totalDuration, 'ms');
      console.log('[BULK-MINT] Success count:', successCount);
      console.log('[BULK-MINT] Error count:', errorCount);
      console.log('[BULK-MINT] Results:', JSON.stringify(results, null, 2));
    } catch (err: any) {
      console.error('[BULK-MINT] ========== BULK MINT SESSION FAILED ==========');
      console.error('[BULK-MINT] Error:', err);
      console.error('[BULK-MINT] Error message:', err.message);
      console.error('[BULK-MINT] Error stack:', err.stack);
    } finally {
      setIsBulkMinting(false);
      console.log('[BULK-MINT] Bulk minting state reset to false');
    }
  };

  // Get recipient display name for confirmation dialog
  const getRecipientName = useCallback(
    (address: string): string => {
      // Check if it's the LuxHub vault
      if (address === 'EEtCfR8kJxQ3ZVVtTSkVRXEkF4FfAyt9YnMSiXhtFMLJ') {
        return 'LuxHub Treasury Vault (Squads Multisig)';
      }

      // Check operational wallets
      const opWallet = vaultConfig?.operationalWallets?.find(
        (w: { address: string; name: string }) => w.address === address
      );
      if (opWallet) {
        return `${opWallet.name} (Operational Wallet)`;
      }

      // Check vendors
      const vendor = approvedVendors.find(
        (v: { wallet?: string; walletAddress?: string }) =>
          (v.wallet || v.walletAddress) === address
      );
      if (vendor) {
        return `${(vendor as any).businessName || (vendor as any).username || 'Vendor'}`;
      }

      // Unknown address
      return 'Custom Address';
    },
    [vaultConfig, approvedVendors]
  );

  // Transfer NFT with confirmation dialog
  const transferNft = async (mintAddress: string, newOwner: string, vendorId?: string) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      return alert('Connect wallet');
    }

    if (!isValidSolanaAddress(newOwner)) {
      return alert('Invalid wallet address');
    }

    // Find the NFT details
    const nft = mintedNFTs.find((n) => n.mintAddress === mintAddress);
    const nftTitle = nft?.title || 'Unknown NFT';
    const recipientName = getRecipientName(newOwner);

    // Show confirmation dialog
    const confirmed = window.confirm(
      `⚠️ CONFIRM NFT TRANSFER\n\n` +
        `NFT: ${nftTitle}\n` +
        `Mint: ${mintAddress.slice(0, 8)}...${mintAddress.slice(-8)}\n\n` +
        `Recipient: ${recipientName}\n` +
        `Address: ${newOwner.slice(0, 8)}...${newOwner.slice(-8)}\n\n` +
        `This action cannot be undone. Continue?`
    );

    if (!confirmed) {
      return;
    }

    setTransferringNfts((prev) => new Set(prev).add(mintAddress));

    try {
      const umi = getUmi();

      // Fetch the asset to get current state
      const asset = await fetchAsset(umi, umiPublicKey(mintAddress));

      // Verify the connected wallet is the owner
      const connectedWallet = wallet.publicKey?.toBase58();
      const assetOwner = asset.owner.toString();

      if (assetOwner !== connectedWallet) {
        throw new Error(
          `You are not the owner of this NFT.\n` +
            `Owner: ${assetOwner.slice(0, 8)}...${assetOwner.slice(-4)}\n` +
            `Your wallet: ${connectedWallet?.slice(0, 8)}...${connectedWallet?.slice(-4)}`
        );
      }

      // Transfer using mpl-core with explicit authority
      await transfer(umi, {
        asset,
        newOwner: umiPublicKey(newOwner),
        authority: umi.identity, // Explicitly pass the connected wallet as authority
      }).sendAndConfirm(umi);

      // Update database (also links to vendor if vendorId provided or wallet matches a vendor)
      const response = await fetch('/api/nft/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintAddress,
          newOwnerWallet: newOwner,
          vendorId, // If provided, explicitly links asset to this vendor
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update transfer in database');
      }

      // Update local state
      setMintedNFTs((prev) =>
        prev.map((nft) =>
          nft.mintAddress === mintAddress ? { ...nft, currentOwner: newOwner } : nft
        )
      );

      // Clear transfer input and vendor selection
      setTransferInputs((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (key.includes(mintAddress)) delete next[key];
        });
        return next;
      });
      setSelectedVendorTransfer((prev) => {
        const next = { ...prev };
        delete next[mintAddress];
        return next;
      });

      alert(`✅ Transfer successful!\n\n${nftTitle} has been transferred to ${recipientName}.`);
    } catch (err: any) {
      console.error('Transfer error:', err);
      alert(`❌ Transfer failed: ${err.message}`);
    } finally {
      setTransferringNfts((prev) => {
        const next = new Set(prev);
        next.delete(mintAddress);
        return next;
      });
    }
  };

  // Sync on-chain ownership with database
  const syncOwnership = async () => {
    if (!wallet.publicKey) {
      return alert('Connect wallet first');
    }

    setIsSyncing(true);

    try {
      const response = await fetch('/api/nft/sync-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminWallet: wallet.publicKey.toBase58(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Sync failed');
      }

      // Update local state with synced ownership
      if (data.results && data.results.length > 0) {
        setMintedNFTs((prev) =>
          prev.map((nft) => {
            const syncResult = data.results.find(
              (r: { mintAddress: string; onChainOwner: string | null }) =>
                r.mintAddress === nft.mintAddress
            );
            if (syncResult && syncResult.onChainOwner) {
              return { ...nft, currentOwner: syncResult.onChainOwner };
            }
            return nft;
          })
        );
      }

      const { summary } = data;
      alert(
        `Sync Complete\n\n` +
          `Total: ${summary.total}\n` +
          `Updated: ${summary.updated}\n` +
          `Unchanged: ${summary.unchanged}\n` +
          `Errors: ${summary.errors}`
      );
    } catch (err: any) {
      console.error('Sync error:', err);
      alert(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Create escrow for NFT
  const createEscrowForNft = async (nft: MintedNFT) => {
    if (!wallet.publicKey || !nft.mintAddress || !nft.assetId) {
      return alert('Missing required data for escrow creation');
    }

    const priceInput = escrowPrice[nft.mintAddress];
    if (!priceInput || isNaN(parseFloat(priceInput))) {
      return alert('Please enter a valid listing price');
    }

    setCreatingEscrow(nft.mintAddress);

    try {
      const listingPriceUSD = parseFloat(priceInput);
      const listingPriceLamports = Math.floor((listingPriceUSD / solPrice) * 1e9);
      const seed = Date.now(); // Use timestamp as seed

      const response = await fetch('/api/escrow/create-with-mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorWallet: wallet.publicKey.toBase58(),
          assetId: nft.assetId,
          nftMint: nft.mintAddress,
          saleMode: 'fixed_price',
          listingPrice: listingPriceLamports,
          listingPriceUSD,
          seed,
          fileCid: nft.ipfs_pin_hash || '',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create escrow');
      }

      const { escrow, squads } = await response.json();

      // Update local state
      setMintedNFTs((prev) =>
        prev.map((n) =>
          n.mintAddress === nft.mintAddress
            ? { ...n, escrowPda: escrow.escrowPda, marketStatus: 'in_escrow' }
            : n
        )
      );

      alert(`Escrow created! Squads proposal: ${squads.transactionIndex}`);
    } catch (err: any) {
      console.error('Escrow creation error:', err);
      alert(`Failed to create escrow: ${err.message}`);
    } finally {
      setCreatingEscrow(null);
    }
  };

  // Update NFT metadata
  const updateNFT = async () => {
    if (!editingNft || !editingNft.mintAddress) return;

    setMinting(true);
    setStatusMessage('Updating NFT...');

    try {
      const umi = getUmi();

      // Create updated metadata
      const updatedJson = createMetadata(
        title,
        description,
        fileCid,
        wallet.publicKey?.toBase58() || '',
        brand,
        model,
        serialNumber,
        material,
        productionYear,
        limitedEdition,
        certificate,
        warrantyInfo,
        provenance,
        movement,
        caseSize,
        waterResistance,
        dialColor,
        country,
        releaseDate,
        wallet.publicKey?.toBase58() || '',
        marketStatus,
        priceSol,
        boxPapers,
        condition,
        undefined, // serviceHistory
        undefined, // features
        imageUri // Full image URL (Irys or IPFS)
      );

      // Upload new metadata via server-side API
      console.log('[UPDATE] Uploading updated metadata via API...');
      const newUri = await uploadMetadataViaApi(updatedJson, title);
      console.log('[UPDATE] Metadata uploaded:', newUri);

      // Fetch and update on-chain
      const asset = await fetchAsset(umi, umiPublicKey(editingNft.mintAddress));
      await updateAsset(umi, {
        asset,
        uri: newUri,
      }).sendAndConfirm(umi);

      // Update database
      const response = await fetch('/api/assets/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nftMint: editingNft.mintAddress,
          priceUSD: priceSol * solPrice,
          metadataIpfsUrl: newUri,
          imageIpfsUrls: fileCid
            ? [fileCid]
            : editingNft.ipfs_pin_hash
              ? [editingNft.ipfs_pin_hash]
              : [],
          status: marketStatus,
        }),
      });

      if (!response.ok) throw new Error('DB update failed');

      // Update local state - use full imageUri if a new image was uploaded, otherwise keep existing
      const newImage = fileCid ? imageUri || resolveImageUrl(fileCid, gateway) : editingNft.image;
      setMintedNFTs((prev) =>
        prev.map((n) =>
          n.mintAddress === editingNft.mintAddress
            ? {
                ...n,
                title,
                description,
                priceSol,
                metadataUri: newUri,
                image: newImage,
                ipfs_pin_hash: fileCid || n.ipfs_pin_hash,
                marketStatus,
              }
            : n
        )
      );

      setStatusMessage('Updated successfully!');
    } catch (error: any) {
      console.error('Update failed:', error);
      setStatusMessage(`Update failed: ${error.message}`);
    } finally {
      setMinting(false);
      setEditingNft(null);
    }
  };

  // Start editing NFT
  const startEditing = useCallback((nft: MintedNFT) => {
    setEditingNft(nft);
    setTitle(nft.title);
    setDescription(nft.description);
    setPriceSol(nft.priceSol);
    setFileCid(nft.ipfs_pin_hash || '');
    setImageUri(nft.image || ''); // Use existing image URL
    setMarketStatus(nft.marketStatus || 'pending');
    setActiveTab('mint');
  }, []);

  // Filter NFTs - only show NFTs relevant to this admin
  const ownedNfts = useMemo(
    () => mintedNFTs.filter((n) => n.currentOwner === adminWallet),
    [mintedNFTs, adminWallet]
  );

  // Only show NFTs that THIS admin minted and then transferred (not other admins' transfers)
  const myTransferredNfts = useMemo(
    () => mintedNFTs.filter((n) => n.mintedBy === adminWallet && n.currentOwner !== adminWallet),
    [mintedNFTs, adminWallet]
  );

  // For backwards compatibility, keep transferredNfts as alias
  const transferredNfts = myTransferredNfts;

  // Helper to get USD price from row (supports both priceUSD and legacy priceSol)
  const getRowPriceUSD = useCallback(
    (row: CsvRow): number => {
      // Prefer priceUSD, fall back to priceSol converted to USD
      if (row.priceUSD) {
        return parseFloat(row.priceUSD) || 0;
      }
      // Legacy support: if only priceSol exists, convert to USD
      if (row.priceSol) {
        return (parseFloat(row.priceSol) || 0) * solPrice;
      }
      return 0;
    },
    [solPrice]
  );

  // Helper to convert USD to SOL
  const usdToSol = useCallback(
    (usd: number): number => {
      if (!solPrice || solPrice === 0) return 0;
      return usd / solPrice;
    },
    [solPrice]
  );

  // Helper to get reference number from row (supports legacy serialNumber)
  const getRowReferenceNumber = useCallback((row: CsvRow): string => {
    return row.referenceNumber || row.serialNumber || '';
  }, []);

  // Validate a single CSV row
  const validateCsvRow = useCallback((row: CsvRow): CsvValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    CSV_REQUIRED_FIELDS.forEach((field) => {
      let value = row[field];

      // Special case: priceUSD can fall back to priceSol
      if (field === 'priceUSD' && !value && row.priceSol) {
        return; // priceSol is acceptable as fallback
      }

      // Special case: referenceNumber can fall back to serialNumber (legacy)
      if (field === 'referenceNumber' && !value && row.serialNumber) {
        return; // serialNumber is acceptable as fallback
      }

      if (!value || value.trim() === '') {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // Validate numeric fields - should only contain numbers (and decimal point)
    CSV_NUMERIC_FIELDS.forEach((field) => {
      const value = row[field];
      if (value && value.trim() !== '') {
        // Remove commas and spaces for validation
        const cleanValue = value.replace(/[,\s]/g, '');
        // Check if it's a valid number (allows decimals)
        if (!/^-?\d*\.?\d+$/.test(cleanValue)) {
          errors.push(`${field} must be a number (got: "${value}")`);
        }
      }
    });

    // Validate productionYear is a reasonable year if provided
    if (row.productionYear && row.productionYear.trim() !== '') {
      const year = parseInt(row.productionYear, 10);
      if (isNaN(year) || year < 1800 || year > new Date().getFullYear() + 1) {
        errors.push(`productionYear must be a valid year (got: "${row.productionYear}")`);
      }
    }

    // Warnings for recommended but optional fields
    if (!row.imageCid && !row.imageUrl) {
      warnings.push('No image provided (imageCid or imageUrl recommended)');
    }
    if (!row.description) {
      warnings.push('No description provided');
    }
    if (!row.condition) {
      warnings.push('No condition specified');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }, []);

  // Validate all CSV rows and get validation results
  const csvValidationResults = useMemo(
    () => parsedCsvRows.map((row) => validateCsvRow(row)),
    [parsedCsvRows, validateCsvRow]
  );

  // Get valid rows (those with no errors)
  const validCsvRows = useMemo(
    () => parsedCsvRows.filter((_, idx) => csvValidationResults[idx]?.isValid),
    [parsedCsvRows, csvValidationResults]
  );

  // Count rows with errors vs warnings only
  const csvErrorCount = useMemo(
    () => csvValidationResults.filter((r) => !r.isValid).length,
    [csvValidationResults]
  );

  const csvWarningCount = useMemo(
    () => csvValidationResults.filter((r) => r.isValid && r.warnings.length > 0).length,
    [csvValidationResults]
  );

  const allRowsValid = parsedCsvRows.length > 0 && validCsvRows.length === parsedCsvRows.length;

  return (
    <div className={styles.pageContainer}>
      <div className={styles.tabContainer}>
        <button
          className={activeTab === 'mint' ? styles.activeTab : ''}
          onClick={() => setActiveTab('mint')}
        >
          <HiOutlineSparkles className={styles.tabIcon} />
          <span>{editingNft ? 'Edit NFT' : 'Create'}</span>
        </button>
        <button
          className={activeTab === 'minted' ? styles.activeTab : ''}
          onClick={() => setActiveTab('minted')}
        >
          <HiOutlineCollection className={styles.tabIcon} />
          <span>Minted</span>
          <span className={styles.tabCount}>{ownedNfts.length}</span>
        </button>
        <button
          className={activeTab === 'transferred' ? styles.activeTab : ''}
          onClick={() => setActiveTab('transferred')}
        >
          <HiOutlineSwitchHorizontal className={styles.tabIcon} />
          <span>Transferred</span>
          <span className={styles.tabCount}>{transferredNfts.length}</span>
        </button>
      </div>

      {/* Mint Tab - Single or Bulk Mode */}
      {activeTab === 'mint' && (
        <div className={styles.mainContent}>
          {/* Single Mint Mode */}
          {mintMode === 'single' && (
            <div className={styles.mintCard}>
              <div className={styles.leftColumn}>
                <NftForm
                  fileCid={fileCid}
                  setFileCid={setFileCid}
                  imageUri={imageUri}
                  setImageUri={setImageUri}
                  title={title}
                  setTitle={setTitle}
                  description={description}
                  setDescription={setDescription}
                  priceSol={priceSol}
                  setPriceSol={setPriceSol}
                  brand={brand}
                  setBrand={setBrand}
                  model={model}
                  setModel={setModel}
                  serialNumber={serialNumber}
                  setSerialNumber={setSerialNumber}
                  material={material}
                  setMaterial={setMaterial}
                  productionYear={productionYear}
                  setProductionYear={setProductionYear}
                  limitedEdition={limitedEdition}
                  setLimitedEdition={setLimitedEdition}
                  certificate={certificate}
                  setCertificate={setCertificate}
                  warrantyInfo={warrantyInfo}
                  setWarrantyInfo={setWarrantyInfo}
                  provenance={provenance}
                  setProvenance={setProvenance}
                  movement={movement}
                  setMovement={setMovement}
                  caseSize={caseSize}
                  setCaseSize={setCaseSize}
                  waterResistance={waterResistance}
                  setWaterResistance={setWaterResistance}
                  dialColor={dialColor}
                  setDialColor={setDialColor}
                  country={country}
                  setCountry={setCountry}
                  releaseDate={releaseDate}
                  setReleaseDate={setReleaseDate}
                  boxPapers={boxPapers}
                  setBoxPapers={setBoxPapers}
                  condition={condition}
                  setCondition={setCondition}
                  features={features}
                  setFeatures={setFeatures}
                  mintNFT={editingNft ? updateNFT : mintNFT}
                  minting={minting}
                  onAnalyzeImage={analyzeImageWithAI}
                  analyzingImage={analyzingImage}
                  analysisError={analysisError}
                />

                {editingNft && (
                  <button
                    onClick={() => {
                      setEditingNft(null);
                      resetForm();
                    }}
                    style={{ marginTop: '10px', background: '#555' }}
                    className={styles.mintButton}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <div className={styles.rightColumn}>
                <div className={styles.formTitle}>Lux.NFT Preview</div>
                <NFTPreviewCard
                  fileCid={fileCid}
                  title={title}
                  description={description}
                  priceSol={priceSol}
                  brand={brand}
                  onViewDetails={() => setShowPreview(true)}
                />
                {minting && (
                  <div className={styles.mintProgressContainer}>
                    <p>{statusMessage}</p>
                    <div className={styles.progressBar}>
                      <div className={styles.progress} style={{ width: `${progress}%` }} />
                    </div>
                    <p>{progress}%</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bulk Mint Mode */}
          {mintMode === 'bulk' && (
            <div className={styles.mintedSection}>
              <h2>Bulk Mint from CSV</h2>

              {/* Upload Controls - Compact Header */}
              <div className={styles.bulkHeader}>
                <div className={styles.bulkUploadCompact}>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvFileChange}
                    disabled={isBulkMinting}
                    id="csvUpload"
                  />
                  <label htmlFor="csvUpload" className={styles.uploadLabel}>
                    <FaUpload /> {bulkCsvFile ? bulkCsvFile.name : 'Choose CSV File'}
                  </label>
                  <a
                    href="/assets/sample-watches.csv"
                    download="sample-watches.csv"
                    className={styles.downloadSampleLink}
                  >
                    Download Sample CSV
                  </a>
                </div>

                {parsedCsvRows.length > 0 && (
                  <div className={styles.bulkStats}>
                    <div className={styles.bulkStatItem}>
                      <span className={styles.bulkStatValue}>{parsedCsvRows.length}</span>
                      <span className={styles.bulkStatLabel}>Total</span>
                    </div>
                    <div className={styles.bulkStatItem}>
                      <span className={`${styles.bulkStatValue} ${styles.success}`}>
                        {validCsvRows.length}
                      </span>
                      <span className={styles.bulkStatLabel}>Ready</span>
                    </div>
                    {csvErrorCount > 0 && (
                      <div className={styles.bulkStatItem}>
                        <span className={`${styles.bulkStatValue} ${styles.error}`}>
                          {csvErrorCount}
                        </span>
                        <span className={styles.bulkStatLabel}>Errors</span>
                      </div>
                    )}
                    {csvWarningCount > 0 && (
                      <div className={styles.bulkStatItem}>
                        <span className={`${styles.bulkStatValue} ${styles.warning}`}>
                          {csvWarningCount}
                        </span>
                        <span className={styles.bulkStatLabel}>Warnings</span>
                      </div>
                    )}
                    <button
                      className={styles.mintButton}
                      onClick={bulkMintFromCsv}
                      disabled={isBulkMinting || validCsvRows.length === 0}
                    >
                      {isBulkMinting
                        ? 'Minting...'
                        : validCsvRows.length > 0
                          ? `Mint ${validCsvRows.length} NFTs`
                          : `Fix ${csvErrorCount} Errors`}
                    </button>
                  </div>
                )}
              </div>

              {/* Empty State */}
              {parsedCsvRows.length === 0 && (
                <div className={styles.bulkEmptyState}>
                  <FaUpload className={styles.bulkEmptyIcon} />
                  <h3>Upload a CSV to Get Started</h3>
                  <div className={styles.bulkFieldsInfo}>
                    <div className={styles.bulkFieldsColumn}>
                      <span className={styles.bulkFieldsTitle}>Required Fields</span>
                      <ul>
                        <li>title</li>
                        <li>brand</li>
                        <li>model</li>
                        <li>referenceNumber</li>
                        <li>
                          priceUSD <span className={styles.fieldNote}>(numbers only)</span>
                        </li>
                      </ul>
                    </div>
                    <div className={styles.bulkFieldsColumn}>
                      <span className={styles.bulkFieldsTitle}>Optional Fields</span>
                      <ul>
                        <li>imageCid / imageUrl</li>
                        <li>description</li>
                        <li>material, movement, caseSize</li>
                        <li>dialColor, waterResistance</li>
                        <li>
                          productionYear <span className={styles.fieldNote}>(numbers only)</span>
                        </li>
                        <li>condition, boxPapers, country</li>
                        <li>limitedEdition, certificate</li>
                        <li>warrantyInfo, features, releaseDate</li>
                      </ul>
                    </div>
                  </div>
                  <p className={styles.bulkEmptyNote}>
                    Prices in USD - converted to SOL at transaction time
                  </p>
                </div>
              )}

              {/* Responsive Preview Grid */}
              {parsedCsvRows.length > 0 && (
                <div className={styles.bulkGridResponsive}>
                  {parsedCsvRows.map((row, idx) => {
                    const result = bulkMintResults[idx];
                    const validation = csvValidationResults[idx];
                    // Prefer full imageUrl, otherwise resolve from imageCid
                    const imageUrl =
                      row.imageUrl ||
                      (row.imageCid ? resolveImageUrl(row.imageCid, gateway) : undefined);
                    const priceUSD = getRowPriceUSD(row);
                    const priceSolConverted = usdToSol(priceUSD);

                    // Map bulk mint status to NFTStatus
                    const getStatus = (): NFTStatus => {
                      if (result?.status === 'minting') return 'minting';
                      if (result?.status === 'success') return 'verified';
                      if (result?.status === 'error') return 'error';
                      if (!validation?.isValid) return 'error';
                      if (validation?.warnings.length > 0) return 'pending';
                      return 'ready';
                    };

                    return (
                      <div key={idx} className={styles.bulkCardWrapper}>
                        <NFTGridCard
                          title={row.title || 'Untitled'}
                          image={imageUrl}
                          price={priceUSD}
                          priceLabel="USD"
                          priceUSD={priceUSD}
                          brand={row.brand}
                          subtitle={
                            priceSolConverted > 0
                              ? `≈ ${priceSolConverted.toFixed(2)} SOL`
                              : undefined
                          }
                          status={getStatus()}
                          isValid={validation?.isValid ?? false}
                          onClick={() => setSelectedBulkNftIndex(idx)}
                        />
                        {/* Validation indicator */}
                        {validation && !validation.isValid && (
                          <div className={styles.bulkCardError}>
                            <FaTimes /> {validation.errors.length} error
                            {validation.errors.length > 1 ? 's' : ''}
                          </div>
                        )}
                        {validation && validation.isValid && validation.warnings.length > 0 && (
                          <div className={styles.bulkCardWarning}>
                            <FaClock /> {validation.warnings.length} warning
                            {validation.warnings.length > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bulk NFT Detail Modal using NftDetailCard */}
              {selectedBulkNftIndex !== null && parsedCsvRows[selectedBulkNftIndex] && (
                <div className={styles.modalBackdrop} onClick={() => setSelectedBulkNftIndex(null)}>
                  <div className={styles.bulkDetailWrapper} onClick={(e) => e.stopPropagation()}>
                    {/* Navigation Header */}
                    <div className={styles.bulkDetailNavHeader}>
                      <button
                        className={styles.bulkNavBtn}
                        onClick={() =>
                          setSelectedBulkNftIndex(
                            selectedBulkNftIndex > 0
                              ? selectedBulkNftIndex - 1
                              : parsedCsvRows.length - 1
                          )
                        }
                      >
                        ← Prev
                      </button>
                      <span className={styles.bulkNavCount}>
                        {selectedBulkNftIndex + 1} / {parsedCsvRows.length}
                      </span>
                      <button
                        className={styles.bulkNavBtn}
                        onClick={() =>
                          setSelectedBulkNftIndex(
                            selectedBulkNftIndex < parsedCsvRows.length - 1
                              ? selectedBulkNftIndex + 1
                              : 0
                          )
                        }
                      >
                        Next →
                      </button>
                    </div>

                    {/* Status Badge and Validation */}
                    {(() => {
                      const result = bulkMintResults[selectedBulkNftIndex];
                      const validation = csvValidationResults[selectedBulkNftIndex];

                      if (result?.status === 'success') {
                        return (
                          <div className={styles.bulkStatusBanner}>
                            <span className={styles.bulkBadgeSuccess}>
                              <FaCheck /> Minted
                            </span>
                            {result.mintAddress && (
                              <span
                                className={styles.bulkMintLink}
                                onClick={() => handleCopy('bulk-mint', result.mintAddress || '')}
                              >
                                {result.mintAddress.slice(0, 6)}...{result.mintAddress.slice(-6)}
                                <FaCopy />
                              </span>
                            )}
                          </div>
                        );
                      }
                      if (result?.status === 'minting') {
                        return (
                          <div className={styles.bulkStatusBanner}>
                            <span className={styles.bulkBadgeMinting}>
                              <FaSpinner className={styles.spinningIcon} /> Minting...
                            </span>
                          </div>
                        );
                      }
                      if (result?.status === 'error') {
                        return (
                          <div className={styles.bulkStatusBanner}>
                            <span className={styles.bulkBadgeError}>
                              <FaTimes /> {result.error || 'Error'}
                            </span>
                          </div>
                        );
                      }

                      // Show validation errors/warnings
                      return (
                        <>
                          {validation && !validation.isValid && (
                            <div className={styles.bulkValidationBox}>
                              <div className={styles.bulkValidationTitle}>
                                <FaTimes /> {validation.errors.length} Validation Error
                                {validation.errors.length > 1 ? 's' : ''}
                              </div>
                              <ul className={styles.bulkValidationList}>
                                {validation.errors.map((error, i) => (
                                  <li key={i}>{error}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {validation && validation.isValid && validation.warnings.length > 0 && (
                            <div className={styles.bulkWarningBox}>
                              <div className={styles.bulkWarningTitle}>
                                <FaClock /> {validation.warnings.length} Warning
                                {validation.warnings.length > 1 ? 's' : ''}
                              </div>
                              <ul className={styles.bulkValidationList}>
                                {validation.warnings.map((warning, i) => (
                                  <li key={i}>{warning}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {validation?.isValid && validation.warnings.length === 0 && (
                            <div className={styles.bulkStatusBanner}>
                              <span className={styles.bulkBadgeReady}>
                                <FaCheck /> Ready to Mint
                              </span>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {/* NftDetailCard with preview data (USD-first) */}
                    {(() => {
                      const row = parsedCsvRows[selectedBulkNftIndex];
                      const priceUSD = getRowPriceUSD(row);
                      const priceSolConverted = usdToSol(priceUSD);

                      return (
                        <NftDetailCard
                          onClose={() => setSelectedBulkNftIndex(null)}
                          mintAddress={
                            bulkMintResults[selectedBulkNftIndex]?.mintAddress || undefined
                          }
                          previewData={{
                            title: row.title || 'Untitled',
                            description: row.description || '',
                            image:
                              row.imageUrl ||
                              (row.imageCid
                                ? resolveImageUrl(row.imageCid, gateway)
                                : '/images/purpleLGG.png'),
                            priceSol: priceSolConverted,
                            attributes: [
                              {
                                trait_type: 'Price (USD)',
                                value: priceUSD > 0 ? `$${priceUSD.toLocaleString()}` : '',
                              },
                              {
                                trait_type: 'Price (SOL)',
                                value:
                                  priceSolConverted > 0
                                    ? `≈ ${priceSolConverted.toFixed(2)} SOL`
                                    : '',
                              },
                              {
                                trait_type: 'Brand',
                                value: row.brand || '',
                              },
                              {
                                trait_type: 'Model',
                                value: row.model || '',
                              },
                              {
                                trait_type: 'Reference Number',
                                value: row.referenceNumber || row.serialNumber || '',
                              },
                              {
                                trait_type: 'Material',
                                value: row.material || '',
                              },
                              {
                                trait_type: 'Production Year',
                                value: row.productionYear || '',
                              },
                              {
                                trait_type: 'Movement',
                                value: row.movement || '',
                              },
                              {
                                trait_type: 'Case Size',
                                value: row.caseSize || '',
                              },
                              {
                                trait_type: 'Dial Color',
                                value: row.dialColor || '',
                              },
                              {
                                trait_type: 'Water Resistance',
                                value: row.waterResistance || '',
                              },
                              {
                                trait_type: 'Condition',
                                value: row.condition || '',
                              },
                              {
                                trait_type: 'Box & Papers',
                                value: row.boxPapers || '',
                              },
                              {
                                trait_type: 'Country',
                                value: row.country || '',
                              },
                              {
                                trait_type: 'Limited Edition',
                                value: row.limitedEdition || '',
                              },
                              {
                                trait_type: 'Certificate',
                                value: row.certificate || '',
                              },
                              {
                                trait_type: 'Warranty Info',
                                value: row.warrantyInfo || '',
                              },
                              {
                                trait_type: 'Features',
                                value: row.features || '',
                              },
                              {
                                trait_type: 'Release Date',
                                value: row.releaseDate || '',
                              },
                            ].filter((attr) => attr.value),
                          }}
                        />
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode Switcher - WatchMarket Style */}
          <div className={styles.modeTabs}>
            <button
              className={mintMode === 'single' ? styles.active : ''}
              onClick={() => setMintMode('single')}
            >
              <FaEdit className={styles.modeIcon} />
              <span>Manual</span>
            </button>
            <button
              className={mintMode === 'bulk' ? styles.active : ''}
              onClick={() => setMintMode('bulk')}
            >
              <FaLayerGroup className={styles.modeIcon} />
              <span>Bulk</span>
            </button>
          </div>
        </div>
      )}

      {/* Minted NFTs Tab - Compact Grid with Selection Mode */}
      {activeTab === 'minted' && (
        <div className={styles.mintedSection}>
          {/* Section Header with Controls */}
          <div className={styles.mintedHeader}>
            <div className={styles.mintedHeaderLeft}>
              <h2>Your Minted NFTs</h2>
              <span className={styles.nftCount}>
                {ownedNfts.length} NFT{ownedNfts.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className={styles.mintedHeaderRight}>
              <button
                className={styles.syncBtn}
                onClick={syncOwnership}
                disabled={isSyncing}
                title="Sync on-chain ownership with database"
              >
                <FaSync className={isSyncing ? styles.spinning : ''} />
                {isSyncing ? 'Syncing...' : 'Sync'}
              </button>
              <button
                className={`${styles.selectionModeBtn} ${selectionMode ? styles.active : ''}`}
                onClick={() => {
                  setSelectionMode(!selectionMode);
                  if (selectionMode) clearSelection();
                }}
              >
                {selectionMode ? <FaTimes /> : <FaCheck />}
                {selectionMode ? 'Cancel' : 'Select'}
              </button>
              {selectionMode && ownedNfts.length > 0 && (
                <button className={styles.selectAllBtn} onClick={selectAllNfts}>
                  Select All ({ownedNfts.length})
                </button>
              )}
            </div>
          </div>

          {/* Bulk Action Bar - Shows when NFTs are selected */}
          {selectionMode && selectedNfts.size > 0 && (
            <div className={styles.bulkActionBar}>
              <span className={styles.selectedCount}>{selectedNfts.size} selected</span>
              <div className={styles.bulkActions}>
                {showBulkCustomInput ? (
                  /* Custom wallet input for bulk transfer */
                  <div className={styles.bulkCustomRow}>
                    <input
                      type="text"
                      className={styles.bulkCustomInput}
                      placeholder="Enter wallet address..."
                      value={bulkCustomWallet}
                      onChange={(e) => setBulkCustomWallet(e.target.value)}
                    />
                    <button
                      className={styles.bulkTransferBtn}
                      onClick={() => {
                        if (bulkCustomWallet) {
                          bulkTransferNfts(bulkCustomWallet);
                          setBulkCustomWallet('');
                          setShowBulkCustomInput(false);
                        }
                      }}
                      disabled={!bulkCustomWallet}
                    >
                      <FaExchangeAlt /> Transfer
                    </button>
                    <button
                      className={styles.bulkCancelBtn}
                      onClick={() => {
                        setShowBulkCustomInput(false);
                        setBulkCustomWallet('');
                      }}
                    >
                      <FaTimes />
                    </button>
                  </div>
                ) : (
                  <>
                    <select
                      className={styles.bulkSelect}
                      value={bulkTransferTarget}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '__custom__') {
                          setShowBulkCustomInput(true);
                          setBulkTransferTarget('');
                        } else {
                          setBulkTransferTarget(value);
                        }
                      }}
                    >
                      <option value="">Transfer to...</option>
                      <option value="EEtCfR8kJxQ3ZVVtTSkVRXEkF4FfAyt9YnMSiXhtFMLJ">
                        LuxHub Vault
                      </option>
                      {vaultConfig?.operationalWallets?.map(
                        (w: { name: string; address: string }) => (
                          <option key={w.address} value={w.address}>
                            {w.name}
                          </option>
                        )
                      )}
                      {approvedVendors.map(
                        (v: {
                          _id: string;
                          businessName?: string;
                          username?: string;
                          wallet?: string;
                          walletAddress?: string;
                        }) => (
                          <option key={v._id} value={v.wallet || v.walletAddress || ''}>
                            {v.businessName || v.username || 'Vendor'}
                          </option>
                        )
                      )}
                      <option value="__custom__">Custom Address...</option>
                    </select>
                    <button
                      className={styles.bulkTransferBtn}
                      onClick={() => bulkTransferNfts(bulkTransferTarget)}
                      disabled={!bulkTransferTarget}
                    >
                      <FaExchangeAlt /> Transfer Selected
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Compact NFT Grid */}
          {ownedNfts.length > 0 ? (
            <div className={styles.compactGrid}>
              {ownedNfts.map((nft, index) => {
                const isSelected = selectedNfts.has(nft.mintAddress || '');
                const isTransferring = transferringNfts.has(nft.mintAddress || '');
                const vendorWallet = selectedVendorTransfer[nft.mintAddress || ''] || '';

                return (
                  <div
                    key={nft.mintAddress || index}
                    className={`${styles.compactCard} ${isSelected ? styles.selected : ''} ${isTransferring ? styles.transferring : ''}`}
                    onClick={
                      selectionMode ? () => toggleNftSelection(nft.mintAddress || '') : undefined
                    }
                  >
                    {/* Selection Checkbox */}
                    {selectionMode && (
                      <div className={styles.selectionCheckbox}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleNftSelection(nft.mintAddress || '')}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}

                    {/* Status Badge */}
                    <div
                      className={styles.compactBadge}
                      data-status={nft.marketStatus || 'pending'}
                    >
                      {nft.marketStatus || 'pending'}
                    </div>

                    {/* Image */}
                    <div className={styles.compactImageWrapper}>
                      <img
                        src={
                          nft.image?.startsWith('http')
                            ? nft.image
                            : nft.image?.startsWith('/')
                              ? nft.image
                              : '/fallback.png'
                        }
                        alt={nft.title}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/fallback.png';
                        }}
                      />
                      {isTransferring && (
                        <div className={styles.transferOverlay}>
                          <FaSpinner className={styles.spinnerIcon} />
                        </div>
                      )}
                    </div>

                    {/* Card Info */}
                    <div className={styles.compactInfo}>
                      <h4 className={styles.compactTitle}>{nft.title || 'Untitled'}</h4>
                      <div className={styles.compactMeta}>
                        <span className={styles.compactPrice}>{nft.priceSol?.toFixed(2)} SOL</span>
                        {nft.mintAddress && (
                          <span
                            className={styles.compactMint}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(`mint-${index}`, nft.mintAddress || '');
                            }}
                            title={nft.mintAddress}
                          >
                            {nft.mintAddress.slice(0, 4)}...{nft.mintAddress.slice(-4)}
                            <FaCopy size={10} />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Actions (hidden in selection mode) */}
                    {!selectionMode && (
                      <div className={styles.compactActions}>
                        {/* Transfer Section */}
                        {showCustomInput[nft.mintAddress || ''] ? (
                          /* Custom Wallet Input */
                          <>
                            <input
                              type="text"
                              className={styles.customWalletInput}
                              placeholder="Enter wallet address..."
                              value={customWalletInputs[nft.mintAddress || ''] || ''}
                              onChange={(e) => {
                                e.stopPropagation();
                                setCustomWalletInputs((prev) => ({
                                  ...prev,
                                  [nft.mintAddress || '']: e.target.value,
                                }));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              disabled={isTransferring}
                            />
                            <div className={styles.compactActionRow}>
                              <button
                                className={styles.compactTransferBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const customWallet = customWalletInputs[nft.mintAddress || ''];
                                  if (customWallet) {
                                    transferNft(nft.mintAddress!, customWallet);
                                  }
                                }}
                                disabled={
                                  !customWalletInputs[nft.mintAddress || ''] || isTransferring
                                }
                              >
                                <FaExchangeAlt /> Transfer
                              </button>
                              <button
                                className={styles.compactCancelBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowCustomInput((prev) => ({
                                    ...prev,
                                    [nft.mintAddress || '']: false,
                                  }));
                                  setCustomWalletInputs((prev) => {
                                    const next = { ...prev };
                                    delete next[nft.mintAddress || ''];
                                    return next;
                                  });
                                }}
                              >
                                <FaTimes /> Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          /* Vendor Dropdown + Actions */
                          <>
                            <select
                              className={styles.compactSelect}
                              value={vendorWallet}
                              onChange={(e) => {
                                e.stopPropagation();
                                const value = e.target.value;
                                if (value === '__custom__') {
                                  setShowCustomInput((prev) => ({
                                    ...prev,
                                    [nft.mintAddress || '']: true,
                                  }));
                                  setSelectedVendorTransfer((prev) => ({
                                    ...prev,
                                    [nft.mintAddress || '']: '',
                                  }));
                                } else {
                                  setSelectedVendorTransfer((prev) => ({
                                    ...prev,
                                    [nft.mintAddress || '']: value,
                                  }));
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              disabled={isTransferring}
                            >
                              <option value="">Select recipient...</option>
                              <option value="EEtCfR8kJxQ3ZVVtTSkVRXEkF4FfAyt9YnMSiXhtFMLJ">
                                LuxHub Vault
                              </option>
                              {approvedVendors.map(
                                (v: {
                                  _id: string;
                                  businessName?: string;
                                  username?: string;
                                  wallet?: string;
                                  walletAddress?: string;
                                }) => (
                                  <option key={v._id} value={v.wallet || v.walletAddress || ''}>
                                    {v.businessName || v.username || 'Vendor'}
                                  </option>
                                )
                              )}
                              <option value="__custom__">Custom Address...</option>
                            </select>
                            <div className={styles.compactActionRow}>
                              <button
                                className={styles.compactTransferBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (vendorWallet) {
                                    const vendor = approvedVendors.find(
                                      (v: { wallet?: string; walletAddress?: string }) =>
                                        (v.wallet || v.walletAddress) === vendorWallet
                                    );
                                    transferNft(nft.mintAddress!, vendorWallet, vendor?._id);
                                  }
                                }}
                                disabled={!vendorWallet || isTransferring}
                              >
                                <FaExchangeAlt /> Transfer
                              </button>
                              <button
                                className={styles.compactViewBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedMetadataUri(nft.metadataUri);
                                }}
                              >
                                <FaEye /> View
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <HiOutlineCollection size={48} opacity={0.3} />
              <p>No minted NFTs yet</p>
              <span>Mint NFTs in the Mint tab to see them here</span>
            </div>
          )}
        </div>
      )}

      {/* Transferred NFTs Tab - Custom cards with destination badges */}
      {activeTab === 'transferred' && (
        <div className={styles.mintedSection}>
          <div className={styles.sectionHeader}>
            <h2>Your Transferred NFTs</h2>
            <p className={styles.sectionSubtitle}>
              NFTs you minted and transferred to vendors or vaults
            </p>
          </div>

          {myTransferredNfts.length > 0 ? (
            <div className={styles.compactGrid}>
              {myTransferredNfts.map((nft, index) => {
                const recipientName = nft.currentOwner
                  ? getRecipientName(nft.currentOwner)
                  : 'Unknown';
                const isVault =
                  nft.currentOwner === 'EEtCfR8kJxQ3ZVVtTSkVRXEkF4FfAyt9YnMSiXhtFMLJ' ||
                  vaultConfig?.operationalWallets?.some(
                    (w: { address: string }) => w.address === nft.currentOwner
                  );
                const isVendor = approvedVendors.some(
                  (v: { wallet?: string; walletAddress?: string }) =>
                    (v.wallet || v.walletAddress) === nft.currentOwner
                );
                const destinationType = isVault ? 'vault' : isVendor ? 'vendor' : 'custom';

                return (
                  <div
                    key={`transferred-${nft.mintAddress || index}`}
                    className={`${styles.transferredCard} ${styles[`transferredCard_${destinationType}`]}`}
                  >
                    {/* Destination Badge */}
                    <div className={styles.destinationBadge} data-type={destinationType}>
                      {isVault ? 'Vault' : isVendor ? 'Vendor' : 'Custom'}
                    </div>

                    {/* Image */}
                    <div className={styles.transferredImageWrapper}>
                      <img
                        src={
                          nft.image?.startsWith('http')
                            ? nft.image
                            : nft.image?.startsWith('/')
                              ? nft.image
                              : '/fallback.png'
                        }
                        alt={nft.title}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/fallback.png';
                        }}
                      />
                      <div className={styles.transferredOverlay}>
                        <FaExchangeAlt className={styles.transferIcon} />
                      </div>
                    </div>

                    {/* Card Info */}
                    <div className={styles.transferredInfo}>
                      <h4 className={styles.transferredTitle}>{nft.title || 'Untitled'}</h4>
                      <div className={styles.transferredMeta}>
                        <span className={styles.transferredPrice}>
                          {nft.priceSol?.toFixed(2)} SOL
                        </span>
                      </div>
                      <div className={styles.transferredRecipient}>
                        <span className={styles.recipientLabel}>Sent to:</span>
                        <span className={styles.recipientValue} title={nft.currentOwner || ''}>
                          {recipientName !== 'Custom Address'
                            ? recipientName
                            : `${nft.currentOwner?.slice(0, 6)}...${nft.currentOwner?.slice(-4)}`}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className={styles.transferredActions}>
                      {nft.mintAddress && (
                        <span
                          className={styles.transferredMint}
                          onClick={() => handleCopy(`transferred-${index}`, nft.mintAddress || '')}
                          title={nft.mintAddress}
                        >
                          {nft.mintAddress.slice(0, 4)}...{nft.mintAddress.slice(-4)}
                          <FaCopy size={10} />
                        </span>
                      )}
                      <button
                        className={styles.transferredViewBtn}
                        onClick={() => setSelectedMetadataUri(nft.metadataUri)}
                        title="View Details"
                      >
                        <FaEye />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <HiOutlineSwitchHorizontal size={48} opacity={0.3} />
              <p>No transferred NFTs yet</p>
              <span>NFTs you mint and transfer will appear here</span>
            </div>
          )}
        </div>
      )}

      {/* NFT Detail Modal */}
      {selectedMetadataUri && (
        <div className={styles.detailOverlay}>
          <div className={styles.detailContainer}>
            <button className={styles.closeButton} onClick={() => setSelectedMetadataUri(null)}>
              Close
            </button>
            <NftDetailCard
              metadataUri={selectedMetadataUri}
              mintAddress={
                mintedNFTs.find((n) => n.metadataUri === selectedMetadataUri)?.mintAddress ??
                undefined
              }
              onClose={() => setSelectedMetadataUri(null)}
            />
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className={styles.modalBackdrop} onClick={() => setShowPreview(false)}>
          <div className={styles.modalWrapper} onClick={(e) => e.stopPropagation()}>
            <NftDetailCard
              onClose={() => setShowPreview(false)}
              previewData={{
                title,
                description,
                image: imageUri || resolveImageUrl(fileCid, gateway),
                priceSol,
                attributes: [
                  { trait_type: 'Brand', value: brand },
                  { trait_type: 'Model', value: model },
                  { trait_type: 'Serial Number', value: serialNumber },
                  { trait_type: 'Material', value: material },
                  { trait_type: 'Production Year', value: productionYear },
                  { trait_type: 'Movement', value: movement },
                  { trait_type: 'Water Resistance', value: waterResistance },
                  { trait_type: 'Dial Color', value: dialColor },
                  { trait_type: 'Country', value: country },
                  { trait_type: 'Release Date', value: releaseDate },
                  { trait_type: 'Box & Papers', value: boxPapers },
                  { trait_type: 'Condition', value: condition },
                  { trait_type: 'Warranty Info', value: warrantyInfo },
                  { trait_type: 'Certificate', value: certificate },
                  { trait_type: 'Features', value: features },
                  { trait_type: 'Limited Edition', value: limitedEdition },
                ],
              }}
            />
          </div>
        </div>
      )}

      {/* Mobile Preview Toggle (only shows on mint tab in single mode) */}
      {activeTab === 'mint' && mintMode === 'single' && (
        <>
          <button
            className={`${styles.mobilePreviewToggle} ${mobilePreviewOpen ? styles.active : ''}`}
            onClick={() => setMobilePreviewOpen(!mobilePreviewOpen)}
            aria-label={mobilePreviewOpen ? 'Close preview' : 'Open preview'}
          >
            {mobilePreviewOpen ? <FaTimes /> : <FaEye />}
          </button>

          {/* Backdrop */}
          <div
            className={`${styles.mobilePreviewBackdrop} ${mobilePreviewOpen ? styles.visible : ''}`}
            onClick={() => setMobilePreviewOpen(false)}
          />

          {/* Mobile Preview Drawer */}
          <div className={`${styles.mobilePreviewDrawer} ${mobilePreviewOpen ? styles.open : ''}`}>
            <div className={styles.drawerHeader}>
              <span className={styles.drawerTitle}>NFT Preview</span>
              <button className={styles.drawerClose} onClick={() => setMobilePreviewOpen(false)}>
                <FaTimes />
              </button>
            </div>
            <div className={styles.mobilePreviewContent}>
              <NFTPreviewCard
                fileCid={fileCid}
                title={title}
                description={description}
                priceSol={priceSol}
                brand={brand}
                onViewDetails={() => {
                  setMobilePreviewOpen(false);
                  setShowPreview(true);
                }}
              />
              {minting && (
                <div className={styles.mintProgressContainer}>
                  <p>{statusMessage}</p>
                  <div className={styles.progressBar}>
                    <div className={styles.progress} style={{ width: `${progress}%` }} />
                  </div>
                  <p>{progress}%</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export async function getServerSideProps() {
  try {
    const dbConnect = (await import('@/lib/database/mongodb')).default;
    await dbConnect();

    const { Asset } = await import('../lib/models/Assets');
    const NFT = (await import('../lib/models/NFT')).default;

    // Fetch from both collections
    const assets = await Asset.find({ deleted: false }).lean();
    const nfts = await NFT.find({}).lean();

    let solPrice = 150;
    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
      );
      if (res.ok) {
        const data = await res.json();
        solPrice = data.solana.usd;
      }
    } catch (err) {
      console.error('Failed to fetch SOL price:', err);
    }

    const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || fallbackGateway;

    // Create a map of mintAddress -> NFT image for fallback lookup
    const nftImageMap = new Map<string, string>();
    for (const nft of nfts) {
      if (nft.mintAddress && nft.image) {
        nftImageMap.set(nft.mintAddress, nft.image);
      }
    }

    // Map assets to MintedNFT format
    const mintedFromAssets: MintedNFT[] = assets.map((asset: any) => {
      // Try asset imageIpfsUrls first, then fall back to NFT collection image
      const assetImage = asset.imageIpfsUrls?.[0];
      const nftImage = asset.nftMint ? nftImageMap.get(asset.nftMint) : undefined;
      const imageSource = assetImage || nftImage;

      return {
        title: asset.model || 'Untitled',
        description: asset.description || '',
        image: resolveImageUrl(imageSource, gateway),
        priceSol: asset.priceUSD ? asset.priceUSD / solPrice : 0,
        metadataUri: asset.metadataIpfsUrl || '',
        mintAddress: asset.nftMint || null,
        currentOwner: asset.nftOwnerWallet || null,
        mintedBy: asset.mintedBy || asset.metaplexMetadata?.creator || null,
        ipfs_pin_hash: asset.imageIpfsUrls?.[0] || null,
        marketStatus: asset.status || null,
        updatedAt: asset.updatedAt ? new Date(asset.updatedAt).toISOString() : null,
        assetId: asset._id?.toString() || null,
        escrowPda: asset.escrowPda || null,
      };
    });

    // Map NFTs to MintedNFT format (for NFTs not in assets collection)
    const assetMints = new Set(assets.map((a: any) => a.nftMint).filter(Boolean));
    const mintedFromNfts: MintedNFT[] = nfts
      .filter((nft: any) => nft.mintAddress && !assetMints.has(nft.mintAddress))
      .map((nft: any) => ({
        title: nft.name || nft.title || 'Untitled',
        description: nft.description || '',
        image: resolveImageUrl(nft.image, gateway),
        priceSol: nft.priceSol || (nft.priceUSD ? nft.priceUSD / solPrice : 0),
        metadataUri: nft.metadataUri || nft.uri || '',
        mintAddress: nft.mintAddress || null,
        currentOwner: nft.currentOwner || nft.ownerWallet || nft.owner || null,
        mintedBy: nft.mintedBy || nft.vendorWallet || null,
        ipfs_pin_hash: nft.ipfsCid || null,
        marketStatus: nft.marketStatus || nft.status || null,
        updatedAt: nft.updatedAt ? new Date(nft.updatedAt).toISOString() : null,
        assetId: nft.assetId?.toString() || null,
        escrowPda: nft.escrowPda || null,
      }));

    // Combine both, removing duplicates by mintAddress
    const allMinted = [...mintedFromAssets, ...mintedFromNfts];

    return {
      props: {
        initialMintedNFTs: allMinted,
        initialSolPrice: solPrice,
      },
    };
  } catch (err) {
    console.error('getServerSideProps error:', err);
    return {
      props: {
        initialMintedNFTs: [],
        initialSolPrice: 150,
      },
    };
  }
}

export default CreateNFT;
