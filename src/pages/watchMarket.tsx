// src/pages/marketplace.tsx
import { useEffect, useState } from "react";
import { PublicKey, Connection } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { getProgram } from "../utils/programUtils";
import { NftDetailCard } from "../components/marketplace/NftDetailCard";
import styles from "../styles/WatchMarket.module.css";

interface NFT {
  title: string;
  description: string;
  image: string;
  priceSol: number;
  mintAddress: string;
  metadataUri: string;
  currentOwner: string;
}

const Marketplace = () => {
  const wallet = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [selectedNft, setSelectedNft] = useState<NFT | null>(null);

  // Fetch NFTs for sale (for example, from your backend API or directly from on-chain data)
  useEffect(() => {
    const fetchNFTs = async () => {
      try {
        const res = await fetch("/api/pinata/nfts");
        if (!res.ok) throw new Error("Failed to fetch NFTs");
        const data = await res.json();
        setNfts(data);
      } catch (error) {
        console.error("Error fetching NFTs:", error);
      }
    };
    fetchNFTs();
  }, []);

  // Handler to purchase or exchange NFT (calls the exchange instruction)
  const handlePurchase = async (nft: NFT) => {
    if (!wallet.publicKey) return alert("Please connect your wallet.");
    try {
      const program = getProgram(wallet);
      // For example, call the exchange instruction on the NFT’s escrow account
      // You’ll need to compute the PDA and fill in all required accounts.
      const tx = await program.methods.exchange().accounts({
        // Fill in with the required accounts for the exchange instruction.
        // For example: taker, initializer, escrow, vault, etc.
      }).rpc();
      alert("Purchase successful! Transaction: " + tx);
    } catch (error: any) {
      console.error("Purchase error:", error);
      alert("Purchase failed: " + error.message);
    }
  };

  return (
    <div className={styles.container}>
      <h1>Marketplace</h1>
      <div className={styles.nftGrid}>
        {nfts.map((nft, index) => (
          <div key={index} className={styles.nftCard}>
            <img src={nft.image} alt={nft.title} />
            <h3>{nft.title}</h3>
            <p>{nft.description}</p>
            <p>Price: {nft.priceSol} SOL</p>
            <p>Owner: {nft.currentOwner}</p>
            <button onClick={() => setSelectedNft(nft)}>View Details</button>
            <button onClick={() => handlePurchase(nft)}>Purchase</button>
          </div>
        ))}
      </div>

      {selectedNft && (
        <div className={styles.overlay}>
          <button onClick={() => setSelectedNft(null)}>Close</button>
          <NftDetailCard metadataUri={selectedNft.metadataUri} />
        </div>
      )}
    </div>
  );
};

export default Marketplace;
