import React, { createContext, useContext, useState, useEffect } from 'react';

// Fetch SOL/USD price from our own server-side proxy (Pyth oracle + CoinGecko fallback)
// No CORS issues, cached server-side, accurate real-time data
const SOL_PRICE_ENDPOINT = '/api/price/sol';

interface PriceDisplayContextType {
  displayInUSD: boolean;
  toggleDisplay: () => void;
  solPriceInUSD: number; // current market price
  formatPrice: (priceInSOL: number) => string;
  formatUSD: (usd: number) => string;
  solToUSD: (sol: number) => number;
  usdToSOL: (usd: number) => number;
}

const PriceDisplayContext = createContext<PriceDisplayContextType | undefined>(undefined);

export const PriceDisplayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [displayInUSD, setDisplayInUSD] = useState(false);
  const [solPriceInUSD, setSolPriceInUSD] = useState(0); // 0 = not loaded yet

  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        const res = await fetch(SOL_PRICE_ENDPOINT);
        if (!res.ok) return;
        const data = await res.json();
        const price = data?.solana?.usd;
        if (price && price > 0) {
          setSolPriceInUSD(price);
        }
      } catch {
        // Silent fail — keep last known price
      }
    };

    fetchSolPrice();
    const interval = setInterval(fetchSolPrice, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const toggleDisplay = () => {
    setDisplayInUSD((prev) => !prev);
  };

  const solToUSD = (sol: number): number => sol * solPriceInUSD;
  const usdToSOL = (usd: number): number => (solPriceInUSD > 0 ? usd / solPriceInUSD : 0);

  const formatUSD = (usd: number): string => {
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
    if (usd >= 1) return `$${usd.toFixed(2)}`;
    if (usd >= 0.01) return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(6)}`;
  };

  const formatPrice = (priceInSOL: number): string => {
    if (displayInUSD) {
      const usd = priceInSOL * solPriceInUSD;
      return formatUSD(usd) + ' USD';
    }
    if (priceInSOL >= 1) return `${priceInSOL.toFixed(4)} SOL`;
    if (priceInSOL >= 0.001) return `${priceInSOL.toFixed(6)} SOL`;
    return `${priceInSOL.toFixed(9)} SOL`;
  };

  return (
    <PriceDisplayContext.Provider
      value={{
        displayInUSD,
        toggleDisplay,
        solPriceInUSD,
        formatPrice,
        formatUSD,
        solToUSD,
        usdToSOL,
      }}
    >
      {children}
    </PriceDisplayContext.Provider>
  );
};

export const usePriceDisplay = () => {
  const context = useContext(PriceDisplayContext);
  if (!context) {
    throw new Error('usePriceDisplay must be used within PriceDisplayProvider');
  }
  return context;
};
