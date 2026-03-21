import React, { useEffect, useState, useMemo } from 'react';
import styles from '../../styles/NFTDetailCard.module.css';
import { FaTimes, FaCopy } from 'react-icons/fa';
import { LuBadgeCheck, LuGem } from 'react-icons/lu';
import { Connection, PublicKey } from '@solana/web3.js';
import { useUserRole } from '../../hooks/useUserRole';
import { usePriceDisplay } from '../marketplace/PriceDisplay';
import { resolveImageUrl, resolveAssetImage, PLACEHOLDER_IMAGE } from '../../utils/imageUtils';
import ImageGallery from './ImageGallery';

// Dynamic import for Metaplex (only loaded when needed - ~87KB saved for previewData cases)
const loadMetaplex = async () => {
  const { Metaplex } = await import('@metaplex-foundation/js');
  return Metaplex;
};

// Dynamic import for mpl-core (for new NFT format)
const loadMplCore = async () => {
  const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
  const { fetchAsset } = await import('@metaplex-foundation/mpl-core');
  const { publicKey } = await import('@metaplex-foundation/umi');
  return { createUmi, fetchAsset, publicKey };
};

export interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url?: string;
  attributes?: { trait_type: string; value: string }[];
  seller_fee_basis_points: number;
  animation_url?: string;
  properties: {
    creators: { address: string; share: number }[];
    files: { uri: string; type: string }[];
    category?: string;
    background_color?: string;
    collection?: {
      name: string;
      family: string;
    };
  };
  mintAddress?: string;
  owner?: string;
  marketStatus?: string;
  priceSol?: number;
}

interface NftDetailCardProps {
  metadataUri?: string;
  mintAddress?: string;
  previewData?: {
    title: string;
    image: string;
    imageUrl?: string;
    imageIpfsUrls?: string[];
    images?: string[];
    description: string;
    priceSol: number;
    attributes: { trait_type: string; value: string }[];
  };
  priceSol?: number;
  owner?: string;
  onClose: () => void;
  showContactButton?: boolean;
  // Role-based action props
  buyerWallet?: string;
  onBuy?: () => void;
  onOffer?: () => void;
  onDelist?: () => void;
  onEdit?: () => void;
  status?: 'listed' | 'escrow' | 'sold' | 'verified';
  acceptingOffers?: boolean;
}

// Attributes to exclude from the details grid (shown elsewhere in the UI)
const EXCLUDED_ATTRIBUTES = new Set(['Brand', 'Price', 'Price USD', 'Price SOL', 'Current Owner']);

export const NftDetailCard: React.FC<NftDetailCardProps> = ({
  metadataUri,
  mintAddress,
  previewData,
  priceSol,
  owner,
  onClose,
  buyerWallet,
  onBuy,
  onOffer,
  onDelist,
  onEdit,
  status = 'listed',
  acceptingOffers = true,
}) => {
  const [metadata, setMetadata] = useState<NFTMetadata | null>(null);
  const [loading, setLoading] = useState<boolean>(!!metadataUri && !previewData);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { formatPrice, displayInUSD, toggleDisplay } = usePriceDisplay();
  const { walletAddress: connectedWallet, isConnected: walletConnected } = useUserRole();

  // Role-based logic — use useUserRole (supports Privy + wallet adapter), fall back to prop
  const walletAddress = buyerWallet || connectedWallet;
  const isConnected = !!buyerWallet || walletConnected;
  const isOwner = useMemo(
    () => !!(walletAddress && metadata?.owner && walletAddress === metadata.owner),
    [walletAddress, metadata?.owner]
  );
  const isListed = status === 'listed';

  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  // Metadata fetching - optimized with dynamic imports
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        let uri = metadataUri;
        const { getClusterConfig } = await import('@/lib/solana/clusterConfig');
        const rpcEndpoint = getClusterConfig().endpoint;

        if (!uri && mintAddress) {
          // Try mpl-core first (new NFT format)
          try {
            const { createUmi, fetchAsset, publicKey } = await loadMplCore();
            const umi = createUmi(rpcEndpoint);
            const asset = await fetchAsset(umi, publicKey(mintAddress));
            uri = asset.uri;
          } catch {
            // Fall back to Metaplex for old NFTs
            const connection = new Connection(rpcEndpoint);
            const Metaplex = await loadMetaplex();
            const metaplex = Metaplex.make(connection);
            const nft = await metaplex
              .nfts()
              .findByMint({ mintAddress: new PublicKey(mintAddress) });
            uri = nft.uri;
          }
        }

        if (!uri) return;

        const res = await fetch(uri);
        const json = await res.json();

        setMetadata((prev) => ({
          ...json,
          priceSol: parseFloat(
            json.priceSol ??
              json.attributes?.find((a: any) => a.trait_type === 'Price')?.value ??
              json.attributes?.find((a: any) => a.trait_type === 'Price USD')?.value ??
              prev?.priceSol ??
              priceSol?.toString() ??
              '0'
          ),
          owner:
            json.owner ??
            json.attributes?.find((a: any) => a.trait_type === 'Current Owner')?.value ??
            prev?.owner ??
            owner,
          mintAddress: mintAddress ?? prev?.mintAddress,
        }));
      } catch (err) {
        console.error('Failed to fetch metadata:', err);
      } finally {
        setLoading(false);
      }
    };

    if (!previewData) {
      fetchMetadata();
    }
  }, [metadataUri, mintAddress, previewData, priceSol, owner]);

  // Handle previewData
  useEffect(() => {
    if (previewData && !metadata) {
      const resolvedPreviewImage = resolveAssetImage({
        imageUrl: previewData.imageUrl,
        images: previewData.images,
        imageIpfsUrls: previewData.imageIpfsUrls,
        image: previewData.image,
      });

      setMetadata({
        name: previewData.title,
        symbol: '',
        description: previewData.description,
        image: resolvedPreviewImage,
        seller_fee_basis_points: 500,
        attributes: previewData.attributes,
        priceSol: previewData.priceSol,
        properties: {
          creators: [],
          files: [],
        },
      });
      setLoading(false);
    }
  }, [previewData, metadata]);

  // Show all attributes except ones already displayed elsewhere
  const displayAttributes = useMemo(
    () =>
      (metadata?.attributes || []).filter(
        (a) => a.value && a.value !== '~' && !EXCLUDED_ATTRIBUTES.has(a.trait_type)
      ),
    [metadata?.attributes]
  );

  // Build gallery images from all available sources
  const galleryImages = useMemo(() => {
    const imgs: string[] = [];
    if (previewData?.images?.length) {
      imgs.push(...previewData.images);
    }
    if (previewData?.imageIpfsUrls?.length) {
      imgs.push(...previewData.imageIpfsUrls);
    }
    return [...new Set(imgs)];
  }, [previewData]);

  // Primary image for gallery
  const primaryImageUrl =
    previewData?.image || previewData?.imageUrl || metadata?.image || PLACEHOLDER_IMAGE;

  // Loading state
  if (loading) {
    return (
      <div className={styles.modalBackdrop}>
        <div className={styles.luxuryLoader}>
          <div className={styles.loaderDiamond}>
            <LuGem />
          </div>
          <div className={styles.loaderRing}></div>
          <span className={styles.loaderText}>Authenticating</span>
        </div>
      </div>
    );
  }

  if (!metadata) return null;

  const resolvedImage = resolveImageUrl(metadata.image);

  const truncate = (value: string, length: number = 10) => {
    if (!value || typeof value !== 'string') return '~';
    return value.length > length ? `${value.slice(0, 4)}...${value.slice(-4)}` : value;
  };

  const getAttr = (type: string) => {
    return metadata.attributes?.find((a) => a.trait_type === type)?.value || '';
  };

  // Get brand from attributes
  const brand = getAttr('Brand');

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      {/* Product Modal */}
      <div className={styles.productModal} onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button className={styles.closeButton} onClick={onClose}>
          <FaTimes />
        </button>

        <div className={styles.productLayout}>
          {/* Image Section — Gallery */}
          <div className={styles.imageSection}>
            <ImageGallery
              images={galleryImages}
              primaryImage={primaryImageUrl}
              alt={metadata?.name || previewData?.title || 'Watch'}
            />

            {/* Status badge */}
            <div className={styles.statusBadge}>
              <LuBadgeCheck />
              <span>
                {status === 'listed'
                  ? 'Listed'
                  : status === 'escrow'
                    ? 'In Escrow'
                    : status === 'sold'
                      ? 'Sold'
                      : 'Verified'}
              </span>
            </div>
          </div>

          {/* Details Section */}
          <div className={styles.detailsSection}>
            {brand && <span className={styles.brandLabel}>{brand}</span>}
            <h2 className={styles.productTitle}>{metadata.name}</h2>

            {metadata.description && <p className={styles.description}>{metadata.description}</p>}

            {/* Condition label */}
            {previewData?.attributes?.find((a) => a.trait_type === 'Condition')?.value && (
              <span className={styles.conditionLabel}>
                Condition: {previewData.attributes.find((a) => a.trait_type === 'Condition')!.value}
              </span>
            )}

            {/* Price + Actions — together */}
            <div className={styles.priceActionBlock}>
              <div className={styles.priceRow}>
                <span className={styles.priceValue}>
                  {(() => {
                    // Get USD price from attributes first (most reliable)
                    const usdAttr = getAttr('Price USD') || getAttr('Estimated Value');
                    const priceUsdNum = usdAttr ? parseFloat(usdAttr.replace(/[^0-9.]/g, '')) : 0;
                    if (priceUsdNum > 0) {
                      return `$${priceUsdNum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                    }
                    // Fallback to priceSol (which may actually be USD from metadata)
                    const raw = metadata.priceSol ?? 0;
                    if (raw > 1000) {
                      // Likely USD
                      return `$${raw.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                    }
                    return `${raw.toFixed(2)} SOL`;
                  })()}
                </span>
                <span className={styles.priceLabel}>
                  {(() => {
                    const usdAttr = getAttr('Price USD') || getAttr('Estimated Value');
                    const priceUsdNum = usdAttr ? parseFloat(usdAttr.replace(/[^0-9.]/g, '')) : 0;
                    if (priceUsdNum > 0) return 'USD';
                    const raw = metadata.priceSol ?? 0;
                    return raw > 1000 ? 'USD' : 'SOL';
                  })()}
                </span>
              </div>

              {/* Actions right next to price */}
              <div className={styles.actionRow}>
                {isConnected && !isOwner && isListed && (
                  <>
                    {acceptingOffers && (
                      <button
                        className={`${styles.actionBtn} ${styles.offerBtn}`}
                        onClick={onOffer}
                      >
                        Offer
                      </button>
                    )}
                    <button className={`${styles.actionBtn} ${styles.buyBtn}`} onClick={onBuy}>
                      Buy
                    </button>
                  </>
                )}
                {isConnected && isOwner && (
                  <>
                    <button className={`${styles.actionBtn} ${styles.editBtn}`} onClick={onEdit}>
                      Edit
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.delistBtn}`}
                      onClick={onDelist}
                    >
                      Delist
                    </button>
                  </>
                )}
                {!isConnected && isListed && (
                  <span className={styles.connectPrompt}>Connect wallet to purchase</span>
                )}
              </div>
            </div>

            {/* Attributes / Specifications */}
            {displayAttributes.length > 0 && (
              <div className={styles.specSection}>
                <h4 className={styles.specTitle}>Details</h4>
                <div className={styles.specGrid}>
                  {displayAttributes.map((attr) => (
                    <div className={styles.specCard} key={attr.trait_type}>
                      <span className={styles.specLabel}>{attr.trait_type}</span>
                      <span className={styles.specValue}>{attr.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mint & Owner addresses */}
            {(metadata.mintAddress || metadata.owner) && (
              <div className={styles.addressRow}>
                {metadata.mintAddress && (
                  <div
                    className={`${styles.addressChip} ${copiedField === 'mint' ? styles.copied : ''}`}
                    onClick={() => handleCopy('mint', metadata.mintAddress ?? '')}
                  >
                    <div>
                      <div className={styles.addressChipLabel}>Mint</div>
                      <div className={styles.addressChipValue}>
                        {truncate(metadata.mintAddress)}
                      </div>
                    </div>
                    <FaCopy className={styles.copyIcon} />
                  </div>
                )}
                {metadata.owner && (
                  <div
                    className={`${styles.addressChip} ${copiedField === 'owner' ? styles.copied : ''}`}
                    onClick={() => handleCopy('owner', metadata.owner ?? '')}
                  >
                    <div>
                      <div className={styles.addressChipLabel}>Owner</div>
                      <div className={styles.addressChipValue}>{truncate(metadata.owner)}</div>
                    </div>
                    <FaCopy className={styles.copyIcon} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
