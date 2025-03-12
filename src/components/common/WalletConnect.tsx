import { WalletConnectButton, WalletDisconnectButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';

const WalletComponent = () => {
  const { connected } = useWallet();

  return (
    <div>
      {!connected ? (
        <WalletConnectButton />
      ) : (
        <div>
          <span>Connected</span>
          <WalletDisconnectButton />
        </div>
      )}
    </div>
  );
};
