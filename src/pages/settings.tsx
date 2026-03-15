import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  FaBell,
  FaEnvelope,
  FaShieldHalved,
  FaCheck,
  FaXTwitter,
  FaInstagram,
} from 'react-icons/fa6';
import { FaToggleOn, FaToggleOff } from 'react-icons/fa';
import toast from 'react-hot-toast';
import styles from '../styles/Settings.module.css';

interface NotificationPrefs {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  orderUpdates: boolean;
  offerAlerts: boolean;
  paymentAlerts: boolean;
  poolUpdates: boolean;
  securityAlerts: boolean;
  marketingUpdates: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  emailEnabled: true,
  inAppEnabled: true,
  orderUpdates: true,
  offerAlerts: true,
  paymentAlerts: true,
  poolUpdates: true,
  securityAlerts: true,
  marketingUpdates: false,
};

export default function SettingsPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [email, setEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!wallet) return;
    fetch(`/api/users/notification-prefs?wallet=${wallet}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setPrefs(data.preferences);
          setEmail(data.email || '');
          setEmailVerified(data.emailVerified || false);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [wallet]);

  const save = useCallback(
    async (newPrefs: NotificationPrefs, newEmail?: string) => {
      if (!wallet) return;
      setSaving(true);
      try {
        const body: Record<string, unknown> = { wallet, preferences: newPrefs };
        if (newEmail !== undefined) body.email = newEmail;
        const res = await fetch('/api/users/notification-prefs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
          setPrefs(data.preferences);
          toast.success('Settings saved');
        } else {
          toast.error(data.error || 'Failed to save');
        }
      } catch {
        toast.error('Failed to save settings');
      } finally {
        setSaving(false);
      }
    },
    [wallet]
  );

  const toggle = (key: keyof NotificationPrefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    save(updated);
  };

  if (!wallet) {
    return (
      <>
        <Head>
          <title>Settings | LuxHub</title>
        </Head>
        <div className={styles.page}>
          <div className={styles.ambientBg} />
          <main className={styles.main}>
            <div className={styles.emptyState}>
              <h3>Connect Wallet</h3>
              <p>Connect your wallet to manage preferences.</p>
            </div>
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Settings | LuxHub</title>
      </Head>

      <div className={styles.page}>
        <div className={styles.ambientBg} />

        <main className={styles.main}>
          <header className={styles.header}>
            <h1 className={styles.headerTitle}>Settings</h1>
            <p className={styles.headerSub}>
              Manage your notifications, email, and account preferences.
            </p>
          </header>

          <div className={styles.grid}>
            {/* Left column */}
            <div className={styles.column}>
              {/* Email */}
              <section className={styles.section}>
                <span className={styles.sectionLabel}>
                  <FaEnvelope /> Email
                </span>
                <div className={styles.card}>
                  <p className={styles.cardDesc}>
                    Add your email for order updates and alerts. Never shared.
                  </p>
                  <div className={styles.emailRow}>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className={styles.input}
                    />
                    <button
                      onClick={() => save(prefs, email)}
                      disabled={saving}
                      className={styles.saveBtn}
                    >
                      {saving ? '...' : 'Save'}
                    </button>
                  </div>
                  {emailVerified && (
                    <div className={styles.verified}>
                      <FaCheck /> Verified
                    </div>
                  )}
                </div>
              </section>

              {/* Channels */}
              <section className={styles.section}>
                <span className={styles.sectionLabel}>
                  <FaBell /> Channels
                </span>
                <div className={styles.card}>
                  <ToggleRow
                    label="In-App Notifications"
                    desc="Bell icon alerts inside LuxHub"
                    value={prefs.inAppEnabled}
                    onToggle={() => toggle('inAppEnabled')}
                  />
                  <ToggleRow
                    label="Email Notifications"
                    desc={email ? `Sent to ${email}` : 'Add email above to enable'}
                    value={prefs.emailEnabled}
                    onToggle={() => toggle('emailEnabled')}
                    disabled={!email}
                  />
                </div>
              </section>

              {/* Social */}
              <section className={styles.section}>
                <span className={styles.sectionLabel}>
                  <FaXTwitter /> Social Verification
                </span>
                <div className={styles.card}>
                  <p className={styles.cardDesc}>
                    Connect social accounts for a verified badge. Coming soon.
                  </p>
                  <div className={styles.socialRow}>
                    <button className={styles.socialBtn} disabled>
                      <FaXTwitter /> Connect X
                    </button>
                    <button className={styles.socialBtn} disabled>
                      <FaInstagram /> Connect Instagram
                    </button>
                  </div>
                </div>
              </section>
            </div>

            {/* Right column */}
            <div className={styles.column}>
              {/* Categories */}
              <section className={styles.section}>
                <span className={styles.sectionLabel}>
                  <FaShieldHalved /> Notification Categories
                </span>
                <div className={styles.card}>
                  <ToggleRow
                    label="Order Updates"
                    desc="Purchases, shipments, delivery"
                    value={prefs.orderUpdates}
                    onToggle={() => toggle('orderUpdates')}
                  />
                  <ToggleRow
                    label="Offer Alerts"
                    desc="New offers, counter-offers, status"
                    value={prefs.offerAlerts}
                    onToggle={() => toggle('offerAlerts')}
                  />
                  <ToggleRow
                    label="Payment Alerts"
                    desc="Payouts, refunds, fund releases"
                    value={prefs.paymentAlerts}
                    onToggle={() => toggle('paymentAlerts')}
                  />
                  <ToggleRow
                    label="Pool Updates"
                    desc="Contributions, distributions"
                    value={prefs.poolUpdates}
                    onToggle={() => toggle('poolUpdates')}
                  />
                  <ToggleRow
                    label="Security Alerts"
                    desc="Disputes, escalations"
                    value={prefs.securityAlerts}
                    onToggle={() => toggle('securityAlerts')}
                  />
                  <ToggleRow
                    label="Platform News"
                    desc="Features, partnerships"
                    value={prefs.marketingUpdates}
                    onToggle={() => toggle('marketingUpdates')}
                  />
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

function ToggleRow({
  label,
  desc,
  value,
  onToggle,
  disabled,
}: {
  label: string;
  desc: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`${styles.toggleRow} ${value ? styles.toggleActive : ''}`}>
      <div>
        <div className={styles.toggleLabel}>{label}</div>
        <div className={styles.toggleDesc}>{desc}</div>
      </div>
      <button onClick={onToggle} disabled={disabled} className={styles.toggleBtn}>
        {value ? <FaToggleOn /> : <FaToggleOff />}
      </button>
    </div>
  );
}
