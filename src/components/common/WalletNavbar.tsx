import { useEffect, useRef, useState } from "react";
import styles from "../../styles/WalletNavbar.module.css";
import { useRouter } from "next/router";
import { useWallet } from "@solana/wallet-adapter-react";
import { SiSolana } from "react-icons/si";
import { FaWallet, FaSync, FaCopy, FaHandHoldingUsd, FaCalculator, FaChartBar, FaUsers } from "react-icons/fa";
import { Connection } from "@solana/web3.js";
import { usePriceDisplay } from '../marketplace/PriceDisplay';

export default function WalletNavbar() {
  const router = useRouter();
  const { connected, publicKey, disconnect } = useWallet();
  const { formatPrice } = usePriceDisplay();

  const [isOpen, setIsOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.mainnet-beta.solana.com");

  const fetchBalance = async () => {
    if (!publicKey) return;
    try {
      const lamports = await connection.getBalance(publicKey);
      setBalance(lamports / 1e9);
    } catch (err) {
      console.error("Balance fetch error:", err);
    }
  };

  useEffect(() => {
    if (connected && publicKey) fetchBalance();
  }, [connected, publicKey]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div
      ref={widgetRef}
      className={`${styles.luxWalletOrb} ${isOpen ? styles.open : ""}`}
    >
      {/* Trigger */}
      <div
        className={styles.trigger}
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
      >
        <FaWallet className={styles.walletIcon} />
        {connected && publicKey && (
          <span className={styles.shortAddress}>
            {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
          </span>
        )}
      </div>

      {/* Compact Panel */}
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3>LuxHub Wallet</h3>
          <button onClick={(e) => { e.stopPropagation(); fetchBalance(); }} className={styles.refresh}>
            <FaSync />
          </button>
        </div>

        {connected && publicKey ? (
          <>
            <div className={styles.infoRow}>
              <span className={styles.label}>Address</span>
              <span className={styles.address} onClick={copyAddress}>
                {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-4)}
                <FaCopy />
                {copied && <span className={styles.copied}>Copied</span>}
              </span>
            </div>

            <div className={styles.infoRow}>
              <span className={styles.label}>Balance</span>
              <span className={styles.balance}>
                <SiSolana /> {balance !== null ? formatPrice(balance) : "—"}
              </span>
            </div>

            {/* Future Action Buttons (Compact Grid) */}
            <div className={styles.actionsGrid}>
              <button className={styles.actionBtn} disabled>
                <FaHandHoldingUsd /> Get Loan
              </button>
              <button className={styles.actionBtn} disabled>
                <FaUsers /> Join Pool
              </button>
              <button className={styles.actionBtn} disabled>
                <FaCalculator /> Trade Calc
              </button>
              <button className={styles.actionBtn} disabled>
                <FaChartBar /> Compare
              </button>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); disconnect(); router.push("/login"); }}
              className={styles.disconnectBtn}
            >
              Disconnect
            </button>
          </>
        ) : (
          <div className={styles.connectPrompt}>
            <p>Connect to unlock loans, pools & insights</p>
            <button onClick={() => router.push("/connect")} className={styles.connectBtn}>
              Connect Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}