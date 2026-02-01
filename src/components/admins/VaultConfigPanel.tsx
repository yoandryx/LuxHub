// src/components/admins/VaultConfigPanel.tsx
// Vault Configuration Panel - Manage LuxHub vault settings

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  HiOutlineRefresh,
  HiOutlineShieldCheck,
  HiOutlineKey,
  HiOutlineUserAdd,
  HiOutlineUserRemove,
  HiOutlineExternalLink,
  HiOutlineCog,
  HiOutlineExclamation,
} from 'react-icons/hi';
import { LuShield, LuBadgeCheck, LuSparkles } from 'react-icons/lu';
import styles from '../../styles/VaultConfigPanel.module.css';
import toast from 'react-hot-toast';

interface VaultAdmin {
  walletAddress: string;
  name: string;
  role: 'super_admin' | 'admin' | 'minter';
  addedAt: string;
  addedBy: string;
}

interface VaultConfigData {
  _id?: string;
  vaultPda: string;
  multisigAddress: string;
  collectionMint?: string;
  mintApprovalThreshold: number;
  transferApprovalThreshold: number;
  totalMinted: number;
  totalDistributed: number;
  currentHoldings: number;
  isActive: boolean;
  authorizedAdmins?: VaultAdmin[];
}

interface LuxHubVendor {
  id: string;
  businessName: string;
  username: string;
  walletAddress: string;
}

export const VaultConfigPanel: React.FC = () => {
  const wallet = useWallet();
  const [config, setConfig] = useState<VaultConfigData | null>(null);
  const [vendor, setVendor] = useState<LuxHubVendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [newAdminWallet, setNewAdminWallet] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'super_admin' | 'admin' | 'minter'>('minter');
  const [mintThreshold, setMintThreshold] = useState(1);
  const [transferThreshold, setTransferThreshold] = useState(2);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // Multisig change states
  const [showChangeMultisig, setShowChangeMultisig] = useState(false);
  const [newMultisigAddress, setNewMultisigAddress] = useState('');
  const [derivedVaultPda, setDerivedVaultPda] = useState<string | null>(null);
  const [derivingPda, setDerivingPda] = useState(false);
  const [confirmMultisigChange, setConfirmMultisigChange] = useState(false);

  // Check if current user is super_admin
  const isSuperAdmin = config?.authorizedAdmins?.some(
    (a) => a.walletAddress === wallet.publicKey?.toBase58() && a.role === 'super_admin'
  );

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch public config
      const response = await fetch('/api/vault/config');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch vault config');
      }

      setConfig(data.data.config);
      setVendor(data.data.luxhubVendor);
      setMintThreshold(data.data.config.mintApprovalThreshold || 1);
      setTransferThreshold(data.data.config.transferApprovalThreshold || 2);

      // Fetch full config with admins (requires auth)
      if (wallet.publicKey) {
        const fullResponse = await fetch('/api/vault/config/admins', {
          headers: {
            'x-admin-wallet': wallet.publicKey.toBase58(),
          },
        });
        if (fullResponse.ok) {
          const fullData = await fullResponse.json();
          if (fullData.data?.authorizedAdmins) {
            setConfig((prev) =>
              prev ? { ...prev, authorizedAdmins: fullData.data.authorizedAdmins } : prev
            );
          }
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('[VaultConfigPanel] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateConfig = async (updates: Record<string, unknown>) => {
    if (!wallet.publicKey) {
      toast.error('Wallet not connected');
      return;
    }

    setUpdating(true);
    try {
      const response = await fetch('/api/vault/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-wallet': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update config');
      }

      toast.success('Vault config updated');
      fetchConfig();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(errorMessage);
    } finally {
      setUpdating(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminWallet.trim()) {
      toast.error('Please enter a wallet address');
      return;
    }

    await updateConfig({
      addAdmin: {
        walletAddress: newAdminWallet.trim(),
        name: newAdminName.trim() || 'Admin',
        role: newAdminRole,
      },
    });

    setNewAdminWallet('');
    setNewAdminName('');
    setNewAdminRole('minter');
    setShowAddAdmin(false);
  };

  const handleRemoveAdmin = async (walletAddress: string) => {
    await updateConfig({ removeAdmin: walletAddress });
    setConfirmRemove(null);
  };

  const handleUpdateThresholds = async () => {
    await updateConfig({
      mintApprovalThreshold: mintThreshold,
      transferApprovalThreshold: transferThreshold,
    });
  };

  // Derive vault PDA from multisig address
  const deriveVaultPda = async (multisigAddr: string) => {
    if (!multisigAddr || multisigAddr.length < 32) {
      setDerivedVaultPda(null);
      return;
    }

    setDerivingPda(true);
    try {
      const response = await fetch('/api/vault/derive-pda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ multisigAddress: multisigAddr, vaultIndex: 1 }),
      });

      const data = await response.json();
      if (response.ok && data.vaultPda) {
        setDerivedVaultPda(data.vaultPda);
      } else {
        setDerivedVaultPda(null);
        toast.error(data.error || 'Failed to derive vault PDA');
      }
    } catch (err) {
      console.error('[VaultConfigPanel] Derive PDA error:', err);
      setDerivedVaultPda(null);
    } finally {
      setDerivingPda(false);
    }
  };

  // Handle multisig change
  const handleChangeMultisig = async () => {
    if (!wallet.publicKey || !newMultisigAddress || !derivedVaultPda) {
      toast.error('Missing required data');
      return;
    }

    setUpdating(true);
    try {
      const response = await fetch('/api/vault/config/change-multisig', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-wallet': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify({
          newMultisigAddress: newMultisigAddress.trim(),
          newVaultPda: derivedVaultPda,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to change multisig');
      }

      toast.success('Multisig updated successfully!');
      setShowChangeMultisig(false);
      setConfirmMultisigChange(false);
      setNewMultisigAddress('');
      setDerivedVaultPda(null);
      fetchConfig();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(errorMessage);
    } finally {
      setUpdating(false);
    }
  };

  const truncateAddress = (addr: string) => {
    if (!addr || addr.length < 10) return addr || 'N/A';
    return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'super_admin':
        return styles.roleSuperAdmin;
      case 'admin':
        return styles.roleAdmin;
      default:
        return styles.roleMinter;
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
        <span>Loading vault configuration...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <HiOutlineExclamation className={styles.errorIcon} />
        <p>{error}</p>
        <button onClick={fetchConfig}>Try Again</button>
      </div>
    );
  }

  if (!config) {
    return (
      <div className={styles.emptyState}>
        <LuShield className={styles.emptyIcon} />
        <h3>Vault Not Configured</h3>
        <p>Run the seed script to initialize the vault:</p>
        <code>node scripts/seedLuxHubVault.mjs</code>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h3 className={styles.title}>
            <LuShield className={styles.titleIcon} />
            Vault Configuration
          </h3>
          {!isSuperAdmin && wallet.publicKey && (
            <span className={styles.readOnlyBadge}>Read Only</span>
          )}
        </div>
        <button className={styles.refreshBtn} onClick={fetchConfig} disabled={loading}>
          <HiOutlineRefresh className={loading ? styles.spinning : ''} />
          Refresh
        </button>
      </div>

      {/* Vault Info */}
      <div className={styles.infoGrid}>
        <div className={styles.infoCard}>
          <div className={styles.infoLabel}>Vault PDA</div>
          <div className={styles.infoValue}>
            <code>{truncateAddress(config.vaultPda)}</code>
            <a
              href={`https://solscan.io/account/${config.vaultPda}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              <HiOutlineExternalLink />
            </a>
          </div>
        </div>

        <div className={styles.infoCard}>
          <div className={styles.infoLabel}>Multisig Address</div>
          <div className={styles.infoValue}>
            <code>{truncateAddress(config.multisigAddress)}</code>
            <a
              href={`https://v4.squads.so/squads/${config.multisigAddress}/home`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              <HiOutlineExternalLink />
            </a>
          </div>
        </div>

        <div className={styles.infoCard}>
          <div className={styles.infoLabel}>Holdings</div>
          <div className={styles.infoValueLarge}>{config.currentHoldings}</div>
        </div>

        <div className={styles.infoCard}>
          <div className={styles.infoLabel}>Total Minted</div>
          <div className={styles.infoValueLarge}>{config.totalMinted}</div>
        </div>
      </div>

      {/* LuxHub Vendor Info */}
      {vendor && (
        <div className={styles.vendorCard}>
          <div className={styles.vendorHeader}>
            <LuBadgeCheck className={styles.vendorIcon} />
            <span>Official Vendor</span>
          </div>
          <div className={styles.vendorInfo}>
            <span className={styles.vendorName}>{vendor.businessName}</span>
            <span className={styles.vendorUsername}>@{vendor.username}</span>
            {vendor.walletAddress && (
              <code className={styles.vendorWallet}>{truncateAddress(vendor.walletAddress)}</code>
            )}
          </div>
        </div>
      )}

      {/* Multisig Management - Super Admin Only */}
      {isSuperAdmin && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h4 className={styles.sectionTitle}>
              <HiOutlineShieldCheck />
              Multisig Management
            </h4>
            {!showChangeMultisig && (
              <button
                className={styles.changeMultisigBtn}
                onClick={() => setShowChangeMultisig(true)}
              >
                <HiOutlineCog />
                Change Multisig
              </button>
            )}
          </div>

          {showChangeMultisig && (
            <div className={styles.changeMultisigForm}>
              <div className={styles.warningBanner}>
                <HiOutlineExclamation className={styles.warningIcon} />
                <div>
                  <strong>Warning:</strong> Changing the multisig will change the vault PDA. All new
                  NFTs will be minted to the new vault. Existing NFTs remain at their current
                  location.
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>New Squads Multisig Address</label>
                <input
                  type="text"
                  placeholder="Enter new Squads multisig address..."
                  value={newMultisigAddress}
                  onChange={(e) => {
                    setNewMultisigAddress(e.target.value);
                    setDerivedVaultPda(null);
                    setConfirmMultisigChange(false);
                  }}
                  className={styles.input}
                />
              </div>

              {newMultisigAddress.length >= 32 && (
                <div className={styles.deriveSection}>
                  <button
                    className={styles.deriveBtn}
                    onClick={() => deriveVaultPda(newMultisigAddress)}
                    disabled={derivingPda}
                  >
                    {derivingPda ? 'Deriving...' : 'Derive Vault PDA (Index 1)'}
                  </button>

                  {derivedVaultPda && (
                    <div className={styles.derivedResult}>
                      <span className={styles.derivedLabel}>New Vault PDA:</span>
                      <code className={styles.derivedValue}>{derivedVaultPda}</code>
                      <a
                        href={`https://solscan.io/account/${derivedVaultPda}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.externalLink}
                      >
                        <HiOutlineExternalLink />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {derivedVaultPda && !confirmMultisigChange && (
                <div className={styles.confirmSection}>
                  <label className={styles.confirmCheckbox}>
                    <input
                      type="checkbox"
                      checked={confirmMultisigChange}
                      onChange={(e) => setConfirmMultisigChange(e.target.checked)}
                    />
                    <span>I understand this will change the vault configuration</span>
                  </label>
                </div>
              )}

              <div className={styles.formActions}>
                <button
                  className={styles.cancelBtn}
                  onClick={() => {
                    setShowChangeMultisig(false);
                    setNewMultisigAddress('');
                    setDerivedVaultPda(null);
                    setConfirmMultisigChange(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  className={styles.submitBtn}
                  onClick={handleChangeMultisig}
                  disabled={!derivedVaultPda || !confirmMultisigChange || updating}
                >
                  {updating ? 'Updating...' : 'Update Multisig'}
                </button>
              </div>
            </div>
          )}

          {!showChangeMultisig && (
            <div className={styles.currentMultisigInfo}>
              <div className={styles.multisigRow}>
                <span className={styles.multisigLabel}>Current Multisig:</span>
                <code>{config.multisigAddress}</code>
                <a
                  href={`https://v4.squads.so/squads/${config.multisigAddress}/home`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.squadsLink}
                >
                  Open in Squads <HiOutlineExternalLink />
                </a>
              </div>
              <div className={styles.multisigRow}>
                <span className={styles.multisigLabel}>Vault PDA (Index 1):</span>
                <code>{config.vaultPda}</code>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Approval Thresholds */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <HiOutlineCog />
          Approval Thresholds
        </h4>
        <div className={styles.thresholdGrid}>
          <div className={styles.thresholdItem}>
            <label>Mint Approval</label>
            <div className={styles.thresholdInput}>
              <input
                type="number"
                min="1"
                max="10"
                value={mintThreshold}
                onChange={(e) => setMintThreshold(parseInt(e.target.value) || 1)}
                disabled={!isSuperAdmin || updating}
              />
              <span>signatures required</span>
            </div>
          </div>
          <div className={styles.thresholdItem}>
            <label>Transfer Approval</label>
            <div className={styles.thresholdInput}>
              <input
                type="number"
                min="1"
                max="10"
                value={transferThreshold}
                onChange={(e) => setTransferThreshold(parseInt(e.target.value) || 1)}
                disabled={!isSuperAdmin || updating}
              />
              <span>signatures required</span>
            </div>
          </div>
        </div>
        {isSuperAdmin && (
          <button
            className={styles.updateBtn}
            onClick={handleUpdateThresholds}
            disabled={
              updating ||
              (mintThreshold === config.mintApprovalThreshold &&
                transferThreshold === config.transferApprovalThreshold)
            }
          >
            {updating ? 'Updating...' : 'Update Thresholds'}
          </button>
        )}
      </div>

      {/* Authorized Admins */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>
            <HiOutlineKey />
            Authorized Admins
          </h4>
          {isSuperAdmin && (
            <button className={styles.addAdminBtn} onClick={() => setShowAddAdmin(!showAddAdmin)}>
              <HiOutlineUserAdd />
              Add Admin
            </button>
          )}
        </div>

        {/* Add Admin Form */}
        {showAddAdmin && isSuperAdmin && (
          <div className={styles.addAdminForm}>
            <div className={styles.formRow}>
              <input
                type="text"
                placeholder="Wallet Address"
                value={newAdminWallet}
                onChange={(e) => setNewAdminWallet(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.formRow}>
              <input
                type="text"
                placeholder="Name (optional)"
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                className={styles.inputSmall}
              />
              <select
                value={newAdminRole}
                onChange={(e) =>
                  setNewAdminRole(e.target.value as 'super_admin' | 'admin' | 'minter')
                }
                className={styles.select}
              >
                <option value="minter">Minter</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={() => setShowAddAdmin(false)}>
                Cancel
              </button>
              <button
                className={styles.submitBtn}
                onClick={handleAddAdmin}
                disabled={updating || !newAdminWallet.trim()}
              >
                {updating ? 'Adding...' : 'Add Admin'}
              </button>
            </div>
          </div>
        )}

        {/* Admin List */}
        <div className={styles.adminList}>
          {config.authorizedAdmins?.length === 0 ? (
            <p className={styles.noAdmins}>No admins configured</p>
          ) : (
            config.authorizedAdmins?.map((admin) => (
              <div key={admin.walletAddress} className={styles.adminItem}>
                <div className={styles.adminInfo}>
                  <div className={styles.adminHeader}>
                    <span className={styles.adminName}>{admin.name || 'Admin'}</span>
                    <span className={`${styles.roleBadge} ${getRoleBadgeClass(admin.role)}`}>
                      {admin.role.replace('_', ' ')}
                    </span>
                  </div>
                  <code className={styles.adminWallet}>{admin.walletAddress}</code>
                  <span className={styles.adminMeta}>
                    Added {new Date(admin.addedAt).toLocaleDateString()}
                    {admin.addedBy && ` by ${truncateAddress(admin.addedBy)}`}
                  </span>
                </div>

                {isSuperAdmin && admin.walletAddress !== wallet.publicKey?.toBase58() && (
                  <div className={styles.adminActions}>
                    {confirmRemove === admin.walletAddress ? (
                      <div className={styles.confirmRemove}>
                        <span>Remove?</span>
                        <button
                          className={styles.confirmYes}
                          onClick={() => handleRemoveAdmin(admin.walletAddress)}
                          disabled={updating}
                        >
                          Yes
                        </button>
                        <button className={styles.confirmNo} onClick={() => setConfirmRemove(null)}>
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        className={styles.removeBtn}
                        onClick={() => setConfirmRemove(admin.walletAddress)}
                        title="Remove admin"
                      >
                        <HiOutlineUserRemove />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Setup Instructions */}
      {!wallet.publicKey && (
        <div className={styles.helpCard}>
          <HiOutlineShieldCheck className={styles.helpIcon} />
          <div>
            <h4>Connect Wallet to Manage</h4>
            <p>Connect a super_admin wallet to add/remove admins and update settings.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VaultConfigPanel;
