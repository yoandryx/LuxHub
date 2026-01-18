import React, { createContext, useContext, useState, useEffect } from 'react';

// You'll need current SOL price in USD
// You can fetch this from an API like Coingecko
const SOL_PRICE_API = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';

interface PriceDisplayContextType {
  displayInUSD: boolean;
  toggleDisplay: () => void;
  solPriceInUSD: number; // current market price
  formatPrice: (priceInSOL: number) => string;
}

const PriceDisplayContext = createContext<PriceDisplayContextType | undefined>(undefined);

export const PriceDisplayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [displayInUSD, setDisplayInUSD] = useState(false);
  const [solPriceInUSD, setSolPriceInUSD] = useState(100); // fallback

  // Fetch current SOL price on mount and periodically
  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        const res = await fetch(SOL_PRICE_API);
        const data = await res.json();
        setSolPriceInUSD(data.solana.usd);
      } catch (err) {
        console.error('Failed to fetch SOL price');
      }
    };

    fetchSolPrice();
    const interval = setInterval(fetchSolPrice, 60000); // update every minute

    return () => clearInterval(interval);
  }, []);

  const toggleDisplay = () => {
    setDisplayInUSD((prev) => !prev);
  };

  const formatPrice = (priceInSOL: number): string => {
    if (displayInUSD) {
      const usd = priceInSOL * solPriceInUSD;
      return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }
    return `${priceInSOL.toFixed(4)} SOL`;
  };

  return (
    <PriceDisplayContext.Provider
      value={{ displayInUSD, toggleDisplay, solPriceInUSD, formatPrice }}
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
