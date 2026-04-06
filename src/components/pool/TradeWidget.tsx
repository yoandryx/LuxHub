// src/components/pool/TradeWidget.tsx
// Embedded buy/sell widget for pool detail page (D-06)
import React, { useState, useEffect, useCallback } from 'react';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import { Connection, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getClusterConfig } from '@/lib/solana/clusterConfig';
import { FiLoader } from 'react-icons/fi';
import styles from '../../styles/TradeWidget.module.css';

interface PoolData {
  _id: string;
  bagsTokenMint?: string;
  graduated?: boolean;
  status: string;
  bondingCurveActive?: boolean;
  bagsTokenStatus?: string;
  lastPriceUSD?: number;
  currentBondingPrice?: number;
  targetAmountUSD?: number;
  sharesSold?: number;
  totalShares?: number;
}

interface TradeQuote {
  inputAmount: string;
  outputAmount: string;
  effectivePrice: number;
  priceImpact: string;
  slippageBps: string;
}

interface TradeWidgetProps {
  pool: PoolData;
  initialSide?: 'buy' | 'sell';
  onTradeComplete?: () => void;
}

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SLIPPAGE_OPTIONS = [50, 100, 300]; // 0.5%, 1%, 3%

export const TradeWidget: React.FC<TradeWidgetProps> = ({ pool, initialSide = 'buy', onTradeComplete }) => {
  const { publicKey, signTransaction, connected } = useEffectiveWallet();
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>(initialSide);
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(100); // default 1%
  const [customSlippage, setCustomSlippage] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);

  const tokenMint = pool.bagsTokenMint;
  const isGraduated = pool.graduated === true;

  // Fetch SOL balance
  useEffect(() => {
    if (!connected || !publicKey) {
      setSolBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        const { endpoint } = getClusterConfig();
        const connection = new Connection(endpoint);
        const balance = await connection.getBalance(publicKey);
        setSolBalance(balance / LAMPORTS_PER_SOL);
      } catch {
        setSolBalance(null);
      }
    };

    fetchBalance();
  }, [connected, publicKey]);

  // Fetch quote with debounce
  const fetchQuote = useCallback(async () => {
    if (!tokenMint || !amount || parseFloat(amount) <= 0) {
      setQuote(null);
      return;
    }

    setQuoteLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        poolId: pool._id,
        amount,
        slippageBps: slippageBps.toString(),
      });

      if (tradeType === 'buy') {
        params.set('inputMint', SOL_MINT);
        params.set('outputMint', tokenMint);
      } else {
        params.set('inputMint', tokenMint);
        params.set('outputMint', SOL_MINT);
      }

      const res = await fetch(`/api/bags/trade-quote?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get quote');
      }

      setQuote(data.quote);
    } catch (err: any) {
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [pool._id, tokenMint, amount, tradeType, slippageBps]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (tokenMint && amount && parseFloat(amount) > 0) {
        fetchQuote();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [fetchQuote, tokenMint, amount]);

  const executeTrade = async () => {
    if (!connected || !publicKey || !signTransaction) {
      setError('Please connect your wallet');
      return;
    }
    if (!quote || !tokenMint) {
      setError('No quote available');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/bags/execute-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: pool._id,
          inputMint: tradeType === 'buy' ? SOL_MINT : tokenMint,
          outputMint: tradeType === 'buy' ? tokenMint : SOL_MINT,
          amount,
          userWallet: publicKey.toBase58(),
          slippageBps: slippageBps.toString(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Transaction failed. Check your wallet balance and try again.');
      }

      // Deserialize, sign, and send — server converts Bags base58 → base64 for us
      // Use Uint8Array (not Buffer polyfill) for proper wallet compatibility
      const { endpoint } = getClusterConfig();
      const connection = new Connection(endpoint);
      const binaryStr = atob(data.transaction.serialized);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) txBytes[i] = binaryStr.charCodeAt(i);
      const transaction = VersionedTransaction.deserialize(txBytes);
      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(signature, 'confirmed');

      setSuccess('Trade executed successfully!');
      setAmount('');
      setQuote(null);
      onTradeComplete?.();
    } catch (err: any) {
      console.error('[TradeWidget] Trade error:', err);
      console.error('[TradeWidget] Error name:', err?.name, 'message:', err?.message);
      console.error('[TradeWidget] Error stack:', err?.stack);
      setError(err.message || 'Transaction failed. Check your wallet balance and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Bonding curve progress
  const fundedPercent =
    pool.totalShares && pool.sharesSold
      ? Math.min((pool.sharesSold / pool.totalShares) * 100, 100)
      : 0;
  const isFullyFunded = fundedPercent >= 100;

  const effectiveSlippage = showCustom && customSlippage
    ? parseInt(customSlippage) || slippageBps
    : slippageBps;

  return (
    <div className={styles.container}>
      {/* Graduated badge */}
      {isGraduated && (
        <div className={styles.dexBadge}>Trading on DEX</div>
      )}

      {/* Tab bar */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tradeType === 'buy' ? styles.tabActive : ''}`}
          onClick={() => setTradeType('buy')}
        >
          Buy
        </button>
        <button
          className={`${styles.tab} ${tradeType === 'sell' ? styles.tabActive : ''}`}
          onClick={() => setTradeType('sell')}
        >
          Sell
        </button>
      </div>

      {/* Bonding curve progress (show pre-graduation) */}
      {!isGraduated && (
        <div className={styles.progressSection}>
          <div className={styles.progressLabel}>
            <span className={styles.progressText}>
              {isFullyFunded ? 'Fully Funded' : `${fundedPercent.toFixed(0)}% Funded`}
            </span>
          </div>
          <div className={styles.progressBar}>
            <div
              className={`${styles.progressFill} ${isFullyFunded ? styles.progressFullyFunded : ''}`}
              style={{ width: `${fundedPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Amount input */}
      <div className={styles.inputSection}>
        <label className={styles.inputLabel}>
          {tradeType === 'buy' ? 'SOL Amount' : 'Token Amount'}
        </label>
        <div className={styles.inputWrapper}>
          <input
            type="number"
            className={styles.input}
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!connected}
            min="0"
            step="0.01"
          />
          {tradeType === 'buy' && solBalance !== null && connected && (
            <button
              className={styles.maxBtn}
              onClick={() => setAmount(Math.max(0, solBalance - 0.01).toFixed(4))}
            >
              Max
            </button>
          )}
        </div>
        {tradeType === 'buy' && solBalance !== null && connected && (
          <span className={styles.balanceLabel}>
            Balance: {solBalance.toFixed(4)} SOL
          </span>
        )}
      </div>

      {/* Estimated output */}
      {quoteLoading ? (
        <div className={styles.quoteLoading}>
          <FiLoader className={styles.spinner} size={14} />
          <span>Getting quote...</span>
        </div>
      ) : quote ? (
        <div className={styles.quoteRow}>
          <span className={styles.quoteLabel}>
            Estimated {tradeType === 'buy' ? 'tokens' : 'SOL'}
          </span>
          <span className={styles.quoteValue}>
            {/* Bags returns raw amounts (lamports/smallest unit). Convert to human-readable. */}
            {(parseFloat(quote.outputAmount) / 1e9).toLocaleString(undefined, {
              maximumFractionDigits: tradeType === 'buy' ? 0 : 6,
            })}
          </span>
        </div>
      ) : null}

      {/* Execute button — green for buy, red for sell */}
      <button
        className={`${styles.executeBtn} ${tradeType === 'sell' ? styles.executeBtnSell : styles.executeBtnBuy}`}
        onClick={executeTrade}
        disabled={loading || !quote || !connected}
      >
        {loading ? (
          <>
            <FiLoader className={styles.spinner} size={16} />
            Processing...
          </>
        ) : !connected ? (
          'Connect Wallet'
        ) : (
          `${tradeType === 'buy' ? 'Buy' : 'Sell'} Tokens`
        )}
      </button>

      {/* Slippage selector */}
      <div className={styles.slippageRow}>
        <span className={styles.slippageLabel}>Slippage</span>
        <div className={styles.slippagePills}>
          {SLIPPAGE_OPTIONS.map((bps) => (
            <button
              key={bps}
              className={`${styles.slippagePill} ${
                !showCustom && slippageBps === bps ? styles.slippagePillActive : ''
              }`}
              onClick={() => {
                setSlippageBps(bps);
                setShowCustom(false);
              }}
            >
              {(bps / 100).toFixed(1)}%
            </button>
          ))}
          <button
            className={`${styles.slippagePill} ${showCustom ? styles.slippagePillActive : ''}`}
            onClick={() => setShowCustom(true)}
          >
            Custom
          </button>
        </div>
        {showCustom && (
          <input
            type="number"
            className={styles.slippageInput}
            placeholder="BPS"
            value={customSlippage}
            onChange={(e) => setCustomSlippage(e.target.value)}
            min="1"
            max="5000"
          />
        )}
      </div>

      {/* Error / Success */}
      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}
    </div>
  );
};

export default TradeWidget;
