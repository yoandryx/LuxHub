// next.config.js (ES Modules)

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const nextConfig = {
  reactStrictMode: true,
  env: {
    // PUBLIC variables (safe for client-side)
    NEXT_PUBLIC_SOLANA_ENDPOINT: process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
    PROGRAM_ID: process.env.PROGRAM_ID,
    NEXT_PUBLIC_PINATA_API_KEY: process.env.PINATA_API_KEY,
    NEXT_PUBLIC_GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL || "https://teal-working-frog-718.mypinata.cloud/ipfs/",
    NEXT_PUBLIC_LUXHUB_WALLET: process.env.NEXT_PUBLIC_LUXHUB_WALLET,
    // NOTE: STRIPE_SECRET_KEY, DEVNET_KEYPAIR, and PINATA_SECRET_KEY
    // are accessed server-side only via process.env in API routes.
    // Do NOT add them here — the env block exposes values to the client bundle.
  },
  // Image optimization configuration for Irys/IPFS gateways
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'gateway.irys.xyz',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'arweave.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'teal-working-frog-718.mypinata.cloud',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: '*.mypinata.cloud',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: 'ipfs.io',
        pathname: '/ipfs/**',
      },
    ],
    // Enable unoptimized for external URLs that may vary
    unoptimized: false,
  },
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        dns: false,
        net: false,
        fs: false,
        crypto: require.resolve("crypto-browserify"), // ✅ fixed
      };
    }
    // console.log("MONGODB_URI:", process.env.MONGODB_URI);
    config.externals = config.externals || {};
    config.externals['@solana/kit'] = 'commonjs @solana/kit';
    config.externals['@solana-program/memo'] = 'commonjs @solana-program/memo';
    config.externals['@solana-program/system'] = 'commonjs @solana-program/system';
    config.externals['@solana-program/token'] = 'commonjs @solana-program/token';
    return config;
  },
};

export default nextConfig;
