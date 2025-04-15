// src/pages/WatchMarket.tsx
import React, { useEffect, useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Connection,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { getProgram } from "../utils/programUtils";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  AccountLayout,
} from "@solana/spl-token";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import { NftDetailCard } from "../components/marketplace/NftDetailCard";
import styles from "../styles/WatchMarket.module.css";
import { toast } from "react-toastify";

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

const FUNDS_MINT = "So11111111111111111111111111111111111111112";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const Marketplace = () => {
  const wallet = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [selectedMetadataUri, setSelectedMetadataUri] = useState<string | null>(null);

  // Create a connection to the devnet endpoint.
  const connection = useMemo(
    () =>
      new Connection(
        process.env.NEXT_PUBLIC_ENDPOINT || "https://api.devnet.solana.com"
      ),
    []
  );

  const metaplex = useMemo(() => {
    if (wallet.publicKey) {
      return Metaplex.make(connection).use(walletAdapterIdentity(wallet));
    }
    return null;
  }, [wallet.publicKey, connection]);

  const program = useMemo(() => {
    return wallet.publicKey ? getProgram(wallet) : null;
  }, [wallet.publicKey]);

  // ------------------------------------------------
  // 1. Fetch NFTs from Pinata, show only "active" ones.
  // ------------------------------------------------
  const fetchNFTs = async () => {
    if (!wallet.publicKey || !metaplex) return;
    let isCancelled = false;

    toast.info("🔄 Refreshing listings...", {
      position: "top-right",
      autoClose: 2000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: false,
      draggable: false,
      progress: undefined,
      theme: "light",
    });
  
    try {
      console.log("🔍 Fetching NFT data from /api/pinata/nfts");
      const res = await fetch("/api/pinata/nfts");
      if (!res.ok) throw new Error("Failed to fetch NFT data");
      const data: any[] = await res.json();
      console.log("📦 Raw Pinata data received:", data);
  
      const seenMintAddresses = new Set<string>();
      const nftList: NFT[] = [];
  
      for (const nftItem of data) {
        const ipfsHash = nftItem.ipfs_pin_hash;
        try {
          const pinnedRes = await fetch(
            `${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`
          );
          if (!pinnedRes.ok) {
            console.warn(`⚠️ Skipping ${ipfsHash}: Response not OK`);
            continue;
          }
          const pinnedData = await pinnedRes.json();
          if (!pinnedData.mintAddress) continue;
          if (seenMintAddresses.has(pinnedData.mintAddress)) continue;
          seenMintAddresses.add(pinnedData.mintAddress);
  
          let onChainNFT;
          try {
            onChainNFT = await metaplex.nfts().findByMint({
              mintAddress: new PublicKey(pinnedData.mintAddress),
            });
          } catch {
            continue;
          }
  
          const updatedMetadata = onChainNFT.json;
          if (!updatedMetadata) continue;
  
          const marketStatus =
            updatedMetadata.attributes?.find(
              (attr: any) => attr.trait_type === "Market Status"
            )?.value || "inactive";
  
          const validStatuses = ["active"];
          if (!validStatuses.includes(marketStatus)) continue;
  
          const priceAttr = updatedMetadata.attributes?.find(
            (attr: any) => attr.trait_type === "Price"
          );
          const priceAttrValue =
            typeof priceAttr?.value === "string" ? priceAttr.value : "0";
          const extractedPriceSol = parseFloat(priceAttrValue);
  
          await delay(250);
  
          nftList.push({
            title: updatedMetadata.name || "Untitled",
            description: updatedMetadata.description || "No description provided.",
            image: updatedMetadata.image || "",
            priceSol: extractedPriceSol,
            mintAddress: pinnedData.mintAddress,
            metadataUri: onChainNFT.uri,
            currentOwner:
              updatedMetadata.attributes?.find(
                (attr: any) => attr.trait_type === "Provenance"
              )?.value || "",
            marketStatus,
          });
        } catch (err) {
          console.error(`❌ Error processing NFT with IPFS hash ${ipfsHash}:`, err);
        }
      }
  
      if (!isCancelled) {
        console.log("🔎 Active NFTs after filtering:", nftList);
        setNfts(nftList);
        toast.success("Listings updated!");
      }
    } catch (error) {
      console.error("❌ Error fetching NFTs:", error);
    }
  };
  
  useEffect(() => {
    fetchNFTs();
  }, [wallet.publicKey, metaplex]);
  

  // ------------------------------------------------
  // 2. Purchase Handler
  // ------------------------------------------------
  const handlePurchase = async (nft: NFT) => {
    if (!wallet.publicKey || !program) {
      alert("Please connect your wallet.");
      return;
    }
  
    if (!window.confirm(`Purchase ${nft.title} for ${nft.priceSol} SOL?`)) return;
  
    try {
      const buyer = wallet.publicKey;
      const nftMint = new PublicKey(nft.mintAddress);
      const fundsMint = new PublicKey(FUNDS_MINT);
      const LAMPORTS_PER_SOL = 1_000_000_000;
      const priceLamports = Math.floor(nft.priceSol * LAMPORTS_PER_SOL);
  
      // Prepare connection and ATAs
      const buyerFundsAta = await getAssociatedTokenAddress(fundsMint, buyer);
      const buyerNftAta = await getAssociatedTokenAddress(nftMint, buyer);
  
      const buyerFundsAtaInfo = await connection.getAccountInfo(buyerFundsAta);
      const buyerNftAtaInfo = await connection.getAccountInfo(buyerNftAta);
      const rentExemption = await connection.getMinimumBalanceForRentExemption(AccountLayout.span);
      const balance = await connection.getBalance(buyer);
      const preIx: TransactionInstruction[] = [];
  
      if (!buyerFundsAtaInfo) {
        console.log("Creating buyer funds ATA...");
        preIx.push(createAssociatedTokenAccountInstruction(
          buyer, buyerFundsAta, buyer, fundsMint
        ));
      }
  
      if (!buyerNftAtaInfo) {
        console.log("Creating buyer NFT ATA...");
        preIx.push(createAssociatedTokenAccountInstruction(
          buyer, buyerNftAta, buyer, nftMint
        ));
      }
  
      if (balance < priceLamports) {
        throw new Error(`Insufficient SOL balance. Required: ${priceLamports}, Found: ${balance}`);
      }
  
      // Fetch escrow account via mintB memcmp (offset = 113)
      const escrowAccounts = await (program.account as any).escrow.all([
        { memcmp: { offset: 113, bytes: nft.mintAddress } },
      ]);
      if (escrowAccounts.length !== 1) {
        throw new Error("Could not uniquely identify escrow account for this NFT.");
      }
      const escrowPda = escrowAccounts[0].publicKey;
  
      // Derive vault ATA (vault holds wSOL, associated with mintA and escrow PDA)
      const vaultAta = await getAssociatedTokenAddress(fundsMint, escrowPda, true);
      const vaultExists = await connection.getAccountInfo(vaultAta);
      if (!vaultExists) {
        console.log("Vault ATA missing — creating...");
        preIx.push(createAssociatedTokenAccountInstruction(
          buyer,
          vaultAta,
          escrowPda,
          fundsMint
        ));
      }
  
      console.log("📦 Sending exchange() with accounts:");
      console.table({
        taker: buyer.toBase58(),
        mintA: FUNDS_MINT,
        mintB: nftMint.toBase58(),
        takerFundsAta: buyerFundsAta.toBase58(),
        takerNftAta: buyerNftAta.toBase58(),
        vault: vaultAta.toBase58(),
        escrow: escrowPda.toBase58(),
      });
  
      const tx = await program.methods
        .exchange()
        .preInstructions(preIx)
        .accounts({
          taker: buyer,
          mintA: fundsMint,
          mintB: nftMint,
          takerFundsAta: buyerFundsAta,
          takerNftAta: buyerNftAta,
          vault: vaultAta,
          escrow: escrowPda,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
  
      alert("✅ Purchase successful! Tx: " + tx);
      toast.success("🎉 Purchase completed!");
  
      // Update backend DB
      await fetch("/api/nft/updateBuyer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          buyer: wallet.publicKey.toBase58(),
          mintAddress: nft.mintAddress,
          vaultAta: vaultAta.toBase58(),
          priceSol: nft.priceSol,
        }),
      });      
  
      await delay(1000);
      fetchNFTs();
    } catch (err: any) {
      console.error("❌ Purchase failed:", err);
      alert("Purchase failed: " + err.message);
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
            <button onClick={() => setSelectedMetadataUri(null)}>Close</button>
            <NftDetailCard metadataUri={selectedMetadataUri} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Marketplace;
