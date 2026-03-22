// src/components/common/EmailPromptBanner.tsx
// Reusable banner prompting wallet-only users to add an email for notifications
import React, { useState, useEffect } from 'react';
import { FiMail, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import styles from '../../styles/EmailPromptBanner.module.css';

interface EmailPromptBannerProps {
  wallet: string;
}

const EmailPromptBanner: React.FC<EmailPromptBannerProps> = ({ wallet }) => {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState(false);

  const storageKey = `luxhub_email_banner_dismissed_${wallet}`;

  useEffect(() => {
    // Check localStorage dismissal first
    if (typeof window !== 'undefined' && localStorage.getItem(storageKey) === 'true') {
      setChecked(true);
      return;
    }

    // Check if user already has email set
    const checkEmail = async () => {
      try {
        const res = await fetch(`/api/users/notification-prefs?wallet=${wallet}`);
        const data = await res.json();
        if (data.email) {
          // User already has email, no need to show banner
          setChecked(true);
          return;
        }
        setVisible(true);
      } catch {
        // Fail silently — don't show banner on error
      }
      setChecked(true);
    };

    checkEmail();
  }, [wallet, storageKey]);

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, 'true');
    }
    setVisible(false);
  };

  const handleSave = async () => {
    if (!email.trim() || saving) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/users/notification-prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, email: email.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save email');
      }

      toast.success('Email saved!');
      setVisible(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save email');
    } finally {
      setSaving(false);
    }
  };

  // Don't render until check is complete, and only if visible
  if (!checked || !visible) return null;

  return (
    <div className={styles.banner}>
      <FiMail className={styles.icon} />
      <span className={styles.text}>Add your email to receive order updates and notifications</span>
      <div className={styles.inputGroup}>
        <input
          type="email"
          className={styles.emailInput}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving || !email.trim()}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <button className={styles.dismissBtn} onClick={handleDismiss} aria-label="Dismiss">
        <FiX size={18} />
      </button>
    </div>
  );
};

export default EmailPromptBanner;
