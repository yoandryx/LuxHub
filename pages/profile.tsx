import styles from "../styles/Profile.module.css";
import { useWallet } from "@solana/wallet-adapter-react";

export default function Profile() {
  const { connected, publicKey } = useWallet();

  return (
    <div className={styles.container}>
      <h1>Your Profile</h1>
      {connected ? (
        <>
          <p><strong>Wallet Address:</strong> {publicKey?.toString()}</p>
          <p>More profile settings coming soon...</p>
        </>
      ) : (
        <p>Please connect your wallet.</p>
      )}
    </div>
  );
}
