// /src/pages/luxhubHolders.tsx
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import styles from "../styles/LuxhubHolders.module.css";

interface NFT {
  nftId: string;
  fileCid: string;
  salePrice: number;
  timestamp: number;
  seller: string;
  buyer: string;
  marketStatus: string;
}

const LuxhubHolders = () => {
  const wallet = useWallet();
  const [ownedNFTs, setOwnedNFTs] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOwnedNFTs = async () => {
    if (!wallet.publicKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/nft/ownedByWallet?wallet=${wallet.publicKey.toBase58()}`);
      const data = await res.json();
      setOwnedNFTs(data || []);
    } catch (e) {
      console.error("Failed to fetch owned NFTs", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (wallet.publicKey) fetchOwnedNFTs();
  }, [wallet.publicKey]);

  return (
    <div className={styles.container}>
      <h1>My LuxHub NFTs</h1>
      {!wallet.publicKey ? (
        <p>Please connect your wallet to view your NFTs.</p>
      ) : loading ? (
        <p>Loading your NFTs...</p>
      ) : ownedNFTs.length === 0 ? (
        <p>You don’t own any NFTs yet.</p>
      ) : (
        <div className={styles.nftGrid}>
          {ownedNFTs.map((nft, idx) => (
            <div key={idx} className={styles.nftCard}>
              <p><strong>Mint Address:</strong> {nft.nftId}</p>
              <p><strong>Seller:</strong> {nft.seller}</p>
              <p><strong>Price Paid:</strong> {nft.salePrice} SOL</p>
              <p><strong>Purchased:</strong> {new Date(nft.timestamp).toLocaleString()}</p>
              <p><strong>Status:</strong> {nft.marketStatus}</p>
              <a href={`https://ipfs.io/ipfs/${nft.fileCid}`} target="_blank" rel="noopener noreferrer">
                View Metadata
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LuxhubHolders;
