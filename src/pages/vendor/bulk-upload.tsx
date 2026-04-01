// src/pages/vendor/bulk-upload.tsx
// Vendor bulk inventory upload page with AI-powered processing wizard
import Head from 'next/head';
import Link from 'next/link';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import { BulkUploadWizard } from '../../components/vendor/BulkUploadWizard';
import { FaArrowLeft, FaWallet } from 'react-icons/fa';
import styles from '../../styles/BulkUpload.module.css';

export default function BulkUploadPage() {
  const { publicKey } = useEffectiveWallet();

  return (
    <>
      <Head>
        <title>Bulk Upload | LuxHub</title>
        <meta
          name="description"
          content="Upload your watch inventory in bulk with AI-powered processing"
        />
      </Head>

      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <Link href="/vendor/vendorDashboard" className={styles.backLink}>
            <FaArrowLeft /> Back to Dashboard
          </Link>
          <h1 className={styles.pageTitle}>Bulk Inventory Upload</h1>
          <p className={styles.pageSubtitle}>
            Upload a CSV and images — AI maps columns and analyzes each watch automatically.
          </p>
        </div>

        {publicKey ? (
          <BulkUploadWizard />
        ) : (
          <div className={styles.connectPrompt}>
            <FaWallet style={{ fontSize: '2.5rem', color: 'var(--accent)' }} />
            <h2>Connect Your Wallet</h2>
            <p>Connect your wallet to upload inventory.</p>
          </div>
        )}
      </div>
    </>
  );
}
