// Redirect /my-orders → /orders
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function MyOrdersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/orders');
  }, [router]);
  return null;
}
