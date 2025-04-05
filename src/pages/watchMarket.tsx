import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
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
  marketStatus: string;
}

// Type guard to filter out null values
const isNFT = (item: NFT | null): item is NFT => item !== null;

const Marketplace = () => {
  const wallet = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [selectedMetadataUri, setSelectedMetadataUri] = useState<string | null>(null);

  useEffect(() => {
    const fetchNFTs = async () => {
      try {
        console.log("🔍 Fetching NFT data from /api/pinata/nfts");
        const res = await fetch("/api/pinata/nfts");
        if (!res.ok) throw new Error("Failed to fetch NFT data");
        const data: any[] = await res.json();
        console.log("📦 Raw Pinata data received:", data);

        // Use a set to track duplicate mint addresses
        const seenMintAddresses = new Set<string>();

        const transformed: (NFT | null)[] = await Promise.all(
          data.map(async (nftItem, index) => {
            const ipfsHash = nftItem.ipfs_pin_hash;
            console.log(`🔗 [${index}] Fetching metadata for IPFS hash: ${ipfsHash}`);
            try {
              const metadataRes = await fetch(`${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`);
              const contentType = metadataRes.headers.get("Content-Type");
              if (!contentType || !contentType.includes("application/json")) {
                console.warn(`⚠️ Skipping pin ${ipfsHash} due to non-JSON content type: ${contentType}`);
                return null;
              }
              const jsonData = await metadataRes.json();
              console.log(`✅ [${index}] Fetched JSON metadata for ${ipfsHash}:`, jsonData);

              if (!jsonData.mintAddress) {
                console.warn(`⚠️ Skipping NFT from ${ipfsHash} because mintAddress is missing`);
                return null;
              }
              if (seenMintAddresses.has(jsonData.mintAddress)) {
                console.warn(`⚠️ Skipping duplicate NFT with mintAddress: ${jsonData.mintAddress}`);
                return null;
              }
              seenMintAddresses.add(jsonData.mintAddress);

              // Extract current owner from "Provenance" attribute
              const currentOwner =
                jsonData.attributes?.find((attr: any) => attr.trait_type === "Provenance")?.value || "";
              // Extract market status from "Market Status" attribute (default to "inactive")
              const marketStatus =
                jsonData.attributes?.find((attr: any) => attr.trait_type === "Market Status")?.value || "inactive";

              console.log(`🔎 [${index}] NFT ${jsonData.name} has marketStatus: ${marketStatus}`);
              if (marketStatus !== "active") {
                console.log(`ℹ️ Skipping NFT ${jsonData.name} because it is not active (marketStatus=${marketStatus})`);
                return null;
              }

              return {
                title: jsonData.name || "Untitled",
                description: jsonData.description || "No description provided.",
                image:
                  jsonData.image && jsonData.image.startsWith("http")
                    ? jsonData.image
                    : `${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`,
                priceSol: jsonData.priceSol ? parseFloat(jsonData.priceSol) : 0,
                mintAddress: jsonData.mintAddress,
                metadataUri: `${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`,
                currentOwner,
                marketStatus,
              } as NFT;
            } catch (err) {
              console.error(`❌ Error fetching JSON for hash ${ipfsHash}:`, err);
              return null;
            }
          })
        );

        const validNFTs = transformed.filter(isNFT);
        console.log("🔎 Active NFTs after filtering:", validNFTs);
        setNfts(validNFTs);
      } catch (error) {
        console.error("❌ Error fetching NFTs:", error);
      }
    };

    fetchNFTs();
  }, []);

  // Handler to initiate a purchase (replace with your smart contract exchange logic)
  const handlePurchase = async (nft: NFT) => {
    if (!wallet.publicKey) {
      alert("Please connect your wallet.");
      return;
    }
    try {
      console.log("💸 Initiating purchase for NFT:", nft);
      // TODO: Replace the dummy code below with your smart contract exchange instruction.
      alert(`Purchase successful for NFT ${nft.title}! (Dummy transaction)`);
    } catch (error: any) {
      console.error("❌ Purchase error:", error);
      alert("Purchase failed: " + error.message);
    }
  };

  return (
    <div className={styles.container}>
      <h1>Marketplace</h1>
      {nfts.length === 0 ? (
        <p>No active NFTs available for sale at the moment.</p>
      ) : (
        <div className={styles.nftGrid}>
          {nfts.map((nft, index) => (
            <div key={index} className={styles.nftCard}>
              {/* Image on the left */}
              <div className={styles.nftImageWrapper}>
                {nft.image ? (
                  <img src={nft.image} alt={nft.title} />
                ) : (
                  <p style={{ color: "gray" }}>No image available</p>
                )}
              </div>

              {/* Details on the right */}
              <div className={styles.nftDetails}>
                <h3 className={styles.nftTitle}>{nft.title}</h3>
                <p className={styles.creator}>
                  Creator: {nft.currentOwner ? nft.currentOwner.slice(0, 6) + "..." : "Unknown"}
                </p>

                <div className={styles.metaInfo}>
                  <p>Open Edition</p>
                  <p>Total Minted: 76</p> {/* placeholder */}
                  <p>Ends In: 10 hours</p> {/* placeholder */}
                  <p>Mint Price: {nft.priceSol} SOL</p>
                </div>

                <p className={styles.description}>{nft.description}</p>

                <div className={styles.buttonGroup}>
                  <button onClick={() => setSelectedMetadataUri(nft.metadataUri)}>View Details</button>
                  <button onClick={() => handlePurchase(nft)}>Purchase</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedMetadataUri && (
        <div className={styles.overlay}>
          <div className={styles.detailContainer}>
            <button onClick={() => setSelectedMetadataUri(null)}>X</button>
            <NftDetailCard metadataUri={selectedMetadataUri} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Marketplace;
