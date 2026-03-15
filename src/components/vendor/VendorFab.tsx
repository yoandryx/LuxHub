import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { FiPlus, FiX } from 'react-icons/fi';
import dynamic from 'next/dynamic';
import styles from '../../styles/VendorFab.module.css';

const AddInventoryForm = dynamic(() => import('./AddInventoryForm'), { ssr: false });

export default function VendorFab() {
  const { publicKey } = useWallet();
  const [isVendor, setIsVendor] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!publicKey) {
      setIsVendor(false);
      return;
    }

    fetch(`/api/vendor/profile?wallet=${publicKey.toBase58()}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        setIsVendor(!!data?.approved);
      })
      .catch(() => setIsVendor(false));
  }, [publicKey]);

  if (!isVendor) return null;

  return (
    <>
      <button className={styles.fab} onClick={() => setShowForm(true)} title="New listing request">
        <FiPlus />
      </button>

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
    </>
  );
}
