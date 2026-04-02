import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useWallet } from '@solana/wallet-adapter-react';
import { FiPlus, FiX, FiEdit, FiLayers } from 'react-icons/fi';
import dynamic from 'next/dynamic';
import styles from '../../styles/VendorFab.module.css';

const AddInventoryForm = dynamic(() => import('./AddInventoryForm'), { ssr: false });

export default function VendorFab() {
  const { publicKey } = useWallet();
  const router = useRouter();
  const [isVendor, setIsVendor] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
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

  const handleFabClick = () => {
    setShowMenu((prev) => !prev);
  };

  const handleSingle = () => {
    setShowMenu(false);
    setShowForm(true);
  };

  const handleBulk = () => {
    setShowMenu(false);
    router.push('/vendor/bulk-upload');
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
    </>
  );
}
