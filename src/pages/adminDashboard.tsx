// src/pages/AdminDashboard.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Connection,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getProgram } from "../utils/programUtils";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import { uploadToPinata } from "../utils/pinata";
import { updateNftMetadata } from "../utils/metadata";
import styles from "../styles/AdminDashboard.module.css";
import { toast } from "react-toastify";


ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

interface LogEntry {
  timestamp: string;
  action: string;
  tx: string;
  message: string;
}

interface SaleRequest {
  nftId: string; // NFT mint address
  seller: string; // Seller wallet
  seed: number;
  initializerAmount: number;
  takerAmount: number;
  fileCid: string;
  salePrice: number;
  ipfs_pin_hash?: string;
  timestamp: number;
  luxhubWallet: string;
  buyer: string; // Buyer wallet
  marketStatus?: string;
}

interface SaleRequestsResponse {
  saleRequests: SaleRequest[];
  page: number;
  totalPages: number;
  totalCount: number;
}


interface EscrowAccount {
  seed: number;
  initializer: string;
  luxhub_wallet: string;
  initializer_amount: string;
  taker_amount: string;
  salePrice: string;
  file_cid: string;
  mintA: string;
  mintB: string;

  // ✅ New optional fields added by enriched fetch logic
  name?: string;
  image?: string;
  description?: string;
  vaultATA?: string;
  attributes?: { trait_type: string; value: string }[];
}


const FUNDS_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;
const PLACEHOLDER_BUYER = new PublicKey("11111111111111111111111111111111");

const updateNFTMarketStatus = async (
  mintAddress: string,
  newMarketStatus: string,
  wallet: any
) => {
  try {
    console.log("[updateNFTMarketStatus] Connecting to Solana endpoint...");
    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.devnet.solana.com"
    );
    const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));

    console.log("[updateNFTMarketStatus] Fetching on-chain NFT for mint:", mintAddress);
    const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mintAddress) });
    console.log("[updateNFTMarketStatus] Retrieved NFT data:", nft);

    console.log("[updateNFTMarketStatus] Fetching current metadata JSON from:", nft.uri);
    const res = await fetch(nft.uri);
    if (!res.ok) throw new Error("Failed to fetch current metadata");
    const metadata = await res.json();
    console.log("[updateNFTMarketStatus] Current metadata JSON:", metadata);

    if (!metadata.attributes || !Array.isArray(metadata.attributes)) {
      metadata.attributes = [];
    }
    let updated = false;
    metadata.attributes = metadata.attributes.map((attr: any) => {
      if (attr.trait_type === "Market Status") {
        console.log("[updateNFTMarketStatus] Changing Market Status from", attr.value, "to", newMarketStatus);
        updated = true;
        return { ...attr, value: newMarketStatus };
      }
      return attr;
    });
    if (!updated) {
      console.log("[updateNFTMarketStatus] 'Market Status' not found. Adding it...");
      metadata.attributes.push({ trait_type: "Market Status", value: newMarketStatus });
    }

    metadata.updatedAt = new Date().toISOString();
    console.log("[updateNFTMarketStatus] Final metadata JSON with updatedAt:", metadata);

    console.log("[updateNFTMarketStatus] Uploading updated metadata JSON to Pinata...");
    const newUri = await uploadToPinata(metadata, metadata.name || "Updated NFT Metadata");
    console.log("[updateNFTMarketStatus] New metadata URI:", newUri);

    const newName = nft.name.endsWith("(Active)") ? nft.name : nft.name + " (Active)";
    console.log("[updateNFTMarketStatus] New name to update:", newName);

    console.log("[updateNFTMarketStatus] Sending updateNftMetadata transaction with {uri, name}...");
    await updateNftMetadata(wallet as any, mintAddress, { uri: newUri, name: newName } as any);
    console.log("[updateNFTMarketStatus] On-chain NFT metadata update complete. Market Status set to:", newMarketStatus);
  } catch (error) {
    console.error("[updateNFTMarketStatus] Failed to update NFT market status:", error);
  }
};

const AdminDashboard: React.FC = () => {
  const wallet = useWallet();
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const [luxhubWallet, setLuxhubWallet] = useState<string>("");
  const [newLuxhubWallet, setNewLuxhubWallet] = useState<string>("");
  const [currentEscrowConfig, setCurrentEscrowConfig] = useState<string>("");

  const [adminList, setAdminList] = useState<string[]>([]);
  const [newAdmin, setNewAdmin] = useState<string>("");
  const [removeAdminAddr, setRemoveAdminAddr] = useState<string>("");

  const [buyerWallet, setBuyerWallet] = useState<string>("");

  const [saleRequests, setSaleRequests] = useState<SaleRequest[]>([]);
  const [activeEscrows, setActiveEscrows] = useState<EscrowAccount[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const [dynamicSeeds, setDynamicSeeds] = useState<Map<string, number>>(new Map());
  const [vaultAddresses, setVaultAddresses] = useState<{ [seed: string]: string }>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [isLastPage, setIsLastPage] = useState(false);
  const [sellerFilter, setSellerFilter] = useState("");


  const program = useMemo(() => (wallet.publicKey ? getProgram(wallet) : null), [wallet.publicKey]);
  const escrowConfigPda = useMemo(() => {
    return program
      ? PublicKey.findProgramAddressSync([Buffer.from("escrow_config")], program.programId)[0]
      : null;
  }, [program]);
  const adminListPda = useMemo(() => {
    return program
      ? PublicKey.findProgramAddressSync([Buffer.from("admin_list")], program.programId)[0]
      : null;
  }, [program]);

  const addLog = (action: string, tx: string, message: string) => {
    const timestamp = new Date().toLocaleString();
    const newLog: LogEntry = { timestamp, action, tx, message };
    console.log(`[${timestamp}] ${action}: ${message} (tx: ${tx})`);
    setLogs((prev) => [...prev, newLog]);
  };

  const fetchWithRetry = async (
    fetchFunc: () => Promise<any>,
    retries = 3,
    delayMs = 1000
  ): Promise<any> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fetchFunc();
      } catch (error: any) {
        if (error?.message?.includes("Too many requests") && attempt < retries - 1) {
          console.warn(`Rate limited. Retrying in ${delayMs * (attempt + 1)} ms...`);
          await new Promise((res) => setTimeout(res, delayMs * (attempt + 1)));
        } else {
          throw error;
        }
      }
    }
  };

  const fetchConfigAndAdmins = async () => {
    if (!program || !escrowConfigPda || !adminListPda) return;
    try {
      const configAccount = await fetchWithRetry(() =>
        (program.account as any).escrowConfig.fetch(escrowConfigPda)
      );
      console.log("[fetchConfigAndAdmins] Fetched escrow config:", configAccount);
      const luxhubWalletStr =
        configAccount.luxhubWallet?.toBase58?.() ||
        configAccount.luxhub_wallet?.toBase58?.() ||
        null;
      if (luxhubWalletStr) {
        setCurrentEscrowConfig(luxhubWalletStr);
      } else {
        console.warn("[fetchConfigAndAdmins] Escrow config not initialized", configAccount);
        setCurrentEscrowConfig("Not initialized");
      }
    } catch (e) {
      console.error("[fetchConfigAndAdmins] Failed to fetch escrow config", e);
    }
    try {
      const adminAccountRaw = await fetchWithRetry(() =>
        (program.account as any).adminList.fetch(adminListPda)
      );
      console.log("[fetchConfigAndAdmins] Fetched admin account:", adminAccountRaw);
      if (adminAccountRaw?.admins) {
        const adminListStr: string[] = adminAccountRaw.admins
          .map((admin: any) => admin?.toBase58?.() || "")
          .filter((adminStr: string) => adminStr !== "");
        setAdminList(adminListStr);
      } else {
        console.error("[fetchConfigAndAdmins] No 'admins' property found:", adminAccountRaw);
      }
    } catch (e) {
      console.error("[fetchConfigAndAdmins] Failed to fetch admin list", e);
    }
  };

  const fetchActiveEscrows = async (mintFilter?: string) => {
    if (!program) return;
  
    try {
      const rawEscrows = await (program.account as any).escrow.all();
      console.log("🔍 Raw Escrows from chain:", rawEscrows);
  
      // Filter valid escrows by status and mint
      const active = rawEscrows.filter((acc: any) => {
        const notCompleted = !acc.account.isCompleted;
        const hasSeed = acc.account.seed > 0;
        const mintB = acc.account.mint_b?.toBase58?.();
        const matchesMint = mintFilter ? mintB === mintFilter : true;
        return notCompleted && hasSeed && mintB && matchesMint;
      });
  
      const enriched = await Promise.all(
        active.map(async (acc: any) => {
          try {
            const seed = acc.account.seed;
            const initializer = acc.account.initializer?.toBase58?.() || "";
            const mintB = acc.account.mint_b?.toBase58?.();
  
            if (!mintB || !PublicKey.isOnCurve(new PublicKey(mintB))) {
              console.warn("[fetchActiveEscrows] Skipping escrow with invalid mintB:", mintB);
              return null;
            }
  
            const [escrowPda] = PublicKey.findProgramAddressSync(
              [Buffer.from("state"), new BN(seed).toArrayLike(Buffer, "le", 8)],
              program.programId
            );
  
            const vault = await getAssociatedTokenAddress(
              new PublicKey(mintB),
              escrowPda,
              true
            );
  
            // Load metadata
            const pinataGateway = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/";
            const fileCid = acc.account.file_cid;
            const metadataUri = pinataGateway + fileCid;
  
            let metadata: any = {};
            try {
              const res = await fetch(metadataUri);
              metadata = res.ok ? await res.json() : {
                name: "Pending NFT",
                description: "Awaiting metadata",
                attributes: [],
              };
            } catch (err) {
              console.warn("[fetchActiveEscrows] Fallback metadata used for", mintB, err);
              metadata = {
                name: "Unfetched NFT",
                description: "Error fetching metadata",
                attributes: [],
              };
            }
  
            return {
              seed,
              initializer,
              mintB,
              file_cid: fileCid,
              vaultATA: vault.toBase58(),
              initializer_amount: acc.account.initializer_amount?.toString?.() || "0",
              taker_amount: acc.account.taker_amount?.toString?.() || "0",
              salePrice: acc.account.sale_price?.toString?.() || "0",
              name: metadata.name || "Unknown NFT",
              image: metadata.image || "",
              description: metadata.description || "",
              attributes: metadata.attributes || [],
            };
          } catch (err) {
            console.error("[fetchActiveEscrows] Skipping failed escrow fetch:", err);
            return null;
          }
        })
      );
  
      setActiveEscrows(enriched.filter(Boolean));
      console.log("[fetchActiveEscrows] Loaded enriched active escrows:", enriched);
    } catch (e) {
      console.error("[fetchActiveEscrows] Failed to fetch enriched active escrows:", e);
    }
  };

  const fetchActiveEscrowsByMint = async () => {
    try {
      const res = await fetch("/api/nft/activeEscrowsByMint");
      const escrows = await res.json();
  
      const enriched = await Promise.all(
        escrows.map(async (escrow: any) => {
          const seed = escrow.seed;
          const mintB = escrow.nftId;
          const pinataGateway =
            process.env.NEXT_PUBLIC_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/";
          const metadataUri = pinataGateway + escrow.fileCid;
  
          let metadata: any = {};
          try {
            const metaRes = await fetch(metadataUri);
            metadata = metaRes.ok
              ? await metaRes.json()
              : {
                  name: "Pending NFT",
                  description: "Awaiting metadata",
                  attributes: [],
                };
          } catch (err) {
            console.warn("[fetchActiveEscrowsByMint] Failed metadata fetch", mintB, err);
            metadata = {
              name: "Unfetched NFT",
              description: "Error fetching metadata",
              attributes: [],
            };
          }
  
          // 🔐 Generate PDA & Vault ATA (based on seed and mintB)
          let vaultATA = "";
          try {
            if (!program) return null;

            const [escrowPda] = PublicKey.findProgramAddressSync(
              [Buffer.from("state"), new BN(seed).toArrayLike(Buffer, "le", 8)],
              program.programId
            );

            const vault = await getAssociatedTokenAddress(
              new PublicKey(mintB),
              escrowPda,
              true
            );
            vaultATA = vault.toBase58();
          } catch (e) {
            console.warn("[fetchActiveEscrowsByMint] Vault ATA generation failed", e);
          }
  
          return {
            seed,
            initializer: escrow.seller,
            mintB,
            file_cid: escrow.fileCid,
            initializer_amount: escrow.initializerAmount?.toString() || "0",
            taker_amount: escrow.takerAmount?.toString() || "0",
            salePrice: escrow.salePrice?.toString() || "0",
            name: metadata.name || "Unknown NFT",
            image: metadata.image || "",
            description: metadata.description || "",
            attributes: metadata.attributes || [],
            vaultATA, // ✅ add it to the enriched data
          };
        })
      );
  
      setActiveEscrows(enriched.filter(Boolean));
      console.log("[fetchActiveEscrowsByMint] Enriched:", enriched);
    } catch (err) {
      console.error("[fetchActiveEscrowsByMint] Error:", err);
    }
  };

  const fetchSaleRequests = async (page = 1, seller = "") => {
    try {
      const res = await fetch(`/api/nft/pendingRequests?page=${page}&seller=${seller}`);
      const data: SaleRequestsResponse = await res.json();
  
      if (!data || !Array.isArray(data.saleRequests)) {
        console.error("Invalid response format:", data);
        return;
      }
  
      setSaleRequests(data.saleRequests);
      setCurrentPage(data.page || page);
      setIsLastPage(data.page >= data.totalPages); // 🔍 accurate last page check
    } catch (err) {
      console.error("❌ Error fetching sale requests:", err);
      setSaleRequests([]);
    }
  };
  
  
  

  const refreshData = async () => {
    setLoading(true);
    await fetchConfigAndAdmins();
    // await fetchActiveEscrows();
    await fetchActiveEscrowsByMint();
    await fetchSaleRequests();
    setLoading(false);
  };

  useEffect(() => {
    if (program) {
      refreshData();
    }
  }, [program]);

  useEffect(() => {
    if (wallet.publicKey && adminList.length > 0) {
      const isUserAdmin = adminList.some(
        (adminStr) => adminStr === wallet.publicKey!.toBase58()
      );
      setIsAdmin(isUserAdmin);
      console.log("[Admin Check] Is user admin?", isUserAdmin);
    }
  }, [wallet.publicKey, adminList]);

  const totalEscrowVolume = activeEscrows.reduce(
    (acc, escrow) => acc + Number(escrow.initializer_amount),
    0
  );
  const totalRoyaltyEarned = totalEscrowVolume * 0.03;

  const initializeEscrowConfig = async () => {
    if (!wallet.publicKey || !program || !escrowConfigPda) {
      alert("Wallet not connected or program not ready.");
      return;
    }
    try {
      console.log("[initializeEscrowConfig] Initializing escrow config with LuxHub wallet:", luxhubWallet);
      const luxhubPk = new PublicKey(luxhubWallet);
      const tx = await program.methods
        .initializeEscrowConfig(luxhubPk)
        .accounts({
          escrowConfig: escrowConfigPda,
          admin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setStatus("Escrow config initialized. Tx: " + tx);
      addLog("Initialize Config", tx, "Set LuxHub wallet: " + luxhubWallet);
      refreshData();
    } catch (error: any) {
      console.error("[initializeEscrowConfig] error:", error);
      setStatus("Initialization failed: " + error.message);
      addLog("Initialize Config", "N/A", "Error: " + error.message);
    }
  };

  const updateEscrowConfig = async () => {
    if (!wallet.publicKey || !program || !escrowConfigPda || !adminListPda) {
      alert("Wallet not connected or program not ready.");
      return;
    }
    try {
      console.log("[updateEscrowConfig] Updating escrow config to new wallet:", newLuxhubWallet);
      const newLuxhubPk = new PublicKey(newLuxhubWallet);
      const tx = await program.methods
        .updateEscrowConfig(newLuxhubPk)
        .accounts({
          escrowConfig: escrowConfigPda,
          admin: wallet.publicKey,
          adminList: adminListPda,
        })
        .rpc();
      setStatus("Escrow config updated. Tx: " + tx);
      addLog("Update Config", tx, "New LuxHub wallet: " + newLuxhubWallet);
      refreshData();
    } catch (error: any) {
      console.error("[updateEscrowConfig] error:", error);
      setStatus("Update failed: " + error.message);
      addLog("Update Config", "N/A", "Error: " + error.message);
    }
  };

  const addAdmin = async () => {
    if (!wallet.publicKey || !program || !adminListPda) {
      alert("Wallet not connected or program not ready.");
      return;
    }
    try {
      console.log("[addAdmin] Adding new admin:", newAdmin);
      const newAdminPk = new PublicKey(newAdmin);
      const tx = await program.methods
        .addAdmin()
        .accounts({
          adminList: adminListPda,
          admin: wallet.publicKey,
          newAdmin: newAdminPk,
        })
        .rpc();
      setStatus("Admin added. Tx: " + tx);
      addLog("Add Admin", tx, "New admin: " + newAdmin);
      setNewAdmin("");
      refreshData();
    } catch (error: any) {
      console.error("[addAdmin] error:", error);
      setStatus("Add admin failed: " + error.message);
      addLog("Add Admin", "N/A", "Error: " + error.message);
    }
  };

  const removeAdmin = async () => {
    if (!wallet.publicKey || !program || !adminListPda) {
      alert("Wallet not connected or program not ready.");
      return;
    }
    try {
      console.log("[removeAdmin] Removing admin:", removeAdminAddr);
      const removeAdminPk = new PublicKey(removeAdminAddr);
      const tx = await program.methods
        .removeAdmin()
        .accounts({
          adminList: adminListPda,
          admin: wallet.publicKey,
          removeAdmin: removeAdminPk,
        })
        .rpc();
      setStatus("Admin removed. Tx: " + tx);
      addLog("Remove Admin", tx, "Removed admin: " + removeAdminAddr);
      setRemoveAdminAddr("");
      refreshData();
    } catch (error: any) {
      console.error("[removeAdmin] error:", error);
      setStatus("Remove admin failed: " + error.message);
      addLog("Remove Admin", "N/A", "Error: " + error.message);
    }
  };

  // ------------------------------------------------
  // Escrow Management
  // ------------------------------------------------
  const confirmDelivery = async (escrow: EscrowAccount) => {
    const confirm = window.confirm(
      `Approve delivery?\n\nBuyer paid ${(Number(escrow.salePrice) / LAMPORTS_PER_SOL).toFixed(2)} SOL.\nSeller will receive ${(Number(escrow.salePrice) * 0.95 / LAMPORTS_PER_SOL).toFixed(2)} SOL.\nLuxHub earns 5%.`
    );
    if (!confirm) return;
  
    if (!wallet.publicKey || !program || !currentEscrowConfig) {
      toast.error("Wallet not connected or program not ready.");
      return;
    }
  
    setLoading(true);
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.devnet.solana.com");
  
    try {
      const seedBuffer = new BN(escrow.seed).toArrayLike(Buffer, "le", 8);
      const [escrowPda] = PublicKey.findProgramAddressSync([Buffer.from("state"), seedBuffer], program.programId);
  
      const onchainEscrow = await (program.account as any).escrow.fetch(escrowPda);
      const buyerPubkey = onchainEscrow.buyer?.toBase58?.();
      if (!buyerPubkey || buyerPubkey === PublicKey.default.toBase58()) {
        toast.error("Buyer not set. Purchase must occur before delivery.");
        return;
      }
  
      const nftMint = new PublicKey(escrow.mintB);
      const vault = await getAssociatedTokenAddress(nftMint, escrowPda, true);
      const sellerNftAta = await getAssociatedTokenAddress(nftMint, new PublicKey(escrow.initializer));
      const buyerNftAta = await getAssociatedTokenAddress(nftMint, new PublicKey(buyerPubkey));
  
      const sellerFundsAta = await getAssociatedTokenAddress(
        new PublicKey(FUNDS_MINT),
        new PublicKey(escrow.initializer)
      );
      const info = await connection.getAccountInfo(sellerFundsAta);
      console.log("👀 Seller wSOL ATA exists?", !!info);
      const luxhubFeeAta = await getAssociatedTokenAddress(
        new PublicKey(FUNDS_MINT),
        new PublicKey(currentEscrowConfig)
      );

      const nftVault = await getAssociatedTokenAddress(new PublicKey(escrow.mintB), escrowPda, true);
      const wsolVault = await getAssociatedTokenAddress(new PublicKey(FUNDS_MINT), escrowPda, true);
      
      const nftVaultInfo = await connection.getAccountInfo(nftVault);
      const wsolVaultInfo = await connection.getAccountInfo(wsolVault);
      
      if (!nftVaultInfo) {
        console.warn("❌ NFT vault account does not exist:", nftVault.toBase58());
        toast.error("NFT vault does not exist. Cannot confirm delivery.");
        return;
      }
      
      if (!wsolVaultInfo) {
        console.warn("❌ wSOL vault account does not exist:", wsolVault.toBase58());
        toast.error("wSOL vault does not exist. Cannot confirm delivery.");
        return;
      }
      
      const nftAmount = await connection.getTokenAccountBalance(nftVault);
      const wsolAmount = await connection.getTokenAccountBalance(wsolVault);
      
      console.log("📦 NFT Vault Amount:", nftAmount.value.amount);
      console.log("💰 wSOL Vault Amount:", wsolAmount.value.amount);
      

      // Convert balances to numbers for comparison
      const nftAvailable = Number(nftAmount.value.amount);
      const wsolAvailable = Number(wsolAmount.value.amount);
      const expectedWsol = Number(escrow.salePrice); // already in lamports

      if (nftAvailable < 1) {
        toast.error("Vault NFT balance is insufficient. Cannot transfer.");
        return;
      }

      if (wsolAvailable < expectedWsol) {
        toast.error(`Vault does not have enough wSOL. Expected: ${expectedWsol}, Found: ${wsolAvailable}`);
        return;
      }

      console.warn("🔍 NFT Vault:", nftVault.toBase58(), "Amount:", nftAvailable);
      console.warn("🔍 wSOL Vault:", wsolVault.toBase58(), "Amount:", wsolAvailable);


  
      const tx = await program.methods
        .confirmDelivery()
        .accounts({
          luxhub: wallet.publicKey,
          escrow: escrowPda,
          vault,
          mintA: new PublicKey(FUNDS_MINT),
          mintB: nftMint,
          sellerFundsAta,
          luxhubFeeAta,
          sellerNftAta,
          buyerNftAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
  
      toast.success("✅ Delivery confirmed!");
      setStatus("Delivery confirmed. Tx: " + tx);
      addLog("Confirm Delivery", tx, `Escrow ${escrow.seed}`);
  
      // === METADATA UPDATE ===
      const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));
      const nft = await metaplex.nfts().findByMint({ mintAddress: nftMint });
      const res = await fetch(nft.uri);
      const metadata = await res.json();
  
      metadata.attributes = metadata.attributes || [];
  
      const updateAttr = (key: string, val: string) => {
        const found = metadata.attributes.find((a: any) => a.trait_type === key);
        if (found) found.value = val;
        else metadata.attributes.push({ trait_type: key, value: val });
      };
  
      updateAttr("Provenance", escrow.initializer);
      updateAttr("Owner", buyerPubkey);
      updateAttr("Market Status", "Holding LuxHub");
      metadata.updatedAt = new Date().toISOString();
  
      const newUri = await uploadToPinata(metadata, metadata.name || "Updated Metadata");
      await updateNftMetadata(wallet as any, escrow.mintB, { uri: newUri });
  
      await fetch("/api/nft/updateStatus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintAddress: escrow.mintB, marketStatus: "sold" }),
      });
  
      await fetchActiveEscrows();
    } catch (err: any) {
      console.error("[confirmDelivery] error:", err);
      setStatus("Confirm delivery failed: " + err.message);
      toast.error("❌ Delivery failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  
  

  const cancelEscrow = async (escrow: EscrowAccount) => {
    if (!wallet.publicKey || !program) {
      alert("Wallet not connected or program not ready.");
      return;
    }
  
    try {
      console.log("[cancelEscrow] Cancelling escrow with seed:", escrow.seed);
      const seedBuffer = new BN(escrow.seed).toArrayLike(Buffer, "le", 8);
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), seedBuffer],
        program.programId
      );
  
      const vault = await getAssociatedTokenAddress(
        new PublicKey(FUNDS_MINT),
        escrowPda,
        true
      );
  
      const tx = await program.methods
        .cancel()
        .accounts({
          initializer: wallet.publicKey,
          mintA: new PublicKey(escrow.mintA),
          initializerAta: await getAssociatedTokenAddress(
            new PublicKey(FUNDS_MINT),
            new PublicKey(escrow.initializer)
          ),          
          escrow: escrowPda,
          vault: vault,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        })
        .rpc();
  
      setStatus("Escrow canceled. Tx: " + tx);
      addLog("Cancel Escrow", tx, "For escrow seed: " + escrow.seed);
  
      await fetch("/api/nft/updateStatus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mintAddress: escrow.mintB,
          marketStatus: "active",
        }),
      });
  
      fetchActiveEscrows();
    } catch (error: any) {
      console.error("[cancelEscrow] error:", error);
      setStatus("Cancel escrow failed: " + error.message);
      addLog("Cancel Escrow", "N/A", "Error: " + error.message);
      toast.error(`❌ Cancel failed: ${error.message}`);
    }
  };
  
  

  // ------------------------------------------------
  // Approve Sale -> Escrow creation (with automatic NFT deposit)
  // ------------------------------------------------
  const handleApproveSale = async (req: SaleRequest) => {
    console.log("[handleApproveSale] Sale request data:", req);
    if (!req.seller) {
      console.error("[handleApproveSale] Missing seller:", req);
      setStatus("Error: Missing seller field");
      return;
    }
  
    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.devnet.solana.com"
      );
  
      const sellerPk = new PublicKey(req.seller);
      const buyerPk = new PublicKey(
        typeof req.buyer === "string" ? req.buyer : PLACEHOLDER_BUYER.toBase58()
      );
      console.log("[handleApproveSale] Raw buyer field:", req.buyer);
      const luxhubPk = new PublicKey(
        typeof req.luxhubWallet === "string" ? req.luxhubWallet : currentEscrowConfig
      );
      

      const nftMint = new PublicKey(req.nftId);

      if (
        req.seed === undefined ||
        req.initializerAmount === undefined ||
        req.takerAmount === undefined ||
        req.salePrice === undefined
      ) {
        console.error("[handleApproveSale] Invalid BN input:", req);
        setStatus("Error: Missing required numeric fields");
        return;
      }
      const seed = Number(req.seed);
      
      const seedBuffer = new BN(seed).toArrayLike(Buffer, "le", 8);
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), seedBuffer],
        program!.programId
      );
      console.log("[handleApproveSale] Escrow PDA:", escrowPda.toBase58());
      
      // 🛑 Prevent re-initializing if PDA already exists
      const escrowInfo = await connection.getAccountInfo(escrowPda);
      if (escrowInfo !== null) {
        alert("Escrow PDA already exists. Proceeding to update metadata...");
        setStatus("Escrow already initialized — updating metadata and cleaning up.");
        console.warn("[handleApproveSale] PDA exists. Updating metadata...");
      
        await updateNFTMarketStatus(req.nftId, "active", wallet);
        await fetch("/api/nft/updateStatus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mintAddress: req.nftId,
            marketStatus: "active"
          }),
        });
      
        setSaleRequests((prev) => prev.filter((r) => r.nftId !== req.nftId));
        await refreshData();
        return;
      }
      
      
      console.log("[handleApproveSale] Escrow PDA:", escrowPda.toBase58());
  
      const vaultAta = await getAssociatedTokenAddress(nftMint, escrowPda, true);
      const vaultInfo = await connection.getAccountInfo(vaultAta);
  
      if (!vaultInfo) {
        alert("Vault ATA does not exist yet. Please wait for the seller to deposit the NFT.");
        return;
      }
  
      const vaultBalance = await connection.getTokenAccountBalance(vaultAta);
      const vaultAmount = Number(vaultBalance.value.uiAmount || 0);
  
      if (vaultAmount < req.initializerAmount) {
        alert("Vault ATA balance is insufficient. Please wait for the seller to deposit the NFT.");
        return;
      }
  
      console.log("[handleApproveSale] Vault ATA validated.");
  
      setStatus("Approving listing...");
      addLog("Approve Sale", "N/A", `Vault validated. Seed: ${seed}`);
      console.log("[DEBUG] BN inputs:", {
        seed: req.seed,
        initializerAmount: req.initializerAmount,
        takerAmount: req.takerAmount,
        salePrice: req.salePrice,
      });

      const resolvedLuxhubWallet = req.luxhubWallet || currentEscrowConfig;

      if (!resolvedLuxhubWallet) {
        console.error("[handleApproveSale] LuxHub wallet is missing from request and config.");
        setStatus("Error: Missing LuxHub Wallet");
        return;
      }

      console.log("[handleApproveSale] Using LuxHub Wallet:", resolvedLuxhubWallet);
      console.log("[handleApproveSale] Using buyer wallet:", buyerPk.toBase58());
      console.log("[handleApproveSale] Using seller wallet:", sellerPk.toBase58());
      console.log("[handleApproveSale] Using NFT mint:", nftMint.toBase58());
      console.log("[handleApproveSale] Using luxhubPk:", luxhubPk.toBase58());
  
      // ⬇️ Initialize escrow on-chain
      const tx = await program!.methods
        .initialize(
          new BN(seed),
          new BN(req.initializerAmount),
          new BN(req.takerAmount),
          req.fileCid,
          luxhubPk,
          new BN(req.salePrice),
          buyerPk
        )
        .accounts({
          admin: wallet.publicKey!,
          seller: sellerPk,
          mintA: new PublicKey(FUNDS_MINT),
          mintB: nftMint,
          sellerAtaA: await getAssociatedTokenAddress(new PublicKey(FUNDS_MINT), sellerPk),
          sellerAtaB: await getAssociatedTokenAddress(nftMint, sellerPk),
          escrow: escrowPda,
          vault: vaultAta,
          associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
  
      console.log("✅ initialize tx:", tx);
  
      // Update metadata in your DB
      await updateNFTMarketStatus(req.nftId, "active", wallet);
  
      setSaleRequests((prev) => prev.filter((r) => r.nftId !== req.nftId));
      await refreshData();
      setStatus("NFT approved and escrow initialized ✅");
  
    } catch (error: any) {
      console.error("[handleApproveSale] error:", error);
      setStatus("Approve sale failed: " + error.message);
      addLog("Approve Sale", "N/A", "Error: " + error.message);
    }
  };
  
  

  const barChartData = {
    labels: Object.keys(
      logs.reduce((acc: { [action: string]: number }, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      }, {})
    ),
    datasets: [
      {
        label: "Admin Actions",
        data: Object.values(
          logs.reduce((acc: { [action: string]: number }, log) => {
            acc[log.action] = (acc[log.action] || 0) + 1;
            return acc;
          }, {})
        ),
        backgroundColor: "rgba(176, 144, 252, 0.6)",
      },
    ],
  };

  const pieChartData = {
    labels: ["Royalty Earned", "Total Escrow Volume"],
    datasets: [
      {
        data: [totalRoyaltyEarned, totalEscrowVolume],
        backgroundColor: ["rgb(176, 144, 252)", "rgb(80, 68, 111)"],
      },
    ],
  };

  useEffect(() => {
    const fetchVaults = async () => {
      if (!program) return;
      const result: { [seed: string]: string } = {};
  
      for (const escrow of activeEscrows) {
        try {
          const seedBuffer = new BN(escrow.seed).toArrayLike(Buffer, "le", 8);
          const [escrowPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("state"), seedBuffer],
            program.programId
          );
          const vault = await getAssociatedTokenAddress(
            new PublicKey(escrow.mintB),
            escrowPda,
            true
          );
          result[escrow.seed.toString()] = vault.toBase58();
        } catch (e) {
          console.error("Vault fetch failed for seed", escrow.seed, e);
        }
      }
  
      setVaultAddresses(result);
    };
  
    fetchVaults();
  }, [activeEscrows, program]);

  const renderTabContent = () => {
    switch (tabIndex) {
      case 0:
        return (
          <div>
            <div className={styles.inputGroup}>
              <label>Current LuxHub Wallet:</label>
              <div className={styles.luxhubWallet}>{currentEscrowConfig}</div>
            </div>
            <div className={styles.inputGroup}>
              <label>Set LuxHub Wallet:</label>
              <input
                type="text"
                placeholder="Initialize LuxHub Wallet Address"
                value={luxhubWallet}
                onChange={(e) => setLuxhubWallet(e.target.value)}
              />
              <button onClick={initializeEscrowConfig}>Initialize Config</button>
            </div>
            <div className={styles.inputGroup}>
              <label>New LuxHub Wallet:</label>
              <input
                type="text"
                placeholder="Enter New LuxHub Wallet Address"
                value={newLuxhubWallet}
                onChange={(e) => setNewLuxhubWallet(e.target.value)}
              />
              <button onClick={updateEscrowConfig}>Update Config</button>
            </div>
            <div className={styles.inputGroup}>
              <label>Admin List</label>
              {adminList.length === 0 ? (
                <p>No admins found.</p>
              ) : (
                adminList.map((adminStr, idx) => (
                  <div key={idx} className={styles.listItem}>{adminStr}</div>
                ))
              )}
            </div>
            <div className={styles.inputGroup}>
              <label>Add Admin (Wallet Address):</label>
              <input
                type="text"
                placeholder="Enter New Admin Wallet Address"
                value={newAdmin}
                onChange={(e) => setNewAdmin(e.target.value)}
              />
              <button onClick={addAdmin}>Add Admin</button>
            </div>
            <div className={styles.inputGroup}>
              <label>Remove Admin (Wallet Address):</label>
              <input
                type="text"
                placeholder="Remove Admin (Enter Admin Wallet Address)"
                value={removeAdminAddr}
                onChange={(e) => setRemoveAdminAddr(e.target.value)}
              />
              <button onClick={removeAdmin}>Remove Admin</button>
            </div>
            <div className={styles.inputGroup}>
              <label>Buyer Wallet (for NFT transfer):</label>
              <input
                type="text"
                value={buyerWallet}
                onChange={(e) => setBuyerWallet(e.target.value)}
              />
            </div>
            <div className={styles.inputGroup}>
              <button onClick={refreshData}>
                {loading ? "Refreshing..." : "Refresh Data"}
              </button>
            </div>
          </div>
        );
      case 1:
        return (
          <div>
            <h2>Admin List</h2>
            {adminList.length === 0 ? (
              <p>No admins found.</p>
            ) : (
              adminList.map((adminStr, idx) => (
                <div key={idx} className={styles.listItem}>{adminStr}</div>
              ))
            )}
          </div>
        );
        case 2:
          return (
            <div>
              <h2>Active Escrows</h2>
              {activeEscrows.length === 0 ? (
                <p>No active escrows found.</p>
              ) : (
                activeEscrows.map((escrow, idx) => {
                  if (Number(escrow.seed.toString()) === 0) return null;

                  const initializerAmountSol = Number(escrow.initializer_amount) / LAMPORTS_PER_SOL;
                  const takerAmountSol = Number(escrow.taker_amount) / LAMPORTS_PER_SOL;
                  const salePriceSol = Number(escrow.salePrice) / LAMPORTS_PER_SOL;

                  if (!program) return null;

                  const seedBuffer = new BN(escrow.seed).toArrayLike(Buffer, "le", 8);
                  const [escrowPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("state"), seedBuffer],
                    program.programId
                  );

                  return (
                    <div key={idx} className={styles.listingCard}>
                      <h3>{escrow.name || "Unnamed NFT"}</h3>

                      {escrow.image && (
                        <div className={styles.nftImageWrapper}>
                          <img
                            src={escrow.image}
                            alt={escrow.name}
                            className={styles.nftImage}
                            style={{ maxWidth: "200px", borderRadius: "10px" }}
                          />
                        </div>
                      )}

                      <p className={styles.nftDescription}>
                        {escrow.description || "No description available."}
                      </p>

                      <p><strong>Seed:</strong> {escrow.seed.toString()}</p>

                      <p>
                        <strong>Escrow PDA:</strong>{" "}
                        <a
                          href={`https://solscan.io/account/${escrowPda.toBase58()}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {escrowPda.toBase58()}
                        </a>
                      </p>

                      <p>
                        <strong>Vault ATA:</strong>{" "}
                        <code>{escrow.vaultATA || "Loading..."}</code>
                      </p>

                      <p><strong>Mint Address:</strong> {escrow.mintB}</p>
                      <p><strong>Initializer Wallet:</strong> {escrow.initializer}</p>
                      <p><strong>Initializer Amount:</strong> {initializerAmountSol.toFixed(2)} SOL</p>
                      <p><strong>Taker Amount:</strong> {takerAmountSol.toFixed(2)} SOL</p>
                      <p><strong>Sale Price:</strong> {salePriceSol.toFixed(2)} SOL</p>
                      <p><strong>Royalty (3%):</strong> {(salePriceSol * 0.03).toFixed(2)} SOL</p>
                      <p><strong>File CID:</strong> {escrow.file_cid}</p>

                      {escrow.attributes && escrow.attributes.length > 0 && (
                        <div className={styles.attributesSection}>
                          <h4>Attributes:</h4>
                          <ul>
                            {escrow.attributes.map((attr: any, i: number) => (
                              <li key={i}>
                                <strong>{attr.trait_type}:</strong> {attr.value}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className={styles.actions}>
                        <button onClick={() => confirmDelivery(escrow)}>Confirm Delivery</button>
                        <button onClick={() => cancelEscrow(escrow)}>Cancel Escrow</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          );
      case 3:
        return (
          <div>
            <h2>Detailed Analytics</h2>
            <div className={styles.chartContainer}>
              <h3>Admin Actions</h3>
              <div className={styles.chart}>
                <Bar
                  data={barChartData}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { position: "top" },
                      title: { display: true, text: "Admin Actions" },
                    },
                  }}
                />
              </div>
            </div>
            <div className={styles.chartContainer}>
              <h3>Royalty vs Escrow Volume</h3>
              <div className={styles.chart}>
                <Pie
                  data={pieChartData}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { position: "top" },
                      title: { display: true, text: "Royalty vs Escrow Volume" },
                    },
                  }}
                />
              </div>
            </div>
            <div className={styles.inputGroup}>
              <p><strong>Total Escrow Volume:</strong> {totalEscrowVolume}</p>
              <p><strong>Total Royalty Earned (3%):</strong> {totalRoyaltyEarned.toFixed(2)}</p>
            </div>
          </div>
        );
      case 4:
        return (
          <div>
            <h2>Transaction Logs (On‑Chain Events Only)</h2>
            {logs.length === 0 ? (
              <p>No on‑chain event logs available.</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className={styles.listingCard}>
                  <p className={styles.logTimestamp}>{log.timestamp}</p>
                  <p className={styles.logAction}>{log.action}</p>
                  <p className={styles.logTx}>Tx: {log.tx}</p>
                  <p className={styles.logMessage}>{log.message}</p>
                </div>
              ))
            )}
          </div>
        );
        case 5:
          return (
            <div>
              <h2>Sale Requests</h2>
              <div className={styles.inputGroup}>
                <input
                  type="text"
                  placeholder="Filter by Seller Wallet"
                  value={sellerFilter}
                  onChange={(e) => setSellerFilter(e.target.value)}
                />
                <button onClick={() => fetchSaleRequests(1, sellerFilter)}>Search</button>
              </div>
              <div className={styles.paginationControls}>
                <button
                  disabled={currentPage === 1}
                  onClick={() => fetchSaleRequests(currentPage - 1, sellerFilter)}
                >
                  Prev
                </button>
                <span>Page {currentPage}</span>
                <button
                  disabled={isLastPage}
                  onClick={() => fetchSaleRequests(currentPage + 1, sellerFilter)}
                >
                  Next
                </button>
              </div>
              {saleRequests.length === 0 ? (
                <p>No pending sale requests.</p>
              ) : (
                saleRequests.map((req, idx) => {
                  const currentSeed = req.seed ?? dynamicSeeds.get(req.nftId) ?? Date.now();

                  const updateSeed = () => {
                    const newSeed = Date.now();
                    setDynamicSeeds((prev) => {
                      const updated = new Map(prev);
                      updated.set(req.nftId, newSeed); // override the seed for this NFT
                      return updated;
                    });
                  
                    // Optional: show status message or toast
                    toast.success("✅ New seed generated for listing.");
                  };
                  

                  return (
                    <div key={idx} className={styles.listingCard}>
                      <p className={styles.statusBadge}>PENDING</p>
                      <p><strong>NFT Mint:</strong> {req.nftId}</p>
                      <p><strong>Seller:</strong> {req.seller}</p>
                      <p><strong>Seed:</strong> {currentSeed}</p>
                      <p><strong>Initializer Amount (SOL):</strong> {req.initializerAmount}</p>
                      <p><strong>Taker Amount (SOL):</strong> {req.takerAmount}</p>
                      <p><strong>Sale Price (SOL):</strong> {req.salePrice}</p>
                      <p><strong>File CID:</strong> {req.fileCid}</p>
                      <p><strong>Requested at:</strong> {new Date(req.timestamp).toLocaleString()}</p>
                      <div className={styles.actions}>
                        <button
                          disabled={!req.seller}
                          onClick={() => handleApproveSale({ ...req, seed: currentSeed })}
                        >
                          Approve Sale
                        </button>
                        <button onClick={updateSeed}>Generate New Seed</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          );
      default:
        return null;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Admin.Hub</h1>
      </div>
      {!wallet.publicKey ? (
        <p>Please connect your wallet.</p>
      ) : isAdmin === false ? (
        <>
          <h1>Admin Dashboard</h1>
          <p>If you believe this is an error, check your admin config or switch wallets.</p>
        </>
      ) : isAdmin === null ? (
        <>
          <h1>Admin Dashboard</h1>
          <p>Loading admin information...</p>
        </>
      ) : (
        <>
          <div className={styles.tabContainer}>
            <button onClick={() => setTabIndex(0)} className={tabIndex === 0 ? styles.activeTab : ""}>
              Configuration
            </button>
            <button onClick={() => setTabIndex(1)} className={tabIndex === 1 ? styles.activeTab : ""}>
              User Management
            </button>
            <button onClick={() => setTabIndex(2)} className={tabIndex === 2 ? styles.activeTab : ""}>
              Escrow Management
            </button>
            <button onClick={() => setTabIndex(3)} className={tabIndex === 3 ? styles.activeTab : ""}>
              Detailed Analytics
            </button>
            <button onClick={() => setTabIndex(4)} className={tabIndex === 4 ? styles.activeTab : ""}>
              Transaction Logs
            </button>
            <button onClick={() => setTabIndex(5)} className={tabIndex === 5 ? styles.activeTab : ""}>
              Sale Requests
            </button>
          </div>
          <div className={styles.content}>{renderTabContent()}</div>
        </>
      )}
      <div className={styles.status}>
        <p>{status}</p>
      </div>
    </div>
  );
};

export default AdminDashboard;
