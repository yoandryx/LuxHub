// src/pages/watchMarket.tsx
import React, { useEffect, useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Connection, SystemProgram } from "@solana/web3.js";
import { getProgram } from "../utils/programUtils";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import { NftDetailCard } from "../components/marketplace/NftDetailCard";
import styles from "../styles/WatchMarket.module.css";

// Define the NFT interface
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

// Funds token mint address
const FUNDS_MINT = "So11111111111111111111111111111111111111112";

// Helper: delay in milliseconds (to ease RPC rate limits)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const Marketplace = () => {
  const wallet = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [selectedMetadataUri, setSelectedMetadataUri] = useState<string | null>(null);

  // Build the connection (Devnet by default).
  const connection = useMemo(
    () => new Connection(process.env.NEXT_PUBLIC_ENDPOINT || "https://api.devnet.solana.com"),
    []
  );

  // Build Metaplex instance.
  const metaplex = useMemo(() => {
    if (wallet.publicKey) {
      return Metaplex.make(connection).use(walletAdapterIdentity(wallet));
    }
    return null;
  }, [wallet.publicKey, connection]);

  // Build our program instance if wallet is connected.
  const program = useMemo(() => {
    return wallet.publicKey ? getProgram(wallet) : null;
  }, [wallet.publicKey]);

  // ------------------------------------------------
  // 1) Fetch NFTs from Pinata, filter by "Market Status = active"
  // ------------------------------------------------
  useEffect(() => {
    if (!wallet.publicKey) return;
    let isCancelled = false;

    const fetchNFTs = async () => {
      try {
        console.log("🔍 Fetching NFT data from /api/pinata/nfts");
        const res = await fetch("/api/pinata/nfts");
        if (!res.ok) throw new Error("Failed to fetch NFT data");
        const data: any[] = await res.json();
        console.log("📦 Raw Pinata data received:", data);

        const seenMintAddresses = new Set<string>();
        const nftList: NFT[] = [];

        // Process each NFT sequentially to help avoid rate limits.
        for (const nftItem of data) {
          const ipfsHash = nftItem.ipfs_pin_hash;
          try {
            console.log(`🔗 Processing IPFS hash: ${ipfsHash}`);

            // Get the pinned metadata JSON from your gateway.
            const pinnedRes = await fetch(`${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`);
            if (!pinnedRes.ok) {
              console.warn(`⚠️ Skipping ${ipfsHash}: Response not OK`);
              continue;
            }
            const pinnedData = await pinnedRes.json();

            // Ensure a unique mintAddress is present.
            if (!pinnedData.mintAddress) {
              console.warn(`⚠️ Skipping NFT from ${ipfsHash} because mintAddress is missing`);
              continue;
            }
            if (seenMintAddresses.has(pinnedData.mintAddress)) {
              console.warn(
                `⚠️ Skipping duplicate NFT with mintAddress: ${pinnedData.mintAddress}`
              );
              continue;
            }
            seenMintAddresses.add(pinnedData.mintAddress);

            // Use Metaplex to fetch on-chain metadata.
            if (!metaplex) continue;
            let onChainNFT;
            try {
              onChainNFT = await metaplex.nfts().findByMint({
                mintAddress: new PublicKey(pinnedData.mintAddress),
              });
            } catch (onChainError) {
              console.warn(
                `⚠️ No on‑chain metadata found for mint ${pinnedData.mintAddress}`,
                onChainError
              );
              continue;
            }

            const updatedMetadata = onChainNFT.json;
            if (!updatedMetadata) {
              console.warn(`⚠️ On‑chain metadata is null for mint ${pinnedData.mintAddress}`);
              continue;
            }

            const marketStatus =
              updatedMetadata.attributes?.find(
                (attr: any) => attr.trait_type === "Market Status"
              )?.value || "inactive";

            // Only show NFTs that are "active".
            if (marketStatus !== "active") continue;

            // Optional short delay to avoid rate limiting.
            await delay(250);

            nftList.push({
              title: updatedMetadata.name || "Untitled",
              description: updatedMetadata.description || "No description provided.",
              image: updatedMetadata.image || "",
              priceSol: pinnedData.priceSol ? parseFloat(pinnedData.priceSol) : 0,
              mintAddress: pinnedData.mintAddress,
              metadataUri: onChainNFT.uri,
              currentOwner:
                updatedMetadata.attributes?.find(
                  (attr: any) => attr.trait_type === "Provenance"
                )?.value || "",
              marketStatus,
            });
          } catch (err) {
            console.error(`❌ Error processing NFT for IPFS hash ${ipfsHash}:`, err);
          }
        }

        if (!isCancelled) {
          console.log("🔎 Active NFTs after filtering:", nftList);
          setNfts(nftList);
        }
      } catch (error) {
        console.error("❌ Error fetching NFTs:", error);
      }
    };

    fetchNFTs();

    return () => {
      isCancelled = true;
    };
  }, [wallet.publicKey, metaplex]);

  // ------------------------------------------------
  // 2) Purchase Handler
  // ------------------------------------------------
  const handlePurchase = async (nft: NFT) => {
    if (!wallet.publicKey || !program) {
      alert("Please connect your wallet.");
      return;
    }
    if (!window.confirm(`Purchase ${nft.title} for ${nft.priceSol} SOL?`)) return;

    try {
      const buyerAta = await getAssociatedTokenAddress(
        new PublicKey(FUNDS_MINT),
        wallet.publicKey
      );
      const sellerAta = await getAssociatedTokenAddress(
        new PublicKey(FUNDS_MINT),
        new PublicKey(nft.currentOwner)
      );

      // Attempt to find the escrow with mintB matching `nft.mintAddress`.
      const escrowAccounts = await (program.account as any).escrow.all([
        {
          memcmp: {
            offset: 113, // Might differ in your layout
            bytes: nft.mintAddress,
          },
        },
      ]);

      if (escrowAccounts.length === 0) {
        throw new Error("No escrow account found for this NFT.");
      }
      if (escrowAccounts.length > 1) {
        throw new Error("Multiple escrow accounts found for this NFT.");
      }
      const escrowPda = escrowAccounts[0].publicKey;

      const vaultAta = await getAssociatedTokenAddress(
        new PublicKey(FUNDS_MINT),
        escrowPda,
        true
      );

      // Call the exchange method on your program to finalize the purchase.
      const tx = await program.methods
        .exchange()
        .accounts({
          taker: wallet.publicKey,
          initializer: new PublicKey(nft.currentOwner),
          mintA: new PublicKey(FUNDS_MINT),
          mintB: new PublicKey(nft.mintAddress),
          takerAtaA: buyerAta,
          takerAtaB: buyerAta, // If you have a separate NFT ATA, update here.
          initializerAtaB: sellerAta,
          escrow: escrowPda,
          vault: vaultAta,
          associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      alert("Purchase successful! Transaction: " + tx);
      // Optionally re-fetch or remove this NFT from the UI.
    } catch (error: any) {
      console.error("❌ Purchase error:", error);
      alert("Purchase failed: " + error.message);
    }
  };

  // ------------------------------------------------
  // 3) Render
  // ------------------------------------------------
  return (
    <div className={styles.container}>
      <h1>Marketplace</h1>
      {nfts.length === 0 ? (
        <p>No active NFTs available for sale at the moment.</p>
      ) : (
        <div className={styles.nftGrid}>
          {nfts.map((nft, index) => (
            <div key={index} className={styles.nftCard}>
              <div className={styles.nftImageWrapper}>
                {nft.image ? (
                  <img src={nft.image} alt={nft.title} />
                ) : (
                  <p style={{ color: "gray" }}>No image available</p>
                )}
              </div>
              <div className={styles.nftDetails}>
                <h3 className={styles.nftTitle}>{nft.title}</h3>
                <p className={styles.creator}>
                  Creator:{" "}
                  {nft.currentOwner
                    ? nft.currentOwner.slice(0, 6) + "..."
                    : "Unknown"}
                </p>
                <p>Price: {nft.priceSol} SOL</p>
                <p className={styles.description}>{nft.description}</p>
                <div className={styles.buttonGroup}>
                  <button onClick={() => setSelectedMetadataUri(nft.metadataUri)}>
                    View Details
                  </button>
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
