// src/components/marketplace/BagsPoolTrading.tsx
// Secondary market trading for pool shares via Bags API
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import styles from '../../styles/BagsPoolTrading.module.css';

interface Pool {
  _id: string;
  poolNumber?: string;
  bagsTokenMint?: string;
  sharePriceUSD: number;
  totalShares: number;
  sharesSold: number;
  status: string;
  asset?: {
    model?: string;
    brand?: string;
  };
  // Tokenization & Liquidity fields
  tokenStatus?: string; // pending, minted, unlocked, frozen, burned
  liquidityModel?: string; // p2p, amm, hybrid
  ammEnabled?: boolean;
  ammLiquidityPercent?: number;
}

interface TradeQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  effectivePrice: number;
  priceImpact: string;
  slippageBps: string;
}

interface BagsPoolTradingProps {
  pool: Pool;
  userShares?: number;
  onTradeComplete?: () => void;
}

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const BagsPoolTrading: React.FC<BagsPoolTradingProps> = ({
  pool,
  userShares = 0,
  onTradeComplete,
}) => {
  const { publicKey, signTransaction, connected } = useWallet();
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState<string>('1');
  const [outputToken, setOutputToken] = useState<'USDC' | 'SOL'>('USDC');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const poolTokenMint = pool.bagsTokenMint;
  const hasToken = !!poolTokenMint;
  const tokenStatus = pool.tokenStatus || 'pending';
  const liquidityModel = pool.liquidityModel || 'p2p';
  const isTokenTradeable = hasToken && tokenStatus === 'unlocked';
  const isTokenLocked = hasToken && tokenStatus === 'minted';
  const isAmmEnabled = pool.ammEnabled && (liquidityModel === 'amm' || liquidityModel === 'hybrid');

  // Fetch quote when amount or trade type changes
  const fetchQuote = useCallback(async () => {
    if (!poolTokenMint || !amount || parseFloat(amount) <= 0) {
      setQuote(null);
      return;
    }

    setQuoteLoading(true);
    setError(null);

    try {
      const outputMint = outputToken === 'USDC' ? USDC_MINT : SOL_MINT;
      const params = new URLSearchParams({
        poolId: pool._id,
        amount: amount,
        slippageBps: '100',
      });

      // Set input/output based on trade type
      if (tradeType === 'sell') {
        params.set('inputMint', poolTokenMint);
        params.set('outputMint', outputMint);
      } else {
        params.set('inputMint', outputMint);
        params.set('outputMint', poolTokenMint);
      }

      const response = await fetch(`/api/bags/trade-quote?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get quote');
      }

      setQuote(data.quote);
    } catch (err: any) {
      console.error('Quote error:', err);
      setError(err.message);
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [pool._id, poolTokenMint, amount, tradeType, outputToken]);

  // Debounce quote fetching
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hasToken && amount) {
        fetchQuote();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [fetchQuote, hasToken, amount]);

  const executeTrade = async () => {
    if (!connected || !publicKey || !signTransaction) {
      setError('Please connect your wallet');
      return;
    }

    if (!quote) {
      setError('No quote available');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const outputMint = outputToken === 'USDC' ? USDC_MINT : SOL_MINT;

      const response = await fetch('/api/bags/execute-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: pool._id,
          inputMint: tradeType === 'sell' ? poolTokenMint : outputMint,
          outputMint: tradeType === 'sell' ? outputMint : poolTokenMint,
          amount: amount,
          userWallet: publicKey.toBase58(),
          slippageBps: '100',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to build transaction');
      }

      // Deserialize and sign transaction
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'
      );

      const txBuffer = Buffer.from(data.transaction.serialized, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuffer);

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');

      setTxSignature(signature);
      setSuccess(`Trade executed successfully!`);
      onTradeComplete?.();
    } catch (err: any) {
      console.error('Trade error:', err);
      setError(err.message || 'Trade failed');
    } finally {
      setLoading(false);
    }
  };

  // Show appropriate message based on token status
  if (!hasToken) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.bagsLogo}>
            <img src="/images/bags-icon.png" alt="Bags" className={styles.bagsIcon} />
            <span>Powered by Bags</span>
          </div>
          <h3>Secondary Market Trading</h3>
        </div>
        <div className={styles.noToken}>
          <div className={styles.noTokenIcon}>🔒</div>
          <p>Pool shares not yet tokenized</p>
          <span>Trading will be available once the pool is tokenized via Bags</span>
        </div>
      </div>
    );
  }

  // Tokens minted but locked (waiting for custody verification)
  if (isTokenLocked) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.bagsLogo}>
            <img src="/images/bags-icon.png" alt="Bags" className={styles.bagsIcon} />
            <span>Powered by Bags</span>
          </div>
          <h3>Secondary Market Trading</h3>
          <p className={styles.tokenMint}>
            Token: {poolTokenMint?.slice(0, 8)}...{poolTokenMint?.slice(-6)}
          </p>
        </div>
        <div className={styles.lockedToken}>
          <div className={styles.lockedIcon}>🔐</div>
          <p>Tokens Minted - Trading Locked</p>
          <span>
            Trading will unlock once the pool is filled and the physical asset is verified in LuxHub
            custody. This escrow protection ensures your investment is secured by real assets.
          </span>
          <div className={styles.lockedInfo}>
            <div className={styles.lockedStep}>
              <span className={styles.stepNumber}>1</span>
              <span>Pool fills to 100%</span>
            </div>
            <div className={styles.lockedStep}>
              <span className={styles.stepNumber}>2</span>
              <span>Vendor ships to LuxHub</span>
            </div>
            <div className={styles.lockedStep}>
              <span className={styles.stepNumber}>3</span>
              <span>Asset verified in custody</span>
            </div>
            <div className={styles.lockedStep}>
              <span className={styles.stepNumber}>4</span>
              <span>Trading unlocks 🔓</span>
            </div>
          </div>
        </div>
        {/* Liquidity Model Badge */}
        <div className={styles.liquidityBadge}>
          {liquidityModel === 'amm' && (
            <>
              <span className={styles.ammBadge}>💧 AMM Liquidity</span>
              <span>{pool.ammLiquidityPercent || 30}% instant liquidity pool</span>
            </>
          )}
          {liquidityModel === 'p2p' && (
            <>
              <span className={styles.p2pBadge}>🤝 P2P Trading</span>
              <span>Peer-to-peer order book trading</span>
            </>
          )}
          {liquidityModel === 'hybrid' && (
            <>
              <span className={styles.hybridBadge}>⚡ Hybrid Model</span>
              <span>AMM + P2P for maximum liquidity</span>
            </>
          )}
        </div>
      </div>
    );
  }

  // Token frozen or burned
  if (tokenStatus === 'frozen' || tokenStatus === 'burned') {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.bagsLogo}>
            <img src="/images/bags-icon.png" alt="Bags" className={styles.bagsIcon} />
            <span>Powered by Bags</span>
          </div>
          <h3>Secondary Market Trading</h3>
        </div>
        <div className={styles.frozenToken}>
          <div className={styles.frozenIcon}>{tokenStatus === 'frozen' ? '❄️' : '🔥'}</div>
          <p>{tokenStatus === 'frozen' ? 'Trading Halted' : 'Pool Closed'}</p>
          <span>
            {tokenStatus === 'frozen'
              ? 'Trading has been temporarily halted. Please check back later.'
              : 'This pool has been closed and tokens burned. Proceeds have been distributed.'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header with Bags branding */}
      <div className={styles.header}>
        <div className={styles.bagsLogo}>
          <img src="/images/bags-icon.png" alt="Bags" className={styles.bagsIcon} />
          <span>Powered by Bags</span>
        </div>
        <h3>Trade Pool Shares</h3>
        <p className={styles.tokenMint}>
          Token: {poolTokenMint?.slice(0, 8)}...{poolTokenMint?.slice(-6)}
        </p>
        {/* Liquidity Model Indicator */}
        <div className={styles.liquidityIndicator}>
          {isAmmEnabled ? (
            <span className={styles.ammActive}>
              💧 AMM Active ({pool.ammLiquidityPercent || 30}% liquidity)
            </span>
          ) : (
            <span className={styles.p2pActive}>🤝 P2P Trading</span>
          )}
        </div>
      </div>

      {/* Trade Type Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tradeType === 'buy' ? styles.activeTab : ''}`}
          onClick={() => setTradeType('buy')}
        >
          Buy Shares
        </button>
        <button
          className={`${styles.tab} ${tradeType === 'sell' ? styles.activeTab : ''}`}
          onClick={() => setTradeType('sell')}
        >
          Sell Shares
        </button>
      </div>

      {/* User Balance */}
      {connected && (
        <div className={styles.balanceRow}>
          <span>Your Shares:</span>
          <strong>{userShares.toLocaleString()}</strong>
        </div>
      )}

      {/* Amount Input */}
      <div className={styles.inputSection}>
        <label>{tradeType === 'buy' ? 'Amount to spend' : 'Shares to sell'}</label>
        <div className={styles.inputWrapper}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            min="0"
            step={tradeType === 'sell' ? '1' : '0.01'}
            max={tradeType === 'sell' ? userShares : undefined}
            className={styles.amountInput}
          />
          {tradeType === 'buy' && (
            <select
              value={outputToken}
              onChange={(e) => setOutputToken(e.target.value as 'USDC' | 'SOL')}
              className={styles.tokenSelect}
            >
              <option value="USDC">USDC</option>
              <option value="SOL">SOL</option>
            </select>
          )}
          {tradeType === 'sell' && <span className={styles.shareLabel}>Shares</span>}
        </div>
        {tradeType === 'sell' && userShares > 0 && (
          <button className={styles.maxButton} onClick={() => setAmount(userShares.toString())}>
            Max ({userShares})
          </button>
        )}
      </div>

      {/* Quote Display */}
      {quoteLoading ? (
        <div className={styles.quoteLoading}>
          <div className={styles.spinner}></div>
          <span>Getting quote...</span>
        </div>
      ) : quote ? (
        <div className={styles.quoteCard}>
          <div className={styles.quoteHeader}>
            <span>Quote</span>
            <button className={styles.refreshBtn} onClick={fetchQuote}>
              ↻
            </button>
          </div>
          <div className={styles.quoteRow}>
            <span>You {tradeType === 'buy' ? 'pay' : 'sell'}:</span>
            <strong>
              {parseFloat(amount).toLocaleString()} {tradeType === 'sell' ? 'Shares' : outputToken}
            </strong>
          </div>
          <div className={styles.quoteRow}>
            <span>You receive:</span>
            <strong className={styles.receiveAmount}>
              {parseFloat(quote.outputAmount).toLocaleString()}{' '}
              {tradeType === 'buy' ? 'Shares' : outputToken}
            </strong>
          </div>
          <div className={styles.quoteDetails}>
            <div className={styles.detailItem}>
              <span>Price Impact</span>
              <span className={parseFloat(quote.priceImpact) > 1 ? styles.highImpact : ''}>
                {quote.priceImpact}
              </span>
            </div>
            <div className={styles.detailItem}>
              <span>Slippage</span>
              <span>{(parseInt(quote.slippageBps) / 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Fee Info */}
      <div className={styles.feeInfo}>
        <div className={styles.feeRow}>
          <span>Platform Fee (LuxHub)</span>
          <span>3%</span>
        </div>
        <p className={styles.feeNote}>Fee is automatically distributed via Bags Fee Share</p>
      </div>

      {/* Error/Success Messages */}
      {error && <div className={styles.error}>{error}</div>}
      {success && (
        <div className={styles.success}>
          <p>{success}</p>
          {txSignature && (
            <a
              href={`https://solscan.io/tx/${txSignature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.txLink}
            >
              View on Solscan →
            </a>
          )}
        </div>
      )}

      {/* Execute Button */}
      <button
        className={styles.executeButton}
        onClick={executeTrade}
        disabled={
          loading ||
          !quote ||
          !connected ||
          (tradeType === 'sell' && parseFloat(amount) > userShares)
        }
      >
        {loading ? (
          <>
            <div className={styles.buttonSpinner}></div>
            Processing...
          </>
        ) : !connected ? (
          'Connect Wallet'
        ) : tradeType === 'sell' && parseFloat(amount) > userShares ? (
          'Insufficient Shares'
        ) : (
          `${tradeType === 'buy' ? 'Buy' : 'Sell'} Shares`
        )}
      </button>

      {/* Bags Attribution */}
      <div className={styles.attribution}>
        <span>Trading powered by</span>
        <a href="https://bags.fm" target="_blank" rel="noopener noreferrer">
          <img src="/images/bags-logo.svg" alt="Bags" className={styles.bagsLogoFull} />
        </a>
      </div>
    </div>
  );
};

export default BagsPoolTrading;
