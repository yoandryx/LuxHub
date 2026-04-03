import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { FiPlus, FiX } from 'react-icons/fi';
import { FaWater } from 'react-icons/fa';
import dynamic from 'next/dynamic';
import styles from '../../styles/VendorFab.module.css';

const AddInventoryForm = dynamic(() => import('./AddInventoryForm'), { ssr: false });
const PoolCreationStepper = dynamic(
  () => import('../pool/PoolCreationStepper').then((m) => ({ default: m.PoolCreationStepper })),
  { ssr: false }
);

type ModalView = 'menu' | 'listing' | 'pool';

export default function VendorFab() {
  const { publicKey } = useWallet();
  const [isVendor, setIsVendor] = useState(false);
  const [modalView, setModalView] = useState<ModalView | null>(null);

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

  if (!isVendor || !publicKey) return null;

  const closeModal = () => setModalView(null);

  const getTitle = () => {
    switch (modalView) {
      case 'menu': return 'Actions';
      case 'listing': return 'New Listing';
      case 'pool': return 'Create Pool';
      default: return '';
    }
  };

  return (
    <>
      <button className={styles.fab} onClick={() => setModalView('menu')} title="Vendor actions">
        <FiPlus />
      </button>

      {modalView && (
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.header}>
              <span className={styles.title}>{getTitle()}</span>
              <button className={styles.close} onClick={closeModal}>
                <FiX />
              </button>
            </div>
            <div className={styles.body}>
              {modalView === 'menu' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={() => setModalView('listing')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid #222',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(200,161,255,0.3)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#222')}
                  >
                    <FiPlus style={{ color: '#c8a1ff', fontSize: '18px' }} />
                    New Listing
                  </button>
                  <button
                    onClick={() => setModalView('pool')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid #222',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(200,161,255,0.3)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#222')}
                  >
                    <FaWater style={{ color: '#c8a1ff', fontSize: '18px' }} />
                    Create Pool
                  </button>
                </div>
              )}

              {modalView === 'listing' && (
                <AddInventoryForm onSuccess={closeModal} />
              )}

              {modalView === 'pool' && (
                <PoolCreationStepper
                  vendorWallet={publicKey.toBase58()}
                  onComplete={closeModal}
                  onCancel={() => setModalView('menu')}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
