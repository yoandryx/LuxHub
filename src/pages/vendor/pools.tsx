// src/pages/vendor/pools.tsx
// Vendor pool management page — shows vendor's pools with status, volume, and actions
import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import { FiArrowLeft, FiLoader } from 'react-icons/fi';
import dynamic from 'next/dynamic';

const PoolManagement = dynamic(
  () => import('../../components/pool/PoolManagement').then((m) => ({ default: m.PoolManagement })),
  { ssr: false }
);

export default function VendorPoolsPage() {
  const { publicKey, connected } = useEffectiveWallet();
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPools = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pool/list?vendorWallet=${publicKey.toBase58()}`);
      if (res.ok) {
        const data = await res.json();
        setPools(data.pools || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  if (!connected) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0d0d0d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#a1a1a1',
        fontSize: '14px',
      }}>
        Please connect your wallet to view your pools.
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>My Pools | LuxHub</title>
      </Head>
      <div style={{
        minHeight: '100vh',
        background: '#0d0d0d',
        padding: '80px 24px 48px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <div style={{ marginBottom: '24px' }}>
          <Link
            href="/sellerDashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#a1a1a1',
              fontSize: '13px',
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
          >
            <FiArrowLeft /> Back to Dashboard
          </Link>
        </div>

        {loading ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '64px',
            color: '#a1a1a1',
            gap: '10px',
          }}>
            <FiLoader style={{ animation: 'spin 1s linear infinite' }} />
            Loading pools...
          </div>
        ) : (
          <PoolManagement
            pools={pools}
            isAdmin={false}
            onRefresh={fetchPools}
          />
        )}
      </div>
    </>
  );
}
