import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useWallet } from '@solana/wallet-adapter-react';
import { FiPlus, FiX, FiEdit, FiLayers } from 'react-icons/fi';
import dynamic from 'next/dynamic';
import styles from '../../styles/VendorFab.module.css';

const AddInventoryForm = dynamic(() => import('./AddInventoryForm'), { ssr: false });
const BulkUploadWizard = dynamic(() => import('./BulkUploadWizard'), { ssr: false });

export default function VendorFab() {
  const { publicKey } = useWallet();
  const router = useRouter();
  const [canAccess, setCanAccess] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  useEffect(() => {
    if (!publicKey) {
      setCanAccess(false);
      return;
    }

    const walletAddress = publicKey.toBase58();

    // Check if super admin (env var)
    const superAdmins = (process.env.NEXT_PUBLIC_SUPER_ADMIN_WALLETS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (superAdmins.includes(walletAddress)) {
      setCanAccess(true);
      return;
    }

    // Check VaultConfig admins (MongoDB) + approved vendor in parallel
    Promise.all([
      fetch('/api/vault/config').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/vendor/profile?wallet=${walletAddress}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([vaultData, vendorData]) => {
      const isVaultAdmin = vaultData?.config?.authorizedAdmins?.some(
        (a: { walletAddress: string }) => a.walletAddress === walletAddress
      );
      const isApprovedVendor = !!vendorData?.approved;
      setCanAccess(isVaultAdmin || isApprovedVendor);
    }).catch(() => setCanAccess(false));
  }, [publicKey]);

  if (!canAccess) return null;

  const handleFabClick = () => {
    setShowMenu((prev) => !prev);
  };

  const handleSingle = () => {
    setShowMenu(false);
    setShowForm(true);
  };

  const handleBulk = () => {
    setShowMenu(false);
    setShowBulk(true);
  };

  return (
    <>
      <div className={styles.fabWrapper}>
        {showMenu && (
          <div className={styles.fabMenu}>
            <button className={styles.fabMenuItem} onClick={handleSingle}>
              <FiEdit /> Single Item
            </button>
            <button className={styles.fabMenuItem} onClick={handleBulk}>
              <FiLayers /> Bulk Upload
            </button>
          </div>
        )}
        <button className={styles.fab} onClick={handleFabClick} title="Add inventory">
          <FiPlus style={{ transform: showMenu ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s ease' }} />
        </button>
      </div>

      {showForm && (
        <div className={styles.overlay} onClick={() => setShowForm(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.header}>
              <span className={styles.title}>New Listing</span>
              <button className={styles.close} onClick={() => setShowForm(false)}>
                <FiX />
              </button>
            </div>
            <div className={styles.body}>
              <AddInventoryForm onSuccess={() => setShowForm(false)} />
            </div>
          </div>
        </div>
      )}

      {showBulk && (
        <div className={styles.overlay} onClick={() => setShowBulk(false)}>
          <div className={`${styles.modal} ${styles.modalWide}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.header}>
              <span className={styles.title}>Bulk Upload</span>
              <button className={styles.close} onClick={() => setShowBulk(false)}>
                <FiX />
              </button>
            </div>
            <div className={styles.body}>
              <BulkUploadWizard />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
