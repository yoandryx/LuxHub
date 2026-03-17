// src/pages/nft/[mint].tsx
// Public NFT detail page — uses the same NftDetailCard as the rest of the app
// Linked from external_url in NFT metadata, shareable by vendors and buyers
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { NftDetailCard } from '../../components/marketplace/NftDetailCard';

const NftPage: React.FC = () => {
  const router = useRouter();
  const { mint } = router.query;
  const [ogData, setOgData] = useState<{ name: string; image: string; description: string } | null>(
    null
  );

  // Fetch basic metadata for OG tags (SEO / social sharing)
  useEffect(() => {
    if (!mint || typeof mint !== 'string') return;
    fetch(`/api/nft/${mint}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.name) {
          setOgData({
            name: data.name,
            image: data.image || '',
            description: data.description || '',
          });
        }
      })
      .catch(() => {});
  }, [mint]);

  if (!mint || typeof mint !== 'string') {
    return (
      <div style={styles.page}>
        <div style={styles.empty}>Loading...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{ogData?.name || 'NFT Detail'} | LuxHub</title>
        <meta
          name="description"
          content={ogData?.description || 'Verified luxury asset on LuxHub'}
        />
        {ogData?.image && <meta property="og:image" content={ogData.image} />}
        <meta property="og:title" content={ogData?.name || 'LuxHub NFT'} />
        <meta property="og:type" content="website" />
      </Head>

      <div style={styles.page}>
        <div style={styles.cardWrapper}>
          <NftDetailCard
            mintAddress={mint}
            acceptingOffers={true}
            onBuy={() => router.push(`/marketplace?pay=${mint}`)}
            onOffer={() => router.push(`/marketplace?offer=${mint}`)}
            onClose={() => router.push('/marketplace')}
          />
        </div>
      </div>
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#050507',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 24px 60px',
  },
  cardWrapper: {
    width: '100%',
    maxWidth: '520px',
  },
  empty: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: '0.9rem',
  },
};

export default NftPage;
