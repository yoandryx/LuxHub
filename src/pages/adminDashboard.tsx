// src/pages/adminDashboard.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
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
import { getAssociatedTokenAddress } from "@solana/spl-token";
import styles from "../styles/AdminDashboard.module.css";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

// Types for audit logs and escrow account data.
interface LogEntry {
  timestamp: string;
  action: string;
  tx: string;
  message: string;
}

interface EscrowAccount {
  seed: number;
  initializer: string;
  luxhub_wallet: string;
  initializer_amount: string;
  taker_amount: string;
  file_cid: string;
  mintA: string;
  mintB: string;
}

// Define the event types that your on-chain program emits.
interface NftMintedEvent {
  mint: PublicKey;
}

interface EscrowConfigChangedEvent {
  new_luxhub_wallet: PublicKey;
}

interface AdminChangedEvent {
  action: string;
  admin: PublicKey;
}

const AdminDashboard: React.FC = () => {
  // -----------------------
  // Hooks for State
  // -----------------------
  const wallet = useWallet();
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [status, setStatus] = useState<string>("");

  // Configuration state.
  const [luxhubWallet, setLuxhubWallet] = useState<string>("");
  const [newLuxhubWallet, setNewLuxhubWallet] = useState<string>("");
  const [currentEscrowConfig, setCurrentEscrowConfig] = useState<string>("");

  // Admin state.
  const [adminList, setAdminList] = useState<string[]>([]);
  const [newAdmin, setNewAdmin] = useState<string>("");
  const [removeAdminAddr, setRemoveAdminAddr] = useState<string>("");

  // Additional addresses.
  const [buyerWallet, setBuyerWallet] = useState<string>(""); // For NFT transfer.
  const [initializerAta, setInitializerAta] = useState<string>(""); // For cancel escrow.

  // Escrow management & logs.
  const [activeEscrows, setActiveEscrows] = useState<EscrowAccount[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Loading state.
  const [loading, setLoading] = useState<boolean>(false);

  // -----------------------
  // Utility Functions
  // -----------------------
  const addLog = (action: string, tx: string, message: string) => {
    const timestamp = new Date().toLocaleString();
    const newLog: LogEntry = { timestamp, action, tx, message };
    console.log(`[${timestamp}] ${action}: ${message} (tx: ${tx})`);
    setLogs((prev) => [...prev, newLog]);
  };

  // Memoize the program so it is only re-created when the wallet connects.
  const program = useMemo(() => (wallet.publicKey ? getProgram(wallet) : null), [wallet.publicKey]);

  // Derive PDAs using the same seeds as on-chain.
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

  // Helper: Retry mechanism for RPC calls.
  const fetchWithRetry = async (
    fetchFunc: () => Promise<any>,
    retries = 3,
    delay = 1000
  ): Promise<any> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fetchFunc();
      } catch (error: any) {
        if (error?.message?.includes("Too many requests") && attempt < retries - 1) {
          console.warn(`Rate limited. Retrying in ${delay * (attempt + 1)} ms...`);
          await new Promise((res) => setTimeout(res, delay * (attempt + 1)));
        } else {
          throw error;
        }
      }
    }
  };

  // -----------------------
  // On-Chain Data Fetching
  // -----------------------
  const fetchConfigAndAdmins = async () => {
    if (!program || !escrowConfigPda || !adminListPda) return;

    try {
      const configAccount = await fetchWithRetry(() =>
        (program.account as any).escrowConfig.fetch(escrowConfigPda)
      );
      console.log("Fetched escrow config:", configAccount);
      const luxhubWalletStr =
        configAccount.luxhubWallet && typeof configAccount.luxhubWallet.toBase58 === "function"
          ? configAccount.luxhubWallet.toBase58()
          : configAccount.luxhub_wallet && typeof configAccount.luxhub_wallet.toBase58 === "function"
          ? configAccount.luxhub_wallet.toBase58()
          : null;
      if (luxhubWalletStr) {
        setCurrentEscrowConfig(luxhubWalletStr);
      } else {
        console.warn("Escrow config not initialized; neither luxhubWallet nor luxhub_wallet found", configAccount);
        setCurrentEscrowConfig("Not initialized");
      }
    } catch (e) {
      console.error("Failed to fetch escrow config", e);
    }

    try {
      const adminAccountRaw = await fetchWithRetry(() =>
        (program.account as any).adminList.fetch(adminListPda)
      );
      console.log("Fetched admin account:", adminAccountRaw);
      if (adminAccountRaw && adminAccountRaw.admins) {
        const adminListStr: string[] = adminAccountRaw.admins
          .map((admin: any) =>
            admin && typeof admin.toBase58 === "function" ? admin.toBase58() : ""
          )
          .filter((adminStr: string) => adminStr !== "");
        setAdminList(adminListStr);
      } else {
        console.error("No 'admins' property found:", adminAccountRaw);
      }
    } catch (e) {
      console.error("Failed to fetch admin list", e);
    }
  };

  const fetchActiveEscrows = async () => {
    if (!program) return;
    try {
      const escrows = await (program.account as any).escrow.all();
      const mapped = escrows.map((acc: any) => ({
        seed: acc.account.seed,
        initializer: acc.account.initializer.toBase58(),
        luxhub_wallet: acc.account.luxhub_wallet.toBase58(),
        initializer_amount: acc.account.initializer_amount.toString(),
        taker_amount: acc.account.taker_amount.toString(),
        file_cid: acc.account.file_cid,
        mintA: acc.account.mint_a.toBase58(),
        mintB: acc.account.mint_b.toBase58(),
      }));
      setActiveEscrows(mapped);
      console.log("Fetched active escrows:", mapped);
    } catch (e) {
      console.error("Failed to fetch active escrows", e);
    }
  };

  const refreshData = async () => {
    setLoading(true);
    await fetchConfigAndAdmins();
    await fetchActiveEscrows();
    setLoading(false);
  };

  useEffect(() => {
    if (program) {
      refreshData();
    }
  }, [program]);

  // -----------------------
  // Admin Check
  // -----------------------
  useEffect(() => {
    if (wallet.publicKey && adminList.length > 0) {
      const isUserAdmin = adminList.some(
        (adminStr) => adminStr === wallet.publicKey!.toBase58()
      );
      setIsAdmin(isUserAdmin);
      console.log("Is user admin?", isUserAdmin);
    }
  }, [wallet.publicKey, adminList]);

  const totalEscrowVolume = activeEscrows.reduce(
    (acc, escrow) => acc + Number(escrow.initializer_amount),
    0
  );
  const totalRoyaltyEarned = totalEscrowVolume * 0.03;

  // -----------------------
  // Configuration Actions
  // -----------------------
  const initializeEscrowConfig = async () => {
    if (!wallet.publicKey || !program || !escrowConfigPda) {
      alert("Wallet not connected or program not ready.");
      return;
    }
    try {
      const luxhubPk = new PublicKey(luxhubWallet);
      const tx = await program.methods.initializeEscrowConfig(luxhubPk)
        .accounts({
          escrowConfig: escrowConfigPda,
          admin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        }).rpc();
      setStatus("Escrow config initialized. Tx: " + tx);
      addLog("Initialize Config", tx, "Set LuxHub wallet: " + luxhubWallet);
      refreshData();
    } catch (error: any) {
      console.error("Initialization error:", error);
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
      const newLuxhubPk = new PublicKey(newLuxhubWallet);
      const tx = await program.methods.updateEscrowConfig(newLuxhubPk)
        .accounts({
          escrowConfig: escrowConfigPda,
          admin: wallet.publicKey,
          adminList: adminListPda,
        }).rpc();
      setStatus("Escrow config updated. Tx: " + tx);
      addLog("Update Config", tx, "New LuxHub wallet: " + newLuxhubWallet);
      refreshData();
    } catch (error: any) {
      console.error("Update error:", error);
      setStatus("Update failed: " + error.message);
      addLog("Update Config", "N/A", "Error: " + error.message);
    }
  };

  // -----------------------
  // Admin Management Actions
  // -----------------------
  const addAdmin = async () => {
    if (!wallet.publicKey || !program || !adminListPda) {
      alert("Wallet not connected or program not ready.");
      return;
    }
    try {
      const newAdminPk = new PublicKey(newAdmin);
      const tx = await program.methods.addAdmin()
        .accounts({
          adminList: adminListPda,
          admin: wallet.publicKey,
          newAdmin: newAdminPk,
        }).rpc();
      setStatus("Admin added. Tx: " + tx);
      addLog("Add Admin", tx, "New admin: " + newAdmin);
      setNewAdmin("");
      refreshData();
    } catch (error: any) {
      console.error("Add admin error:", error);
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
      const removeAdminPk = new PublicKey(removeAdminAddr);
      const tx = await program.methods.removeAdmin()
        .accounts({
          adminList: adminListPda,
          admin: wallet.publicKey,
          removeAdmin: removeAdminPk,
        }).rpc();
      setStatus("Admin removed. Tx: " + tx);
      addLog("Remove Admin", tx, "Removed admin: " + removeAdminAddr);
      setRemoveAdminAddr("");
      refreshData();
    } catch (error: any) {
      console.error("Remove admin error:", error);
      setStatus("Remove admin failed: " + error.message);
      addLog("Remove Admin", "N/A", "Error: " + error.message);
    }
  };

  // -----------------------
  // Escrow Management Actions
  // -----------------------
  const confirmDelivery = async (escrow: EscrowAccount) => {
    if (!wallet.publicKey || !program || !currentEscrowConfig) {
      alert("Wallet not connected or program not ready.");
      return;
    }
    try {
      const seedBuffer = new BN(escrow.seed).toArrayLike(Buffer, "le", 8);
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), seedBuffer],
        program.programId
      );
      const vault = await getAssociatedTokenAddress(
        new PublicKey(escrow.mintA),
        escrowPda,
        true
      );
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
      const tx = await program.methods.confirmDelivery().accounts({
        luxhub: wallet.publicKey,
        escrow: escrowPda,
        vault: vault,
        mintA: new PublicKey(escrow.mintA),
        sellerFundsAta: sellerFundsAta,
        luxhubFeeAta: luxhubFeeAta,
        nftMint: nftMint,
        sellerNftAta: sellerNftAta,
        buyerNftAta: buyerNftAta,
        adminList: adminListPda!,
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      }).rpc();
      setStatus("Delivery confirmed. Tx: " + tx);
      addLog("Confirm Delivery", tx, "For escrow seed: " + escrow.seed);
      fetchActiveEscrows();
    } catch (error: any) {
      console.error("Confirm delivery error:", error);
      setStatus("Confirm delivery failed: " + error.message);
      addLog("Confirm Delivery", "N/A", "Error: " + error.message);
    }
  };

  const cancelEscrow = async (escrow: EscrowAccount) => {
    if (!wallet.publicKey || !program || !initializerAta) {
      alert("Wallet not connected or program not ready. Please set the Initializer ATA in Configuration.");
      return;
    }
    try {
      const seedBuffer = new BN(escrow.seed).toArrayLike(Buffer, "le", 8);
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), seedBuffer],
        program.programId
      );
      const vault = await getAssociatedTokenAddress(
        new PublicKey(escrow.mintA),
        escrowPda,
        true
      );
      const tx = await program.methods.cancel().accounts({
        initializer: wallet.publicKey,
        mintA: new PublicKey(escrow.mintA),
        initializerAtaA: new PublicKey(initializerAta),
        escrow: escrowPda,
        vault: vault,
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      }).rpc();
      setStatus("Escrow canceled. Tx: " + tx);
      addLog("Cancel Escrow", tx, "For escrow seed: " + escrow.seed);
      fetchActiveEscrows();
    } catch (error: any) {
      console.error("Cancel escrow error:", error);
      setStatus("Cancel escrow failed: " + error.message);
      addLog("Cancel Escrow", "N/A", "Error: " + error.message);
    }
  };

  // -----------------------
  // Analytics Data
  // -----------------------
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
        backgroundColor: "rgba(75, 192, 192, 0.6)",
      },
    ],
  };

  const pieChartData = {
    labels: ["Royalty Earned", "Total Escrow Volume"],
    datasets: [
      {
        data: [totalRoyaltyEarned, totalEscrowVolume],
        backgroundColor: ["#36A2EB", "#FF6384"],
      },
    ],
  };

  // -----------------------
  // Event Subscriptions for On-Chain Events
  // -----------------------
  useEffect(() => {
    if (!program) return;
    const nftMintedListener = program.addEventListener(
      "NftMinted",
      (event: NftMintedEvent, slot: number) => {
        console.log("NFT Minted event:", event, slot);
        addLog("NFT Minted", `Slot: ${slot}`, `Mint: ${event.mint.toBase58()}`);
      }
    );
    const escrowConfigChangedListener = program.addEventListener(
      "EscrowConfigChanged",
      (event: EscrowConfigChangedEvent, slot: number) => {
        console.log("Escrow Config Changed event:", event, slot);
        addLog("Escrow Config Changed", `Slot: ${slot}`, `New Wallet: ${event.new_luxhub_wallet.toBase58()}`);
      }
    );
    const adminChangedListener = program.addEventListener(
      "AdminChanged",
      (event: AdminChangedEvent, slot: number) => {
        console.log("Admin Changed event:", event, slot);
        addLog("Admin Changed", `Slot: ${slot}`, `Action: ${event.action} Admin: ${event.admin.toBase58()}`);
      }
    );
    return () => {
      program.removeEventListener(nftMintedListener);
      program.removeEventListener(escrowConfigChangedListener);
      program.removeEventListener(adminChangedListener);
    };
  }, [program]);

  // -----------------------
  // Render Tab Navigation
  // -----------------------
  const renderTabContent = () => {
    switch (tabIndex) {
      case 0:
        return (
          <div>
            <h2>Escrow Configuration</h2>
            <div className={styles.inputGroup}>
              <label>Current LuxHub Wallet:</label>
              <input type="text" value={currentEscrowConfig} readOnly />
            </div>
            <div className={styles.inputGroup}>
              <label>Set LuxHub Wallet:</label>
              <input type="text" value={luxhubWallet} onChange={(e) => setLuxhubWallet(e.target.value)} />
              <button onClick={initializeEscrowConfig}>Initialize Config</button>
            </div>
            <div className={styles.inputGroup}>
              <label>New LuxHub Wallet:</label>
              <input type="text" value={newLuxhubWallet} onChange={(e) => setNewLuxhubWallet(e.target.value)} />
              <button onClick={updateEscrowConfig}>Update Config</button>
            </div>
            <div className={styles.inputGroup}>
              <h3>Admin List</h3>
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
              <input type="text" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} />
              <button onClick={addAdmin}>Add Admin</button>
            </div>
            <div className={styles.inputGroup}>
              <label>Remove Admin (Wallet Address):</label>
              <input type="text" value={removeAdminAddr} onChange={(e) => setRemoveAdminAddr(e.target.value)} />
              <button onClick={removeAdmin}>Remove Admin</button>
            </div>
            <div className={styles.inputGroup}>
              <label>Buyer Wallet (for NFT transfer):</label>
              <input type="text" value={buyerWallet} onChange={(e) => setBuyerWallet(e.target.value)} />
            </div>
            <div className={styles.inputGroup}>
              <label>Initializer ATA (for Cancel Escrow):</label>
              <input type="text" value={initializerAta} onChange={(e) => setInitializerAta(e.target.value)} />
            </div>
            <div className={styles.inputGroup}>
              <button onClick={refreshData}>{loading ? "Refreshing..." : "Refresh Data"}</button>
            </div>
          </div>
        );
      case 1:
        return (
          <div>
            <h2>User Management</h2>
            <p>Admin users (detailed list):</p>
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
                  <p><strong>Seed:</strong> {escrow.seed}</p>
                  <p><strong>Initializer:</strong> {escrow.initializer}</p>
                  <p><strong>Initializer Amount:</strong> {escrow.initializer_amount}</p>
                  <p><strong>Taker Amount:</strong> {escrow.taker_amount}</p>
                  <p><strong>File CID:</strong> {escrow.file_cid}</p>
                  <div className={styles.actions}>
                    <button onClick={() => confirmDelivery(escrow)}>Confirm Delivery</button>
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
              <p><strong>Total Escrow Volume:</strong> {totalEscrowVolume}</p>
              <p><strong>Total Royalty Earned (3%):</strong> {totalRoyaltyEarned.toFixed(2)}</p>
            </div>
          </div>
        );
      case 4:
        return (
          <div>
            <h2>Transaction Logs (On-Chain Events Only)</h2>
            {logs.length === 0 ? (
              <p>No on-chain event logs available.</p>
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
      default:
        return null;
    }
  };

  // -----------------------
  // Render the component with a single return that conditionally renders content.
  // This avoids changing the number/order of hooks between renders.
  // -----------------------
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Admin Dashboard</h1>
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
