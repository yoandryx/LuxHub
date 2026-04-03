// src/pages/vendor/bulk-upload.tsx
// Bulk inventory upload — accessible by vendors and admins
import Head from 'next/head';
import Link from 'next/link';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import { useUserRole } from '../../hooks/useUserRole';
import { BulkUploadWizard } from '../../components/vendor/BulkUploadWizard';
import { FaArrowLeft, FaWallet } from 'react-icons/fa';
import styles from '../../styles/BulkUpload.module.css';

export default function BulkUploadPage() {
  const { publicKey } = useEffectiveWallet();
  const { isAdmin } = useUserRole();

  const backHref = isAdmin ? '/adminDashboard' : '/vendor/vendorDashboard';
  const backLabel = isAdmin ? 'Back to Admin' : 'Back to Dashboard';

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
          <Link href={backHref} className={styles.backLink}>
            <FaArrowLeft /> {backLabel}
          </Link>
          <h1 className={styles.pageTitle}>Bulk Inventory Upload</h1>
          <p className={styles.pageSubtitle}>
            Upload a spreadsheet — AI maps columns and analyzes each watch automatically.
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
