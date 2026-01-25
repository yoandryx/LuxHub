// src/pages/createNFT.tsx
import { useState, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplCore, transfer, fetchAsset } from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import { create as createAsset, update as updateAsset } from '@metaplex-foundation/mpl-core';
import { uploadToPinata } from '../utils/pinata';
import { createMetadata } from '../utils/metadata';
import { NftDetailCard } from '../components/marketplace/NftDetailCard';
import { NftForm } from '../components/admins/NftForm';
import styles from '../styles/CreateNFT.module.css';
import NFTPreviewCard from '../components/admins/NFTPreviewCard';
import { NFTGridCard } from '../components/common/UnifiedNFTCard';
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
  ipfs_pin_hash: string | null;
  marketStatus: string | null;
  updatedAt: string | null;
  assetId: string | null;
  escrowPda: string | null;
}

// CSV Row interface for bulk minting
interface CsvRow {
  title: string;
  description: string;
  brand: string;
  model: string;
  serialNumber: string;
  material?: string;
  productionYear?: string;
  priceSol: string;
  imageCid?: string;
  imageUrl?: string; // Support local images
  movement?: string;
  caseSize?: string;
  waterResistance?: string;
  dialColor?: string;
  country?: string;
  condition?: string;
  boxPapers?: string;
  [key: string]: string | undefined;
}

// Bulk mint result tracking
interface BulkMintResult {
  row: number;
  title: string;
  status: 'pending' | 'minting' | 'success' | 'error';
  mintAddress?: string;
  error?: string;
}

const fallbackGateway = 'https://gateway.pinata.cloud/ipfs/';

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
  const [marketStatus, setMarketStatus] = useState('inactive');
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
  const [currentVendorId, setCurrentVendorId] = useState<string>('luxhub_owned');
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  // Bulk minting state
  const [bulkCsvFile, setBulkCsvFile] = useState<File | null>(null);
  const [bulkMintResults, setBulkMintResults] = useState<BulkMintResult[]>([]);
  const [isBulkMinting, setIsBulkMinting] = useState(false);
  const [parsedCsvRows, setParsedCsvRows] = useState<CsvRow[]>([]);

  // Escrow creation state
  const [creatingEscrow, setCreatingEscrow] = useState<string | null>(null);
  const [escrowPrice, setEscrowPrice] = useState<{ [key: string]: string }>({});

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
    if (!wallet.publicKey) return alert('Connect wallet');
    if (!fileCid) return alert('Please upload an image first');
    if (!title) return alert('Please enter a title');

    setMinting(true);
    setProgress(0);
    setStatusMessage('Preparing to mint...');

    try {
      const umi = getUmi();

      // Run AI verification (non-blocking - vendor proceeds regardless)
      setProgress(5);
      setStatusMessage('Running AI verification...');
      await verifyListing();

      // Create metadata JSON
      setProgress(15);
      setStatusMessage('Creating metadata...');
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
        condition
      );

      // Upload to Pinata
      setProgress(30);
      setStatusMessage('Uploading metadata to IPFS...');
      const metadataUri = await uploadToPinata(metadataJson, title);
      setProgress(55);

      // Mint on-chain
      setStatusMessage('Minting Core NFT on Solana...');
      const assetSigner = generateSigner(umi);
      await createAsset(umi, {
        asset: assetSigner,
        name: title,
        uri: metadataUri,
      }).sendAndConfirm(umi);

      const mintAddress = assetSigner.publicKey.toString();
      setProgress(85);

      // Save to database
      setStatusMessage('Saving to database...');
      const newImage = fileCid ? `${gateway}${fileCid}` : '/fallback.png';

      // Optimistic update
      const newNft: MintedNFT = {
        title,
        description,
        image: newImage,
        priceSol,
        metadataUri,
        mintAddress,
        currentOwner: wallet.publicKey.toBase58(),
        ipfs_pin_hash: fileCid,
        marketStatus,
        updatedAt: new Date().toISOString(),
        assetId: null,
        escrowPda: null,
      };
      setMintedNFTs((prev) => [...prev, newNft]);

      // Save to MongoDB with AI verification data
      const response = await fetch('/api/assets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor: currentVendorId,
          model,
          serial: serialNumber,
          description,
          priceUSD: priceSol * solPrice,
          imageIpfsUrls: fileCid ? [fileCid] : [],
          metadataIpfsUrl: metadataUri,
          nftMint: mintAddress,
          nftOwnerWallet: wallet.publicKey.toBase58(),
          status: marketStatus,
          poolEligible,
          category: 'watches',
          // Include AI verification results if available
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
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'DB save failed');
      }

      const { asset } = await response.json();

      // Update with asset ID
      setMintedNFTs((prev) =>
        prev.map((n) => (n.mintAddress === mintAddress ? { ...n, assetId: asset._id } : n))
      );

      setProgress(100);
      setStatusMessage('Minted successfully!');

      // Reset form after successful mint
      setTimeout(() => {
        resetForm();
      }, 2000);
    } catch (error: any) {
      console.error('Mint error:', error);
      setStatusMessage(`Mint failed: ${error.message || 'Unknown error'}`);
      // Rollback optimistic update on complete failure
      setMintedNFTs((prev) => prev.filter((n) => n.title !== title || n.ipfs_pin_hash !== fileCid));
    } finally {
      setMinting(false);
    }
  };

  // Reset form
  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setFileCid('');
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
      if (!file) return;

      setBulkCsvFile(file);
      try {
        const rows = await parseCsvFile(file);
        setParsedCsvRows(rows);
        setBulkMintResults(
          rows.map((_, idx) => ({
            row: idx + 1,
            title: rows[idx].title,
            status: 'pending',
          }))
        );
      } catch (err: any) {
        alert(`Failed to parse CSV: ${err.message}`);
        setBulkCsvFile(null);
        setParsedCsvRows([]);
      }
    },
    [parseCsvFile]
  );

  // Bulk mint single item
  const mintSingleFromRow = useCallback(
    async (row: CsvRow, index: number): Promise<BulkMintResult> => {
      const result: BulkMintResult = {
        row: index + 1,
        title: row.title,
        status: 'minting',
      };

      setBulkMintResults((prev) => prev.map((r, i) => (i === index ? result : r)));

      try {
        if (!wallet.publicKey) throw new Error('Wallet not connected');

        const umi = getUmi();

        // Create metadata
        const metadataJson = createMetadata(
          row.title,
          row.description || '',
          row.imageCid || '',
          wallet.publicKey.toBase58(),
          row.brand,
          row.model,
          row.serialNumber,
          row.material || '',
          row.productionYear || '',
          '',
          '',
          '',
          wallet.publicKey.toBase58(),
          '',
          '',
          '',
          '',
          '',
          '',
          wallet.publicKey.toBase58(),
          'inactive',
          parseFloat(row.priceSol) || 0,
          '',
          ''
        );

        // Upload metadata
        const metadataUri = await uploadToPinata(metadataJson, row.title);

        // Mint NFT
        const assetSigner = generateSigner(umi);
        await createAsset(umi, {
          asset: assetSigner,
          name: row.title,
          uri: metadataUri,
        }).sendAndConfirm(umi);

        const mintAddress = assetSigner.publicKey.toString();

        // Save to DB
        await fetch('/api/assets/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendor: currentVendorId,
            model: row.model,
            serial: row.serialNumber,
            description: row.description,
            priceUSD: (parseFloat(row.priceSol) || 0) * solPrice,
            imageIpfsUrls: row.imageCid ? [row.imageCid] : [],
            metadataIpfsUrl: metadataUri,
            nftMint: mintAddress,
            nftOwnerWallet: wallet.publicKey.toBase58(),
            status: 'inactive',
            poolEligible: true, // All NFTs are pool eligible by default
          }),
        });

        // Add to minted list
        const newNft: MintedNFT = {
          title: row.title,
          description: row.description || '',
          image: row.imageCid ? `${gateway}${row.imageCid}` : '/fallback.png',
          priceSol: parseFloat(row.priceSol) || 0,
          metadataUri,
          mintAddress,
          currentOwner: wallet.publicKey.toBase58(),
          ipfs_pin_hash: row.imageCid || null,
          marketStatus: 'inactive',
          updatedAt: new Date().toISOString(),
          assetId: null,
          escrowPda: null,
        };
        setMintedNFTs((prev) => [...prev, newNft]);

        return { ...result, status: 'success', mintAddress };
      } catch (err: any) {
        return { ...result, status: 'error', error: err.message };
      }
    },
    [wallet, getUmi, gateway, currentVendorId, solPrice]
  );

  // Bulk mint from CSV
  const bulkMintFromCsv = async () => {
    if (!bulkCsvFile || parsedCsvRows.length === 0) return;
    if (!wallet.publicKey) return alert('Connect wallet');

    setIsBulkMinting(true);
    const limit = pLimit(2); // Process 2 at a time to avoid rate limits

    try {
      const mintPromises = parsedCsvRows.map((row, index) =>
        limit(async () => {
          const result = await mintSingleFromRow(row, index);
          setBulkMintResults((prev) => prev.map((r, i) => (i === index ? result : r)));
          return result;
        })
      );

      await Promise.all(mintPromises);
    } catch (err) {
      console.error('Bulk mint error:', err);
    } finally {
      setIsBulkMinting(false);
    }
  };

  // Transfer NFT
  const transferNft = async (mintAddress: string, newOwner: string) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      return alert('Connect wallet');
    }

    if (!isValidSolanaAddress(newOwner)) {
      return alert('Invalid wallet address');
    }

    setTransferringNfts((prev) => new Set(prev).add(mintAddress));

    try {
      const umi = getUmi();

      // Fetch the asset
      const asset = await fetchAsset(umi, umiPublicKey(mintAddress));

      // Transfer using mpl-core
      await transfer(umi, {
        asset,
        newOwner: umiPublicKey(newOwner),
      }).sendAndConfirm(umi);

      // Update database
      const response = await fetch('/api/nft/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintAddress,
          newOwnerWallet: newOwner,
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

      // Clear transfer input
      setTransferInputs((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (key.includes(mintAddress)) delete next[key];
        });
        return next;
      });

      alert('Transfer successful!');
    } catch (err: any) {
      console.error('Transfer error:', err);
      alert(`Transfer failed: ${err.message}`);
    } finally {
      setTransferringNfts((prev) => {
        const next = new Set(prev);
        next.delete(mintAddress);
        return next;
      });
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
        condition
      );

      // Upload new metadata
      const newUri = await uploadToPinata(updatedJson, title);

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

      // Update local state
      const newImage = fileCid ? `${gateway}${fileCid}` : editingNft.image;
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
    setMarketStatus(nft.marketStatus || 'inactive');
    setActiveTab('mint');
  }, []);

  // Filter NFTs
  const ownedNfts = useMemo(
    () => mintedNFTs.filter((n) => n.currentOwner === adminWallet),
    [mintedNFTs, adminWallet]
  );

  const transferredNfts = useMemo(
    () => mintedNFTs.filter((n) => n.currentOwner !== adminWallet),
    [mintedNFTs, adminWallet]
  );

  // Validate CSV rows for bulk minting
  const validCsvRows = useMemo(
    () =>
      parsedCsvRows.filter(
        (row) => row.title && row.brand && row.model && row.serialNumber && row.priceSol
      ),
    [parsedCsvRows]
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
                    <div className={styles.bulkStatItem}>
                      <span className={`${styles.bulkStatValue} ${styles.warning}`}>
                        {parsedCsvRows.length - validCsvRows.length}
                      </span>
                      <span className={styles.bulkStatLabel}>Issues</span>
                    </div>
                    <button
                      className={styles.mintButton}
                      onClick={bulkMintFromCsv}
                      disabled={isBulkMinting || !allRowsValid}
                    >
                      {isBulkMinting
                        ? 'Minting...'
                        : allRowsValid
                          ? `Mint ${validCsvRows.length} NFTs`
                          : `Fix ${parsedCsvRows.length - validCsvRows.length} Issues`}
                    </button>
                  </div>
                )}
              </div>

              {/* Empty State */}
              {parsedCsvRows.length === 0 && (
                <div className={styles.bulkEmptyState}>
                  <FaUpload className={styles.bulkEmptyIcon} />
                  <h3>Upload a CSV to Get Started</h3>
                  <p>Required: title, brand, model, serialNumber, priceSol</p>
                  <p>Optional: description, imageUrl, material, movement, condition</p>
                </div>
              )}

              {/* Large Preview Grid */}
              {parsedCsvRows.length > 0 && (
                <div className={styles.bulkPreviewGridLarge}>
                  {parsedCsvRows.map((row, idx) => {
                    const result = bulkMintResults[idx];
                    const imageUrl = row.imageCid
                      ? `${gateway}${row.imageCid}`
                      : row.imageUrl || undefined;
                    const isValid = !!(
                      row.title &&
                      row.brand &&
                      row.model &&
                      row.serialNumber &&
                      row.priceSol
                    );

                    // Map bulk mint status to NFTStatus
                    const getStatus = (): NFTStatus => {
                      if (result?.status === 'minting') return 'minting';
                      if (result?.status === 'success') return 'verified';
                      if (result?.status === 'error') return 'error';
                      if (isValid) return 'ready';
                      return 'pending';
                    };

                    return (
                      <NFTGridCard
                        key={idx}
                        title={row.title || 'Untitled'}
                        image={imageUrl}
                        price={row.priceSol ? parseFloat(row.priceSol) : 0}
                        priceLabel="SOL"
                        brand={row.brand}
                        status={getStatus()}
                        isValid={isValid}
                      />
                    );
                  })}
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

      {/* Minted NFTs Tab */}
      {activeTab === 'minted' && (
        <div className={styles.mintedSection}>
          <h2>Your Minted NFTs</h2>
          <div className={styles.grid}>
            {ownedNfts.length > 0 ? (
              ownedNfts.map((nft, index) => {
                const uniqueKey = `${nft.mintAddress ?? 'nomint'}-${index}`;
                const newOwnerValue = transferInputs[uniqueKey] || '';
                const isTransferring = transferringNfts.has(nft.mintAddress || '');
                const isCreatingEscrow = creatingEscrow === nft.mintAddress;
                const escrowPriceValue = escrowPrice[nft.mintAddress || ''] || '';

                return (
                  <div key={uniqueKey} className={styles.nftCard}>
                    <img
                      src={nft.image?.startsWith('http') ? nft.image : '/fallback.png'}
                      alt={nft.title}
                    />
                    <h3>{nft.title}</h3>

                    <div className={styles.cardInfoHolder}>
                      <div className={styles.cardInfoHead}>Price:</div>
                      <p>{nft.priceSol.toFixed(3)} SOL</p>
                    </div>

                    {nft.marketStatus && (
                      <div className={styles.cardInfoHolder}>
                        <div className={styles.cardInfoHead}>Status:</div>
                        <p>{nft.marketStatus}</p>
                      </div>
                    )}

                    {nft.mintAddress && (
                      <div className={styles.cardInfoHolder}>
                        <div className={styles.cardInfoHead}>Mint:</div>
                        <div className={styles.copyWrapper}>
                          <p
                            className={styles.copyableText}
                            onClick={() => handleCopy(`mint-${index}`, nft.mintAddress || '')}
                          >
                            {nft.mintAddress.slice(0, 4)}...{nft.mintAddress.slice(-4)}
                            <FaCopy style={{ marginLeft: '6px' }} />
                            <span className={styles.tooltip}>
                              {copiedField === `mint-${index}` ? 'Copied!' : 'Copy'}
                            </span>
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Transfer Section */}
                    <div className={styles.transferSection}>
                      <div>
                        <FaExchangeAlt /> Transfer NFT
                      </div>
                      <input
                        className={styles.transferInput}
                        type="text"
                        placeholder="Recipient wallet address..."
                        value={newOwnerValue}
                        onChange={(e) =>
                          handleTransferInputChange(uniqueKey, e.target.value.trim())
                        }
                        disabled={isTransferring}
                      />
                      {newOwnerValue && !isValidSolanaAddress(newOwnerValue) && (
                        <p className={styles.transferWarning}>Invalid wallet address</p>
                      )}
                      <button
                        onClick={() => transferNft(nft.mintAddress!, newOwnerValue)}
                        disabled={!isValidSolanaAddress(newOwnerValue) || isTransferring}
                      >
                        {isTransferring ? 'Transferring...' : 'Transfer'}
                      </button>
                    </div>

                    {/* Escrow Section */}
                    {nft.assetId && !nft.escrowPda && (
                      <div className={styles.transferSection}>
                        <div>
                          <FaLock /> Create Escrow Listing
                        </div>
                        <input
                          className={styles.transferInput}
                          type="number"
                          placeholder="Listing price (USD)..."
                          value={escrowPriceValue}
                          onChange={(e) =>
                            handleEscrowPriceChange(nft.mintAddress || '', e.target.value)
                          }
                          disabled={isCreatingEscrow}
                        />
                        <button
                          onClick={() => createEscrowForNft(nft)}
                          disabled={isCreatingEscrow || !escrowPriceValue}
                        >
                          {isCreatingEscrow ? 'Creating...' : 'Create Escrow'}
                        </button>
                      </div>
                    )}

                    {nft.escrowPda && (
                      <div className={styles.cardInfoHolder}>
                        <div className={styles.cardInfoHead}>Escrow:</div>
                        <p style={{ color: '#4ade80' }}>Active</p>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button onClick={() => setSelectedMetadataUri(nft.metadataUri)}>
                        View Details
                      </button>
                      <button onClick={() => startEditing(nft)}>Edit</button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p>No minted NFTs yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Transferred NFTs Tab */}
      {activeTab === 'transferred' && (
        <div className={styles.mintedSection}>
          <h2>Transferred NFTs</h2>
          <div className={styles.grid}>
            {transferredNfts.length > 0 ? (
              transferredNfts.map((nft, index) => (
                <div key={index} className={styles.nftCard}>
                  <img src={nft.image} alt={nft.title} />
                  <h3>{nft.title}</h3>
                  <div className={styles.cardInfoHolder}>
                    <div className={styles.cardInfoHead}>Owner:</div>
                    <p>
                      {nft.currentOwner?.slice(0, 4)}...{nft.currentOwner?.slice(-4)}
                    </p>
                  </div>
                  <button onClick={() => setSelectedMetadataUri(nft.metadataUri)}>
                    View Details
                  </button>
                </div>
              ))
            ) : (
              <p>No transferred NFTs yet.</p>
            )}
          </div>
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
                image: `${gateway}${fileCid}`,
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

    const assets = await Asset.find({ deleted: false }).lean();

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

    const minted: MintedNFT[] = assets.map((asset: any) => ({
      title: asset.model || 'Untitled',
      description: asset.description || '',
      image: asset.imageIpfsUrls?.[0] ? `${gateway}${asset.imageIpfsUrls[0]}` : '/fallback.png',
      priceSol: asset.priceUSD ? asset.priceUSD / solPrice : 0,
      metadataUri: asset.metadataIpfsUrl || '',
      mintAddress: asset.nftMint || null,
      currentOwner: asset.nftOwnerWallet || null,
      ipfs_pin_hash: asset.imageIpfsUrls?.[0] || null,
      marketStatus: asset.status || null,
      updatedAt: asset.updatedAt ? new Date(asset.updatedAt).toISOString() : null,
      assetId: asset._id?.toString() || null,
      escrowPda: asset.escrowPda || null,
    }));

    return {
      props: {
        initialMintedNFTs: minted,
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
