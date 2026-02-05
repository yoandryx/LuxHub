// src/components/common/SavedAddressSelector.tsx
// Component for selecting or adding saved shipping addresses
import React, { useState, useEffect } from 'react';
import { FiMapPin, FiPlus, FiCheck, FiStar, FiTrash2 } from 'react-icons/fi';
import styles from '../../styles/SavedAddressSelector.module.css';

export interface SavedAddress {
  _id: string;
  label: string;
  fullName: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
  deliveryInstructions?: string;
  isDefault: boolean;
}

interface SavedAddressSelectorProps {
  wallet: string | null;
  onSelectAddress: (address: SavedAddress | null) => void;
  onAddNewClick: () => void;
  selectedAddressId?: string | null;
  compact?: boolean;
}

const SavedAddressSelector: React.FC<SavedAddressSelectorProps> = ({
  wallet,
  onSelectAddress,
  onAddNewClick,
  selectedAddressId,
  compact = false,
}) => {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch saved addresses
  useEffect(() => {
    if (!wallet) {
      setAddresses([]);
      setLoading(false);
      return;
    }

    const fetchAddresses = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/addresses?wallet=${wallet}`);
        const data = await res.json();

        if (data.success) {
          setAddresses(data.addresses || []);
          // Auto-select default if none selected
          if (!selectedAddressId && data.addresses?.length > 0) {
            const defaultAddr = data.addresses.find((a: SavedAddress) => a.isDefault);
            if (defaultAddr) {
              onSelectAddress(defaultAddr);
            }
          }
        } else {
          setError(data.error || 'Failed to load addresses');
        }
      } catch (err) {
        console.error('Failed to fetch addresses:', err);
        setError('Failed to load addresses');
      } finally {
        setLoading(false);
      }
    };

    fetchAddresses();
  }, [wallet]);

  // Handle address selection
  const handleSelect = (address: SavedAddress) => {
    onSelectAddress(address);
  };

  // Handle delete address
  const handleDelete = async (e: React.MouseEvent, addressId: string) => {
    e.stopPropagation();

    if (!wallet || deletingId) return;

    setDeletingId(addressId);
    try {
      const res = await fetch(`/api/addresses/${addressId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet }),
      });

      if (res.ok) {
        setAddresses((prev) => prev.filter((a) => a._id !== addressId));
        if (selectedAddressId === addressId) {
          onSelectAddress(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete address:', err);
    } finally {
      setDeletingId(null);
    }
  };

  if (!wallet) {
    return null;
  }

  if (loading) {
    return (
      <div className={`${styles.container} ${compact ? styles.compact : ''}`}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <span>Loading saved addresses...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${compact ? styles.compact : ''}`}>
      {addresses.length > 0 && (
        <>
          <div className={styles.header}>
            <FiMapPin className={styles.headerIcon} />
            <span>Saved Addresses</span>
          </div>

          <div className={styles.addressList}>
            {addresses.map((address) => (
              <div
                key={address._id}
                className={`${styles.addressCard} ${selectedAddressId === address._id ? styles.selected : ''}`}
                onClick={() => handleSelect(address)}
              >
                <div className={styles.cardHeader}>
                  <div className={styles.labelRow}>
                    {address.isDefault && (
                      <span className={styles.defaultBadge}>
                        <FiStar /> Default
                      </span>
                    )}
                    <span className={styles.label}>{address.label}</span>
                  </div>
                  <div className={styles.cardActions}>
                    {selectedAddressId === address._id && (
                      <span className={styles.checkIcon}>
                        <FiCheck />
                      </span>
                    )}
                    <button
                      className={styles.deleteBtn}
                      onClick={(e) => handleDelete(e, address._id)}
                      disabled={deletingId === address._id}
                      title="Delete address"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.name}>{address.fullName}</p>
                  <p className={styles.street}>{address.street1}</p>
                  {address.street2 && <p className={styles.street}>{address.street2}</p>}
                  <p className={styles.cityState}>
                    {address.city}, {address.state} {address.postalCode}
                  </p>
                  <p className={styles.country}>{address.country}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add New Address Button */}
      <button className={styles.addNewBtn} onClick={onAddNewClick}>
        <FiPlus />
        <span>{addresses.length > 0 ? 'Use Different Address' : 'Enter Shipping Address'}</span>
      </button>

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
};

export default SavedAddressSelector;
