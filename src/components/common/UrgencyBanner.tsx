import React, { useState, useEffect } from 'react';
import { FiAlertCircle, FiX } from 'react-icons/fi';
import type { UrgencyLevel } from '../../hooks/useCountdown';
import styles from '../../styles/UrgencyBanner.module.css';

interface UrgencyOffer {
  _id: string;
  assetModel?: string;
  expiresAt?: string;
  paymentDeadline?: string;
  status: string;
  createdAt: string;
  respondedAt?: string;
}

interface UrgencyBannerProps {
  offers: UrgencyOffer[];
}

function getUrgencyLevel(deadlineMs: number): UrgencyLevel {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) return 'expired';
  if (remaining < 3_600_000) return 'red';
  if (remaining < 14_400_000) return 'amber';
  return 'normal';
}

const DISMISS_KEY_PREFIX = 'urgency-banner-dismissed-';
const DISMISS_DURATION_MS = 60 * 60 * 1000; // 1 hour

function isDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(DISMISS_KEY_PREFIX));
  for (const key of keys) {
    const ts = parseInt(key.replace(DISMISS_KEY_PREFIX, ''), 10);
    if (Date.now() - ts < DISMISS_DURATION_MS) return true;
    // Clean up expired dismiss keys
    localStorage.removeItem(key);
  }
  return false;
}

function UrgencyBanner({ offers }: UrgencyBannerProps) {
  const [dismissed, setDismissed] = useState(true); // default true to avoid flash

  useEffect(() => {
    setDismissed(isDismissed());
  }, []);

  if (dismissed) return null;

  // Filter to active offers with urgency
  const urgentOffers = offers.filter((offer) => {
    if (!['pending', 'countered', 'accepted'].includes(offer.status)) return false;
    const deadline =
      offer.status === 'accepted'
        ? offer.paymentDeadline
        : offer.expiresAt;
    if (!deadline) return false;
    const level = getUrgencyLevel(new Date(deadline).getTime());
    return level === 'amber' || level === 'red';
  });

  if (urgentOffers.length === 0) return null;

  // Determine highest urgency
  const hasRed = urgentOffers.some((offer) => {
    const deadline =
      offer.status === 'accepted' ? offer.paymentDeadline : offer.expiresAt;
    return deadline && getUrgencyLevel(new Date(deadline).getTime()) === 'red';
  });
  const bannerLevel: 'red' | 'amber' = hasRed ? 'red' : 'amber';
  const count = urgentOffers.length;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(`${DISMISS_KEY_PREFIX}${Date.now()}`, 'true');
  };

  return (
    <div className={`${styles.banner} ${bannerLevel === 'red' ? styles.bannerRed : styles.bannerAmber}`}>
      <FiAlertCircle className={styles.icon} />
      <span className={styles.text}>
        {count} offer{count > 1 ? 's' : ''} expiring soon
      </span>
      <button className={styles.dismiss} onClick={handleDismiss} aria-label="Dismiss urgency banner">
        <FiX />
      </button>
    </div>
  );
}

export default UrgencyBanner;
