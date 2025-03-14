import { WalletConnectButton, WalletDisconnectButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useState, useMemo } from 'react';
import { SolflareWalletAdapter, PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';

const WalletComponent = () => {
  const { connected, publicKey, connecting } = useWallet();  // Added `connecting` state to manage loading
  const [loading, setLoading] = useState(false);

  // Add wallet options like Solflare and Phantom
  const wallets = useMemo(
    () => [new SolflareWalletAdapter(), new PhantomWalletAdapter()],
    []
  );

  const handleConnect = () => {
    setLoading(true);
  };

  return (
    <div>
      {!connected ? (
        <div>
          <button onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
          {loading && <span>Connecting...</span>}
        </div>
      ) : (
        <div>
          <span>Connected: {publicKey?.toBase58()}</span>
          <WalletDisconnectButton />
        </div>
      )}
    </div>
  );
};

export default WalletComponent;
