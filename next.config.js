module.exports = {
  reactStrictMode: true,
  env: {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    NEXT_PUBLIC_SOLANA_ENDPOINT: process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
    DEVNET_KEYPAIR: process.env.DEVNET_KEYPAIR,
    PROGRAM_ID: process.env.PROGRAM_ID,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Provide empty fallbacks for Node.js modules that are not available in the browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        dns: false,
        net: false,
        fs: false,
      };
    }
    return config;
  },
};

console.log("MONGODB_URI:", process.env.MONGODB_URI);
