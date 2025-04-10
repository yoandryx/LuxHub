// src/pages/adminDashboard.tsx
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
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import { uploadToPinata } from "../utils/pinata";
import { updateNftMetadata } from "../utils/metadata";  // We'll reference updateNftMetadata
import styles from "../styles/AdminDashboard.module.css";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

interface LogEntry {
  timestamp: string;
  action: string;
  tx: string;
  message: string;
}

interface SaleRequest {
  nftId: string;          // Mint address
  seller: string;         // Seller's wallet
  seed: number;           // Unique seed for the escrow
  initializerAmount: number; // SOL
  takerAmount: number;        // SOL
  fileCid: string;
  salePrice: number;      // SOL
  ipfs_pin_hash?: string;
  timestamp: number;
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
}

const FUNDS_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Force a new CID by re-uploading the JSON with updatedAt
 * Then update it on chain with updateNftMetadata
 */
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

    // 1) Fetch on-chain NFT
    console.log("[updateNFTMarketStatus] Fetching on-chain NFT for mint:", mintAddress);
    const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mintAddress) });
    console.log("[updateNFTMarketStatus] Retrieved NFT data:", nft);

    // 2) Fetch off-chain metadata
    console.log("[updateNFTMarketStatus] Fetching current metadata JSON from:", nft.uri);
    const res = await fetch(nft.uri);
    if (!res.ok) {
      throw new Error("Failed to fetch current metadata");
    }
    const metadata = await res.json();
    console.log("[updateNFTMarketStatus] Current metadata JSON:", metadata);

    // 3) Update Market Status
    if (!metadata.attributes || !Array.isArray(metadata.attributes)) {
      metadata.attributes = [];
    }
    let updated = false;
    metadata.attributes = metadata.attributes.map((attr: any) => {
      if (attr.trait_type === "Market Status") {
        console.log(
          "[updateNFTMarketStatus] Changing Market Status from",
          attr.value,
          "to",
          newMarketStatus
        );
        updated = true;
        return { ...attr, value: newMarketStatus };
      }
      return attr;
    });
    if (!updated) {
      console.log("[updateNFTMarketStatus] 'Market Status' not found. Adding it...");
      metadata.attributes.push({ trait_type: "Market Status", value: newMarketStatus });
    }

    // Force new CID
    metadata.updatedAt = new Date().toISOString();
    console.log("[updateNFTMarketStatus] Final metadata JSON with updatedAt:", metadata);

    // 4) Re-upload
    console.log("[updateNFTMarketStatus] Uploading updated metadata JSON to Pinata...");
    const newUri = await uploadToPinata(metadata, metadata.name || "Updated NFT Metadata");
    console.log("[updateNFTMarketStatus] New metadata URI:", newUri);

    // 5) Optionally rename NFT to indicate status
    const newName = nft.name.endsWith("(Active)") ? nft.name : nft.name + " (Active)";
    console.log("[updateNFTMarketStatus] New name to update:", newName);

    // 6) On-chain update
    console.log("[updateNFTMarketStatus] Sending updateNftMetadata transaction with {uri, name}...");
    await updateNftMetadata(wallet as any, mintAddress, { uri: newUri, name: newName } as any);
    console.log(
      "[updateNFTMarketStatus] On-chain NFT metadata update complete. Market Status set to:",
      newMarketStatus
    );
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
  const [initializerAta, setInitializerAta] = useState<string>("");

  const [saleRequests, setSaleRequests] = useState<SaleRequest[]>([]);
  const [activeEscrows, setActiveEscrows] = useState<EscrowAccount[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Program & PDAs
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

  // Log helper
  const addLog = (action: string, tx: string, message: string) => {
    const timestamp = new Date().toLocaleString();
    const newLog: LogEntry = { timestamp, action, tx, message };
    console.log(`[${timestamp}] ${action}: ${message} (tx: ${tx})`);
    setLogs((prev) => [...prev, newLog]);
  };

  // RPC Retry
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

  // Fetch config & admins
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

  // Fetch active escrows
  const fetchActiveEscrows = async () => {
    if (!program) return;
    try {
      const escrows = await (program.account as any).escrow.all();
      const mapped = escrows.map((acc: any) => ({
        seed: acc.account.seed,
        initializer: acc.account.initializer.toBase58(),
        luxhub_wallet: acc.account.luxhub_wallet ? acc.account.luxhub_wallet.toBase58() : "",
        initializer_amount: acc.account.initializer_amount
          ? acc.account.initializer_amount.toString()
          : "0",
        taker_amount: acc.account.taker_amount ? acc.account.taker_amount.toString() : "0",
        salePrice: acc.account.sale_price ? acc.account.sale_price.toString() : "0",
        file_cid: acc.account.file_cid || "",
        mintA: acc.account.mint_a ? acc.account.mint_a.toBase58() : "",
        mintB: acc.account.mint_b ? acc.account.mint_b.toBase58() : "",
      }));
      setActiveEscrows(mapped);
      console.log("[fetchActiveEscrows] Fetched active escrows:", mapped);
    } catch (e) {
      console.error("[fetchActiveEscrows] Failed to fetch active escrows", e);
    }
  };

  // Fetch sale requests
  const fetchSaleRequests = async () => {
    try {
      const res = await fetch("/api/nft/pendingRequests");
      const data = await res.json();
      setSaleRequests(data);
      console.log("[fetchSaleRequests] Fetched sale requests:", data);
    } catch (error) {
      console.error("[fetchSaleRequests] Error fetching sale requests:", error);
    }
  };

  const refreshData = async () => {
    setLoading(true);
    await fetchConfigAndAdmins();
    await fetchActiveEscrows();
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

  // ------------------------------------------------
  // Configuration & Admin Actions
  // ------------------------------------------------
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
    if (!wallet.publicKey || !program || !currentEscrowConfig) {
      alert("Wallet not connected or program not ready.");
      return;
    }
    try {
      console.log("[confirmDelivery] Confirming delivery for seed:", escrow.seed);
      const seedBuffer = new BN(escrow.seed).toArrayLike(Buffer, "le", 8);
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), seedBuffer],
        program.programId
      );
      const vault = await getAssociatedTokenAddress(new PublicKey(escrow.mintA), escrowPda, true);
      const sellerFundsAta = await getAssociatedTokenAddress(
        new PublicKey(escrow.mintA),
        new PublicKey(escrow.initializer),
        false
      );
      const luxhubFeeAta = await getAssociatedTokenAddress(
        new PublicKey(escrow.mintA),
        new PublicKey(currentEscrowConfig),
        false
      );
      const nftMint = new PublicKey(escrow.mintB);
      const sellerNftAta = await getAssociatedTokenAddress(
        nftMint,
        new PublicKey(escrow.initializer),
        false
      );
      const buyerNftAta = await getAssociatedTokenAddress(
        nftMint,
        new PublicKey(buyerWallet),
        false
      );
      const tx = await program.methods
        .confirmDelivery()
        .accounts({
          luxhub: wallet.publicKey,
          escrow: escrowPda,
          vault: vault,
          mintA: new PublicKey(escrow.mintA),
          sellerFundsAta,
          luxhubFeeAta,
          nftMint,
          sellerNftAta,
          buyerNftAta,
          adminList: adminListPda!,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        })
        .rpc();
      setStatus("Delivery confirmed. Tx: " + tx);
      addLog("Confirm Delivery", tx, "For escrow seed: " + escrow.seed);
      fetchActiveEscrows();
    } catch (error: any) {
      console.error("[confirmDelivery] error:", error);
      setStatus("Confirm delivery failed: " + error.message);
      addLog("Confirm Delivery", "N/A", "Error: " + error.message);
    }
  };

  const cancelEscrow = async (escrow: EscrowAccount) => {
    if (!wallet.publicKey || !program || !initializerAta) {
      alert("Wallet not connected or program not ready. Please set the Initializer ATA in config.");
      return;
    }
    try {
      console.log("[cancelEscrow] Cancelling escrow with seed:", escrow.seed);
      const seedBuffer = new BN(escrow.seed).toArrayLike(Buffer, "le", 8);
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), seedBuffer],
        program!.programId
      );
      const vault = await getAssociatedTokenAddress(new PublicKey(FUNDS_MINT), escrowPda, true);
      const tx = await program.methods
        .cancel()
        .accounts({
          initializer: wallet.publicKey,
          mintA: new PublicKey(escrow.mintA),
          initializerAtaA: new PublicKey(initializerAta),
          escrow: escrowPda,
          vault: vault,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        })
        .rpc();
      setStatus("Escrow canceled. Tx: " + tx);
      addLog("Cancel Escrow", tx, "For escrow seed: " + escrow.seed);
      fetchActiveEscrows();
    } catch (error: any) {
      console.error("[cancelEscrow] error:", error);
      setStatus("Cancel escrow failed: " + error.message);
      addLog("Cancel Escrow", "N/A", "Error: " + error.message);
    }
  };

  // ------------------------------------------------
  // Approve Sale -> Escrow creation
  // ------------------------------------------------
  const handleApproveSale = async (req: SaleRequest) => {
    console.log("[handleApproveSale] Sale request data:", req);
    console.log("[handleApproveSale] Type of seed =>", req.seed, typeof req.seed);
    if (!req.seller) {
      console.error("[handleApproveSale] Seller field missing:", req);
      setStatus("Error: Seller field missing");
      return;
    }
    try {
      console.log("[handleApproveSale] Approving listing for NFT:", req.nftId);
      const sellerPk = new PublicKey(req.seller);
      const seed = Number(req.seed);

      // Convert SOL -> lamports
      const initializerLamports = Math.round(req.initializerAmount * LAMPORTS_PER_SOL);
      const takerLamports = Math.round(req.takerAmount * LAMPORTS_PER_SOL);
      const salePriceLamports = Math.round(req.salePrice * LAMPORTS_PER_SOL);
      console.log("[handleApproveSale] Converted amounts (lamports):", {
        initializerLamports,
        takerLamports,
        salePriceLamports,
      });

      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.devnet.solana.com"
      );
      const sellerAtaA = await getAssociatedTokenAddress(new PublicKey(FUNDS_MINT), sellerPk);
      const sellerAtaAInfo = await connection.getAccountInfo(sellerAtaA);
      let preIx: any[] = [];
      if (!sellerAtaAInfo) {
        console.log("[handleApproveSale] Seller ATA not found; creating...");
        const createSellerAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey!,
          sellerAtaA,
          sellerPk,
          new PublicKey(FUNDS_MINT)
        );
        preIx.push(createSellerAtaIx);
      }

      const seedBuffer = new BN(seed).toArrayLike(Buffer, "le", 8);
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), seedBuffer],
        program!.programId
      );
      const vaultAta = await getAssociatedTokenAddress(new PublicKey(FUNDS_MINT), escrowPda, true);
      console.log("[handleApproveSale] Escrow PDA:", escrowPda.toBase58());

      const tx = await program!.methods
        .initialize(
          new BN(seed),
          new BN(initializerLamports),
          new BN(takerLamports),
          req.fileCid,
          new PublicKey(currentEscrowConfig),
          new BN(salePriceLamports)
        )
        .preInstructions(preIx)
        .accounts({
          admin: wallet.publicKey!,
          seller: sellerPk,
          mintA: new PublicKey(FUNDS_MINT),
          mintB: new PublicKey(req.nftId),
          sellerAtaA,
          escrow: escrowPda,
          vault: vaultAta,
          associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      console.log("[handleApproveSale] Escrow creation Tx:", tx);
      setStatus("Listing approved and escrow created. Tx: " + tx);
      addLog("Approve Sale", tx, "Escrow created for seed: " + seed);

      // Remove from saleRequests
      setSaleRequests((prev) => prev.filter((reqItem) => reqItem.nftId !== req.nftId));
      refreshData();

      // Finally, update the NFT market status to "active"
      console.log("[handleApproveSale] Updating NFT metadata market status to 'active'...");
      await updateNFTMarketStatus(req.nftId, "active", wallet);
    } catch (error: any) {
      console.error("[handleApproveSale] error:", error);
      setStatus("Approve sale failed: " + error.message);
      addLog("Approve Sale", "N/A", "Error: " + error.message);
    }
  };

  // ------------------------------------------------
  // Analytics & Logs
  // ------------------------------------------------
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

  // Tab content
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
                  <div key={idx} className={styles.listItem}>
                    {adminStr}
                  </div>
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
              <label>Initializer ATA (for Cancel Escrow):</label>
              <input
                type="text"
                value={initializerAta}
                onChange={(e) => setInitializerAta(e.target.value)}
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
                <div key={idx} className={styles.listItem}>
                  {adminStr}
                </div>
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
              activeEscrows.map((escrow, idx) => (
                <div key={idx} className={styles.listingCard}>
                  <p>
                    <strong>Seed:</strong> {escrow.seed}
                  </p>
                  <p>
                    <strong>Initializer:</strong> {escrow.initializer}
                  </p>
                  <p>
                    <strong>Initializer Amount:</strong> {escrow.initializer_amount}
                  </p>
                  <p>
                    <strong>Taker Amount:</strong> {escrow.taker_amount}
                  </p>
                  <p>
                    <strong>Sale Price:</strong> {escrow.salePrice} (lamports)
                  </p>
                  <p>
                    <strong>File CID:</strong> {escrow.file_cid}
                  </p>
                  <div className={styles.actions}>
                    <button onClick={() => {/* confirmDelivery(escrow) */}}>
                      Confirm Delivery
                    </button>
                    <button onClick={() => cancelEscrow(escrow)}>Cancel Escrow</button>
                  </div>
                </div>
              ))
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
              <p>
                <strong>Total Escrow Volume:</strong> {totalEscrowVolume}
              </p>
              <p>
                <strong>Total Royalty Earned (3%):</strong> {totalRoyaltyEarned.toFixed(2)}
              </p>
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
            <button onClick={fetchSaleRequests}>Refresh Sale Requests</button>
            {saleRequests.length === 0 ? (
              <p>No pending sale requests.</p>
            ) : (
              saleRequests.map((req, idx) => (
                <div key={idx} className={styles.listingCard}>
                  <p>
                    <strong>NFT Mint:</strong> {req.nftId}
                  </p>
                  <p>
                    <strong>Seller:</strong> {req.seller}
                  </p>
                  <p>
                    <strong>Seed:</strong> {req.seed}
                  </p>
                  <p>
                    <strong>Initializer Amount (SOL):</strong> {req.initializerAmount}
                  </p>
                  <p>
                    <strong>Taker Amount (SOL):</strong> {req.takerAmount}
                  </p>
                  <p>
                    <strong>Sale Price (SOL):</strong> {req.salePrice}
                  </p>
                  <p>
                    <strong>File CID:</strong> {req.fileCid}
                  </p>
                  <p>
                    <strong>Requested at:</strong>{" "}
                    {new Date(req.timestamp).toLocaleString()}
                  </p>
                  <button disabled={!req.seller} onClick={() => handleApproveSale(req)}>
                    Approve Sale
                  </button>
                </div>
              ))
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
          <p>Unauthorized: You are not an admin.</p>
        </>
      ) : isAdmin === null ? (
        <>
          <h1>Admin Dashboard</h1>
          <p>Loading admin information...</p>
        </>
      ) : (
        <>
          <div className={styles.tabContainer}>
            <button
              onClick={() => setTabIndex(0)}
              className={tabIndex === 0 ? styles.activeTab : ""}
            >
              Configuration
            </button>
            <button
              onClick={() => setTabIndex(1)}
              className={tabIndex === 1 ? styles.activeTab : ""}
            >
              User Management
            </button>
            <button
              onClick={() => setTabIndex(2)}
              className={tabIndex === 2 ? styles.activeTab : ""}
            >
              Escrow Management
            </button>
            <button
              onClick={() => setTabIndex(3)}
              className={tabIndex === 3 ? styles.activeTab : ""}
            >
              Detailed Analytics
            </button>
            <button
              onClick={() => setTabIndex(4)}
              className={tabIndex === 4 ? styles.activeTab : ""}
            >
              Transaction Logs
            </button>
            <button
              onClick={() => setTabIndex(5)}
              className={tabIndex === 5 ? styles.activeTab : ""}
            >
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
