// src/pages/SellerDashboard.tsx
import React, { useEffect, useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Connection,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  AccountLayout,
} from "@solana/spl-token";
import { getProgram } from "../utils/programUtils";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import styles from "../styles/SellerDashboard.module.css";

// Define our NFT interface – note that the API endpoint now returns complete objects.
export interface NFT {
  mintAddress: string;
  title: string;
  description: string;
  image: string;
  marketStatus: string;
  fileCid: string;
  salePrice: number;
  metadataUri: string;
}

export interface ListingRequest {
  nftId: string;
  seed: number;
  fileCid: string;
  salePrice: number;
}

const FUNDS_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

// Notification type (success, error, info)
type Notification = { type: "success" | "error" | "info"; message: string } | null;

const SellerDashboard: React.FC = () => {
  const wallet = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [status, setStatus] = useState<string>("");
  const [notification, setNotification] = useState<Notification>(null);

  // Create a connection using the NEXT_PUBLIC_ENDPOINT environment variable.
  const connection = useMemo(
    () =>
      new Connection(
        process.env.NEXT_PUBLIC_ENDPOINT || "https://api.devnet.solana.com"
      ),
    []
  );

  // Create a Metaplex instance for on‑chain NFT metadata.
  const metaplex = useMemo(() => {
    if (wallet.publicKey) {
      return Metaplex.make(connection).use(walletAdapterIdentity(wallet));
    }
    return null;
  }, [wallet.publicKey, connection]);

  // Get the Anchor program.
  const program = useMemo(() => {
    return wallet.publicKey ? getProgram(wallet) : null;
  }, [wallet.publicKey]);

  // ----------------------------
  // FETCH SELLER NFT DATA (with backend endpoint)
  // ----------------------------
  useEffect(() => {
    const fetchSellerNFTs = async () => {
      if (!wallet.publicKey) return;
      try {
        console.log("[SellerDashboard] Fetching seller NFTs...");
        const res = await fetch(`/api/nft/seller?wallet=${wallet.publicKey.toBase58()}`);
        if (!res.ok) {
          const errorBody = await res.text();
          console.error("[SellerDashboard] Failed to fetch seller NFTs:", errorBody);
          throw new Error("Failed to fetch seller NFTs");
        }
        const data: NFT[] = await res.json();
        console.log(`[SellerDashboard] Total NFTs fetched: ${data.length}`);
        setNfts(data);
      } catch (error) {
        console.error("[SellerDashboard] Error fetching seller NFTs:", error);
        setNotification({ type: "error", message: "Error fetching your NFTs." });
      }
    };
    fetchSellerNFTs();
  }, [wallet.publicKey]);
  

  // ----------------------------
  // CHECK NFT BALANCE AND DEPOSIT INTO ESCROW
  // ----------------------------
  const checkAndDepositNFT = async (nft: NFT & { seed?: number }) => {
    if (!wallet.publicKey || !program) {
      setNotification({ type: "error", message: "Wallet or program not connected." });
      return;
    }
    try {
      console.log(`[SellerDashboard] Checking NFT deposit status for mint: ${nft.mintAddress}`);
      const nftMint = new PublicKey(nft.mintAddress);
      const sellerNftAta = await getAssociatedTokenAddress(nftMint, wallet.publicKey);
      const ataInfo = await connection.getAccountInfo(sellerNftAta);
      if (!ataInfo) {
        setNotification({ type: "error", message: "NFT ATA is missing. Please mint or transfer your NFT." });
        return;
      }
      const balanceResult = await connection.getTokenAccountBalance(sellerNftAta);
      const balance = Number(balanceResult.value.uiAmount);
      console.log(`[SellerDashboard] NFT ATA balance: ${balance}`);
      if (balance < 1) {
        setNotification({ type: "error", message: "Your NFT balance is zero. Deposit your NFT first." });
        return;
      }
  
      const salePriceLamports = Math.floor(nft.salePrice * LAMPORTS_PER_SOL);
      const seed = Date.now();
      nft.seed = seed; // ✅ Store seed on the NFT object
      const seedBuffer = new BN(seed).toArrayLike(Buffer, "le", 8);
  
      const [escrowPda] = await PublicKey.findProgramAddress(
        [Buffer.from("state"), seedBuffer],
        program.programId
      );
  
      const vaultAta = await getAssociatedTokenAddress(nftMint, escrowPda, true);
      console.log("[SellerDashboard] Preparing to initialize escrow and create vault if needed...");

  
      console.log(`[SellerDashboard] Depositing NFT using seed: ${seed}`);
      const tx = await program.methods
        .initialize(
          new BN(seed),
          new BN(1),
          new BN(0),
          nft.fileCid,
          wallet.publicKey,
          new BN(salePriceLamports),
          wallet.publicKey
        )
        .accounts({
          admin: wallet.publicKey,
          seller: wallet.publicKey,
          mintA: new PublicKey(FUNDS_MINT),
          mintB: nftMint,
          sellerAtaA: await getAssociatedTokenAddress(new PublicKey(FUNDS_MINT), wallet.publicKey),
          sellerAtaB: sellerNftAta,
          escrow: escrowPda,
          vault: vaultAta,
          associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
        console.log("[SellerDashboard] NFT deposited successfully. Tx:", tx);
        setNotification({ type: "success", message: "NFT deposited into escrow vault successfully." });
      } catch (error: any) {
        console.error("[SellerDashboard] Deposit NFT error:", error);
        setNotification({ type: "error", message: "Deposit NFT failed: " + error.message });
      }
    };
  
    const requestListing = async (nft: NFT & { seed?: number }) => {
    if (!wallet.publicKey || !program) {
      setNotification({ type: "error", message: "Wallet or program not connected." });
      return;
    }
  
    const seed = nft.seed;
    if (!seed) {
      setNotification({
        type: "error",
        message: "Missing escrow seed. Please deposit your NFT again.",
      });
      return;
    }
  
    try {
      const nftMint = new PublicKey(nft.mintAddress);
      const seedBuffer = new BN(seed).toArrayLike(Buffer, "le", 8);
  
      const [escrowPda] = await PublicKey.findProgramAddress(
        [Buffer.from("state"), seedBuffer],
        program.programId
      );
  
      const vaultAta = await getAssociatedTokenAddress(nftMint, escrowPda, true);
      const vaultBalanceResult = await connection.getTokenAccountBalance(vaultAta);
      const vaultBalance = Number(vaultBalanceResult.value.uiAmount);
      console.log(`[SellerDashboard] Vault ATA balance for ${nft.mintAddress}:`, vaultBalance);
  
      if (vaultBalance < 1) {
        setNotification({
          type: "error",
          message: "Your NFT is not deposited in the vault. Please deposit it before requesting a listing.",
        });
        return;
      }
  
      const listingPayload = {
        nftId: nft.mintAddress,
        seed,
        fileCid: nft.fileCid,
        salePrice: nft.salePrice,
      };
  
      console.log("[SellerDashboard] Sending listing request with payload:", listingPayload);
  
      const res = await fetch("/api/nft/requestSale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nftId: listingPayload.nftId,
          seed: listingPayload.seed,
          fileCid: listingPayload.fileCid,
          salePrice: listingPayload.salePrice,
          seller: wallet.publicKey.toBase58(),
          initializerAmount: 1,
          takerAmount: 0,
          ipfs_pin_hash: listingPayload.fileCid,
          timestamp: Date.now()
        }),        
      });
  
      if (!res.ok) throw new Error("Listing request failed");
  
      console.log("[SellerDashboard] Listing request submitted successfully.");
      setNotification({ type: "success", message: "Listing request submitted successfully." });
    } catch (error: any) {
      console.error("[SellerDashboard] Listing request error:", error);
      setNotification({ type: "error", message: "Listing request failed: " + error.message });
    }
  };
  
  

  return (
    <div className={styles.container}>
      <h1>Seller NFT Management</h1>
      <p>Your wallet: {wallet.publicKey ? wallet.publicKey.toBase58() : "Not connected"}</p>
      {status && <p className={styles.status}>{status}</p>}
      {notification && (
        <div
          className={
            notification.type === "success"
              ? styles.notificationSuccess
              : notification.type === "error"
              ? styles.notificationError
              : styles.notificationInfo
          }
        >
          {notification.message}
        </div>
      )}
      <div className={styles.nftGrid}>
        {nfts.length === 0 ? (
          <p>You do not have any NFTs registered for sale.</p>
        ) : (
          nfts.map((nft, index) => (
            <div key={index} className={styles.nftCard}>
              <div className={styles.nftImageWrapper}>
                {nft.image ? <img src={nft.image} alt={nft.title} /> : <p>No Image Available</p>}
              </div>
              <div className={styles.nftDetails}>
                <h3>{nft.title}</h3>
                <p>{nft.description}</p>
                <p>
                  <strong>Mint:</strong> {nft.mintAddress}
                </p>
                <p>
                  <strong>Status:</strong> {nft.marketStatus}
                </p>
                <p>
                  <strong>Sale Price:</strong> {nft.salePrice} SOL
                </p>
                <div className={styles.buttonGroup}>
                  <button onClick={() => requestListing(nft)}>Request Listing</button>
                  <button onClick={() => checkAndDepositNFT(nft)}>Deposit NFT</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SellerDashboard;
