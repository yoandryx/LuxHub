import { useEffect, useState } from 'react';
import styles from '../styles/LuxhubHolders.module.css';
import NFTCard from '../components/marketplace/NFTCard';
import { NftDetailCard } from '../components/marketplace/NftDetailCard';

interface NFT {
  nftId: string;
  fileCid: string;
  salePrice: number;
  timestamp: number;
  seller: string;
  buyer: string;
  marketStatus: string;
  image?: string;
  title?: string;
  attributes?: { trait_type: string; value: string }[];
}

const LuxhubHolders = () => {
  const [holderNFTs, setHolderNFTs] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalNFT, setModalNFT] = useState<NFT | null>(null);

  const fetchAllHoldersNFTs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/nft/holders');
      const raw = await res.json();

      const enriched = await Promise.all(
        raw.map(async (nft: NFT) => {
          try {
            const metaRes = await fetch(`https://gateway.pinata.cloud/ipfs/${nft.fileCid}`);
            const metadata = await metaRes.json();
            const ownerAttr =
              metadata.attributes?.find((a: any) => a.trait_type === 'Owner')?.value || '';

            return {
              ...nft,
              image: metadata.image,
              title: metadata.name || 'Lux NFT',
              attributes: metadata.attributes || [],
              owner: ownerAttr, // ✅ Add this line
            };
          } catch (e) {
            console.warn(`Metadata fetch failed for: ${nft.nftId}`);
            return { ...nft, image: null, title: 'Unnamed NFT' };
          }
        })
      );

      setHolderNFTs(enriched);
    } catch (e) {
      console.error('Error fetching NFTs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllHoldersNFTs();
  }, []);

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>LuxHub.Holders</h1>
      <p className={styles.subheading}>A public showcase of NFTs held by LuxHub collectors.</p>

      <div className={styles.filterContainer}>
        <select className={styles.filterSelect}>
          <option value="all">All Collections</option>
          <option value="ap">Audemars Piguet</option>
          <option value="rolex">Rolex</option>
          <option value="hublot">Hublot</option>
        </select>
      </div>

      <div className={styles.holderGrid}>
        {holderNFTs.map((nft, i) => (
          <NFTCard key={i} nft={nft} onClick={() => setModalNFT(nft)} />
        ))}
      </div>

      {modalNFT && (
        <div className={styles.detailOverlay}>
          <div className={styles.detailContainer}>
            <button className={styles.closeButton} onClick={() => setModalNFT(null)}>
              Close
            </button>
            <NftDetailCard
              metadataUri={`https://gateway.pinata.cloud/ipfs/${modalNFT.fileCid}`}
              priceSol={modalNFT.salePrice}
              owner={modalNFT.buyer} // ← or modalNFT.owner if you add that to enriched NFTs
              onClose={() => setModalNFT(null)}
              showContactButton
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default LuxhubHolders;
