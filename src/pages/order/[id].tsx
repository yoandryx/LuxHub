// src/pages/order/[id].tsx
// Shared order status page — single timeline view for buyer, vendor, and admin
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion } from 'framer-motion';
import {
  FaCheck,
  FaClock,
  FaTruck,
  FaBoxOpen,
  FaMoneyBillWave,
  FaExclamationTriangle,
  FaCopy,
  FaArrowLeft,
  FaStar,
  FaGavel,
} from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import { resolveImageUrl, PLACEHOLDER_IMAGE } from '../../utils/imageUtils';
import toast from 'react-hot-toast';
import styles from '../../styles/LearnMore.module.css';

interface TimelineStep {
  status: string;
  label: string;
  timestamp: string | null;
  active: boolean;
  completed: boolean;
}

interface OrderData {
  id: string;
  escrowPda: string;
  status: string;
  nftMint: string;
  asset: {
    model: string;
    brand: string;
    image: string;
    serial?: string;
    condition?: string;
    priceUSD?: number;
  } | null;
  listingPriceUSD: number;
  buyer: { wallet: string };
  vendor: {
    wallet: string;
    name?: string;
    username?: string;
    avatarUrl?: string;
    verified?: boolean;
  };
  shipping: {
    status: string;
    carrier?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    estimatedDelivery?: string;
  };
  delivery: { confirmedAt?: string; rating?: number; review?: string } | null;
  dispute: {
    status: string;
    reason: string;
    createdAt: string;
    slaDeadline: string;
    resolution?: string;
    resolvedAt?: string;
  } | null;
  squads: {
    proposalIndex: string;
    executed: boolean;
    executedAt?: string;
    signature?: string;
  } | null;
  timeline: TimelineStep[];
  createdAt: string;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  listed: <FaClock />,
  funded: <FaMoneyBillWave />,
  shipped: <FaTruck />,
  delivered: <FaBoxOpen />,
  released: <FaCheck />,
};

const STATUS_COLORS: Record<string, string> = {
  listed: '#c8a1ff',
  initiated: '#c8a1ff',
  funded: '#3b82f6',
  shipped: '#f59e0b',
  delivered: '#22c55e',
  released: '#22c55e',
  cancelled: '#ef4444',
  failed: '#ef4444',
};

export default function OrderStatusPage() {
  const router = useRouter();
  const { id } = router.query;
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() || '';

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/order/${id}?wallet=${wallet}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setOrder(data.order);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, wallet]);

  if (loading) {
    return (
      <div
        className={styles.container}
        style={{
          minHeight: '80vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center', color: '#666' }}>
          <FaClock style={{ fontSize: '2rem', marginBottom: '12px', color: '#c8a1ff' }} />
          <p>Loading order...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div
        className={styles.container}
        style={{
          minHeight: '80vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center', color: '#666' }}>
          <h2 style={{ color: '#fff' }}>Order Not Found</h2>
          <p>This order doesn&apos;t exist or has been removed.</p>
          <Link href="/orders" style={{ color: '#c8a1ff', textDecoration: 'none' }}>
            <FaArrowLeft /> Back to My Orders
          </Link>
        </div>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[order.status] || '#666';
  const isBuyer = wallet === order.buyer.wallet;
  const isVendor = wallet === order.vendor.wallet;

  return (
    <>
      <Head>
        <title>Order {order.escrowPda?.slice(0, 8)}... | LuxHub</title>
      </Head>

      <div className={styles.container}>
        {/* Back Link */}
        <Link
          href="/orders"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#c8a1ff',
            textDecoration: 'none',
            fontSize: '0.85rem',
            marginBottom: '24px',
          }}
        >
          <FaArrowLeft /> Back to Orders
        </Link>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            gap: '20px',
            alignItems: 'flex-start',
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid #1f1f1f',
            background: 'rgba(13,13,13,0.85)',
            backdropFilter: 'blur(20px)',
            marginBottom: '24px',
            flexWrap: 'wrap',
          }}
        >
          {/* Asset Image */}
          {order.asset?.image && (
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: '10px',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <img
                src={resolveImageUrl(order.asset.image) || PLACEHOLDER_IMAGE}
                alt={order.asset.model || 'Asset'}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          )}

          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 600, margin: '0 0 4px', color: '#fff' }}>
              {order.asset?.brand} {order.asset?.model || 'Luxury Item'}
            </h1>

            {/* Status Badge */}
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                background: `${statusColor}15`,
                color: statusColor,
                border: `1px solid ${statusColor}40`,
                marginBottom: '12px',
              }}
            >
              {order.status}
            </span>

            {/* Price */}
            <div style={{ fontSize: '1.1rem', color: '#c8a1ff', fontWeight: 600 }}>
              ${order.listingPriceUSD?.toLocaleString() || '—'}
            </div>

            {/* Parties */}
            <div
              style={{
                display: 'flex',
                gap: '16px',
                marginTop: '8px',
                fontSize: '0.8rem',
                color: '#666',
                flexWrap: 'wrap',
              }}
            >
              <span>
                Vendor:{' '}
                <Link
                  href={`/vendor/${order.vendor.wallet}`}
                  style={{ color: '#c8a1ff', textDecoration: 'none' }}
                >
                  {order.vendor.name || order.vendor.wallet?.slice(0, 8) + '...'}
                </Link>
                {order.vendor.verified && (
                  <FaCheck style={{ color: '#22c55e', marginLeft: '4px', fontSize: '0.65rem' }} />
                )}
              </span>
              <span>Buyer: {isBuyer ? 'You' : order.buyer.wallet}</span>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div
          style={{
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid #1f1f1f',
            background: 'rgba(13,13,13,0.85)',
            backdropFilter: 'blur(20px)',
            marginBottom: '24px',
          }}
        >
          <h2
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: '#fff',
              marginBottom: '20px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            Order Timeline
          </h2>

          <div style={{ position: 'relative', paddingLeft: '36px' }}>
            {/* Vertical line */}
            <div
              style={{
                position: 'absolute',
                left: '14px',
                top: '8px',
                bottom: '8px',
                width: '2px',
                background: 'rgba(200,161,255,0.1)',
              }}
            />

            {order.timeline.map((step, idx) => (
              <motion.div
                key={step.status}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                style={{
                  position: 'relative',
                  marginBottom: '24px',
                  opacity: step.completed ? 1 : 0.4,
                }}
              >
                {/* Dot */}
                <div
                  style={{
                    position: 'absolute',
                    left: '-28px',
                    top: '2px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    background: step.completed
                      ? `${STATUS_COLORS[step.status] || '#c8a1ff'}20`
                      : '#1a1a1a',
                    border: `2px solid ${step.completed ? STATUS_COLORS[step.status] || '#c8a1ff' : '#1f1f1f'}`,
                    color: step.completed ? STATUS_COLORS[step.status] || '#c8a1ff' : '#555',
                    zIndex: 1,
                  }}
                >
                  {step.completed ? STATUS_ICONS[step.status] || <FaCheck /> : idx + 1}
                </div>

                <div>
                  <div
                    style={{
                      color: step.completed ? '#fff' : '#555',
                      fontWeight: 500,
                      fontSize: '0.9rem',
                    }}
                  >
                    {step.label}
                  </div>
                  {step.timestamp && (
                    <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '2px' }}>
                      {new Date(step.timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Shipping Info */}
        {order.shipping && order.shipping.status !== 'pending' && (
          <div
            style={{
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #222',
              background: '#111',
              marginBottom: '24px',
            }}
          >
            <h3
              style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', marginBottom: '12px' }}
            >
              <FaTruck style={{ marginRight: '6px', color: '#f59e0b' }} />
              Shipping Details
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                fontSize: '0.8rem',
              }}
            >
              <div>
                <span style={{ color: '#666' }}>Carrier: </span>
                <span style={{ color: '#fff' }}>{order.shipping.carrier || '—'}</span>
              </div>
              <div>
                <span style={{ color: '#666' }}>Status: </span>
                <span style={{ color: '#f59e0b' }}>{order.shipping.status}</span>
              </div>
              {order.shipping.trackingNumber && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: '#666' }}>Tracking: </span>
                  {order.shipping.trackingUrl ? (
                    <a
                      href={order.shipping.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#c8a1ff' }}
                    >
                      {order.shipping.trackingNumber}
                    </a>
                  ) : (
                    <span style={{ color: '#fff', fontFamily: 'monospace' }}>
                      {order.shipping.trackingNumber}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Delivery Review */}
        {order.delivery && (
          <div
            style={{
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #22c55e30',
              background: '#22c55e08',
              marginBottom: '24px',
            }}
          >
            <h3
              style={{ fontSize: '0.9rem', fontWeight: 600, color: '#22c55e', marginBottom: '8px' }}
            >
              <FaCheck style={{ marginRight: '6px' }} />
              Delivery Confirmed
            </h3>
            {order.delivery.rating && (
              <div style={{ display: 'flex', gap: '2px', marginBottom: '6px' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <FaStar
                    key={star}
                    style={{
                      color: star <= order.delivery!.rating! ? '#fbbf24' : '#333',
                      fontSize: '0.9rem',
                    }}
                  />
                ))}
              </div>
            )}
            {order.delivery.review && (
              <p style={{ color: '#a1a1a1', fontSize: '0.85rem', margin: 0 }}>
                &ldquo;{order.delivery.review}&rdquo;
              </p>
            )}
          </div>
        )}

        {/* Dispute */}
        {order.dispute && (
          <div
            style={{
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #ef444440',
              background: '#ef444408',
              marginBottom: '24px',
            }}
          >
            <h3
              style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ef4444', marginBottom: '8px' }}
            >
              <FaGavel style={{ marginRight: '6px' }} />
              Dispute — {order.dispute.status}
            </h3>
            <p style={{ color: '#a1a1a1', fontSize: '0.85rem', margin: '0 0 6px' }}>
              Reason: {order.dispute.reason?.replace(/_/g, ' ')}
            </p>
            <p style={{ color: '#666', fontSize: '0.75rem', margin: 0 }}>
              Opened {new Date(order.dispute.createdAt).toLocaleDateString()} · SLA deadline:{' '}
              {new Date(order.dispute.slaDeadline).toLocaleDateString()}
            </p>
            {order.dispute.resolution && (
              <p
                style={{ color: '#f59e0b', fontSize: '0.8rem', marginTop: '8px', fontWeight: 500 }}
              >
                Resolution: {order.dispute.resolution.replace(/_/g, ' ')}
              </p>
            )}
          </div>
        )}

        {/* Escrow Info */}
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #1f1f1f',
            background: 'rgba(8,8,10,0.9)',
            backdropFilter: 'blur(12px)',
            fontSize: '0.75rem',
            color: '#555',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span
              style={{ cursor: 'pointer', fontFamily: 'monospace' }}
              onClick={() => {
                navigator.clipboard.writeText(order.escrowPda);
                toast.success('Copied');
              }}
            >
              Escrow: {order.escrowPda?.slice(0, 12)}... <FaCopy style={{ fontSize: '0.6rem' }} />
            </span>
            {order.nftMint && (
              <span style={{ fontFamily: 'monospace' }}>NFT: {order.nftMint?.slice(0, 12)}...</span>
            )}
            {order.squads?.executed && (
              <span style={{ color: '#22c55e' }}>
                Multisig executed <FaCheck />
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
