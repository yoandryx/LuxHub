// src/components/admins/PlatformSettingsPanel.tsx
// Comprehensive platform settings for super_admin
// Replaces env vars with database-managed config

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  HiOutlineRefresh,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlineShieldCheck,
  HiOutlineDatabase,
  HiOutlineGlobe,
  HiOutlineLightningBolt,
  HiOutlineExternalLink,
  HiOutlineSave,
  HiOutlineExclamation,
  HiOutlineCheck,
} from 'react-icons/hi';
import { LuSettings2, LuWallet, LuCoins } from 'react-icons/lu';
import styles from '../../styles/PlatformSettingsPanel.module.css';
import toast from 'react-hot-toast';

interface PlatformConfigData {
  _id?: string;
  solana: {
    rpcEndpoint: string;
    cluster: string;
    programId: string;
  };
  multisig: {
    address: string;
    treasuryVaultIndex: number;
    nftVaultIndex: number;
    treasuryVaultPda: string;
    nftVaultPda: string;
  };
  wallets: {
    luxhubWallet: string;
    feeCollector: string;
  };
  platform: {
    name: string;
    feePercentage: number;
    royaltyPercentage: number;
    minListingPrice: number;
    maxListingPrice: number;
  };
  features: {
    escrowEnabled: boolean;
    poolsEnabled: boolean;
    aiVerificationEnabled: boolean;
    bulkMintEnabled: boolean;
    squadsIntegrationEnabled: boolean;
  };
  services: {
    ipfsGateway: string;
    irysGateway: string;
    solscanBaseUrl: string;
  };
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
}

export const PlatformSettingsPanel: React.FC = () => {
  const wallet = useWallet();
  const [config, setConfig] = useState<PlatformConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Editable config state
  const [editConfig, setEditConfig] = useState<PlatformConfigData | null>(null);

  // Derive vault PDA state
  const [derivingPda, setDerivingPda] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {};
      if (wallet.publicKey) {
        headers['x-admin-wallet'] = wallet.publicKey.toBase58();
      }

      const params = new URLSearchParams();
      if (showSensitive) params.append('showSensitive', 'true');

      const response = await fetch(`/api/platform/config?${params}`, { headers });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch config');
      }

      setConfig(data.data);
      setEditConfig(JSON.parse(JSON.stringify(data.data))); // Deep copy
      setIsSuperAdmin(data.isSuperAdmin || false);
      setHasChanges(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey, showSensitive]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    if (!wallet.publicKey || !editConfig) return;

    setSaving(true);
    try {
      const response = await fetch('/api/platform/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-wallet': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify(editConfig),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save config');
      }

      toast.success('Settings saved successfully!');
      setHasChanges(false);
      fetchConfig();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (section: keyof PlatformConfigData, field: string, value: unknown) => {
    if (!editConfig) return;

    setEditConfig((prev) => {
      if (!prev) return prev;
      const sectionData = prev[section];
      if (typeof sectionData === 'object' && sectionData !== null) {
        return {
          ...prev,
          [section]: {
            ...sectionData,
            [field]: value,
          },
        };
      }
      return prev;
    });
    setHasChanges(true);
  };

  const deriveVaultPda = async (multisigAddr: string, vaultIndex: number, field: string) => {
    if (!multisigAddr || multisigAddr.length < 32) {
      toast.error('Invalid multisig address');
      return;
    }

    setDerivingPda(true);
    try {
      const response = await fetch('/api/vault/derive-pda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ multisigAddress: multisigAddr, vaultIndex }),
      });

      const data = await response.json();
      if (response.ok && data.vaultPda) {
        updateField('multisig', field, data.vaultPda);
        toast.success(`Derived vault PDA for index ${vaultIndex}`);
      } else {
        toast.error(data.error || 'Failed to derive PDA');
      }
    } catch {
      toast.error('Failed to derive vault PDA');
    } finally {
      setDerivingPda(false);
    }
  };

  const truncateAddress = (addr: string) => {
    if (!addr || addr.length < 10) return addr || 'Not set';
    return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
        <span>Loading platform settings...</span>
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

  if (!editConfig) return null;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h3 className={styles.title}>
            <LuSettings2 className={styles.titleIcon} />
            Platform Settings
          </h3>
          {!isSuperAdmin && <span className={styles.readOnlyBadge}>Read Only</span>}
        </div>
        <div className={styles.headerActions}>
          {isSuperAdmin && (
            <button
              className={`${styles.toggleBtn} ${showSensitive ? styles.active : ''}`}
              onClick={() => setShowSensitive(!showSensitive)}
              title={showSensitive ? 'Hide sensitive data' : 'Show sensitive data'}
            >
              {showSensitive ? <HiOutlineEyeOff /> : <HiOutlineEye />}
              {showSensitive ? 'Hide' : 'Show'}
            </button>
          )}
          <button className={styles.refreshBtn} onClick={fetchConfig} disabled={loading}>
            <HiOutlineRefresh className={loading ? styles.spinning : ''} />
          </button>
        </div>
      </div>

      {/* Unsaved Changes Banner */}
      {hasChanges && isSuperAdmin && (
        <div className={styles.unsavedBanner}>
          <HiOutlineExclamation />
          <span>You have unsaved changes</span>
          <button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Multisig & Vault Section */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <HiOutlineShieldCheck />
          Multisig & Vault Configuration
        </h4>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label>Squads Multisig Address</label>
            <div className={styles.fieldWithAction}>
              <input
                type="text"
                value={editConfig.multisig.address}
                onChange={(e) => updateField('multisig', 'address', e.target.value)}
                disabled={!isSuperAdmin || !showSensitive}
                className={styles.input}
                placeholder="Enter multisig address..."
              />
              {editConfig.multisig.address && (
                <a
                  href={`https://v4.squads.so/squads/${editConfig.multisig.address}/home`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.externalLink}
                >
                  <HiOutlineExternalLink />
                </a>
              )}
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Treasury Vault (Index {editConfig.multisig.treasuryVaultIndex})</label>
              <div className={styles.fieldWithAction}>
                <input
                  type="text"
                  value={editConfig.multisig.treasuryVaultPda}
                  onChange={(e) => updateField('multisig', 'treasuryVaultPda', e.target.value)}
                  disabled={!isSuperAdmin || !showSensitive}
                  className={styles.input}
                />
                {isSuperAdmin && showSensitive && (
                  <button
                    className={styles.deriveBtn}
                    onClick={() =>
                      deriveVaultPda(editConfig.multisig.address, 0, 'treasuryVaultPda')
                    }
                    disabled={derivingPda}
                    title="Derive from multisig"
                  >
                    {derivingPda ? '...' : 'Derive'}
                  </button>
                )}
              </div>
            </div>
            <div className={styles.field}>
              <label>NFT Vault (Index {editConfig.multisig.nftVaultIndex})</label>
              <div className={styles.fieldWithAction}>
                <input
                  type="text"
                  value={editConfig.multisig.nftVaultPda}
                  onChange={(e) => updateField('multisig', 'nftVaultPda', e.target.value)}
                  disabled={!isSuperAdmin || !showSensitive}
                  className={styles.input}
                />
                {isSuperAdmin && showSensitive && (
                  <button
                    className={styles.deriveBtn}
                    onClick={() => deriveVaultPda(editConfig.multisig.address, 1, 'nftVaultPda')}
                    disabled={derivingPda}
                    title="Derive from multisig"
                  >
                    {derivingPda ? '...' : 'Derive'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Wallets Section */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <LuWallet />
          Wallet Configuration
        </h4>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label>LuxHub Main Wallet</label>
            <input
              type="text"
              value={editConfig.wallets.luxhubWallet}
              onChange={(e) => updateField('wallets', 'luxhubWallet', e.target.value)}
              disabled={!isSuperAdmin || !showSensitive}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label>Fee Collector Wallet</label>
            <input
              type="text"
              value={editConfig.wallets.feeCollector}
              onChange={(e) => updateField('wallets', 'feeCollector', e.target.value)}
              disabled={!isSuperAdmin || !showSensitive}
              className={styles.input}
            />
          </div>
        </div>
      </div>

      {/* Solana Configuration */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <HiOutlineGlobe />
          Solana Configuration
        </h4>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label>RPC Endpoint</label>
            <input
              type="text"
              value={editConfig.solana.rpcEndpoint}
              onChange={(e) => updateField('solana', 'rpcEndpoint', e.target.value)}
              disabled={!isSuperAdmin}
              className={styles.input}
              placeholder="https://api.devnet.solana.com"
            />
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Cluster</label>
              <select
                value={editConfig.solana.cluster}
                onChange={(e) => updateField('solana', 'cluster', e.target.value)}
                disabled={!isSuperAdmin}
                className={styles.select}
              >
                <option value="devnet">Devnet</option>
                <option value="mainnet-beta">Mainnet</option>
                <option value="testnet">Testnet</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Program ID</label>
              <input
                type="text"
                value={editConfig.solana.programId}
                onChange={(e) => updateField('solana', 'programId', e.target.value)}
                disabled={!isSuperAdmin || !showSensitive}
                className={styles.input}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Platform Settings */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <LuCoins />
          Platform Economics
        </h4>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Platform Fee (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={editConfig.platform.feePercentage}
              onChange={(e) =>
                updateField('platform', 'feePercentage', parseFloat(e.target.value) || 0)
              }
              disabled={!isSuperAdmin}
              className={styles.inputSmall}
            />
          </div>
          <div className={styles.field}>
            <label>Royalty (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={editConfig.platform.royaltyPercentage}
              onChange={(e) =>
                updateField('platform', 'royaltyPercentage', parseFloat(e.target.value) || 0)
              }
              disabled={!isSuperAdmin}
              className={styles.inputSmall}
            />
          </div>
          <div className={styles.field}>
            <label>Min Listing (SOL)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={editConfig.platform.minListingPrice}
              onChange={(e) =>
                updateField('platform', 'minListingPrice', parseFloat(e.target.value) || 0)
              }
              disabled={!isSuperAdmin}
              className={styles.inputSmall}
            />
          </div>
          <div className={styles.field}>
            <label>Max Listing (SOL)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={editConfig.platform.maxListingPrice}
              onChange={(e) =>
                updateField('platform', 'maxListingPrice', parseFloat(e.target.value) || 0)
              }
              disabled={!isSuperAdmin}
              className={styles.inputSmall}
            />
          </div>
        </div>
      </div>

      {/* Feature Flags */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <HiOutlineLightningBolt />
          Feature Flags
        </h4>
        <div className={styles.featureGrid}>
          {Object.entries(editConfig.features).map(([key, value]) => (
            <label key={key} className={styles.featureToggle}>
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => updateField('features', key, e.target.checked)}
                disabled={!isSuperAdmin}
              />
              <span className={styles.featureLabel}>
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
              </span>
              <span
                className={`${styles.featureStatus} ${value ? styles.enabled : styles.disabled}`}
              >
                {value ? <HiOutlineCheck /> : null}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* External Services */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <HiOutlineDatabase />
          External Services
        </h4>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label>IPFS Gateway</label>
            <input
              type="text"
              value={editConfig.services.ipfsGateway}
              onChange={(e) => updateField('services', 'ipfsGateway', e.target.value)}
              disabled={!isSuperAdmin}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label>Irys Gateway</label>
            <input
              type="text"
              value={editConfig.services.irysGateway}
              onChange={(e) => updateField('services', 'irysGateway', e.target.value)}
              disabled={!isSuperAdmin}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label>Solscan Base URL</label>
            <input
              type="text"
              value={editConfig.services.solscanBaseUrl}
              onChange={(e) => updateField('services', 'solscanBaseUrl', e.target.value)}
              disabled={!isSuperAdmin}
              className={styles.input}
            />
          </div>
        </div>
      </div>

      {/* Last Updated Info */}
      {config?.lastUpdatedAt && (
        <div className={styles.lastUpdated}>
          Last updated: {new Date(config.lastUpdatedAt).toLocaleString()}
          {config.lastUpdatedBy && ` by ${truncateAddress(config.lastUpdatedBy)}`}
        </div>
      )}

      {/* Save Button (Fixed at bottom) */}
      {hasChanges && isSuperAdmin && (
        <div className={styles.saveBar}>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            <HiOutlineSave />
            {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      )}
    </div>
  );
};

export default PlatformSettingsPanel;
