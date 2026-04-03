// src/pages/pool/[id].tsx
// Redirect from old /pool/[id] URL to new /pools/[id] dedicated page
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function PoolRedirect() {
  const router = useRouter();
  const { id } = router.query;

  useEffect(() => {
    if (id) {
      router.replace(`/pools/${id}`);
    }
  }, [id, router]);

  return null;
}
