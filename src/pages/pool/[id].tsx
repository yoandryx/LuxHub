// src/pages/pool/[id].tsx
// Pool detail page hidden pre-launch — server-side redirect to /marketplace
export default function PoolRedirect() {
  return null;
}

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/marketplace',
      permanent: false,
    },
  };
}
