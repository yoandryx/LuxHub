module.exports = {
    reactStrictMode: true,
    env: {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      NEXT_PUBLIC_SOLANA_ENDPOINT: process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
      DEVNET_KEYPAIR: process.env.DEVNET_KEYPAIR
    },
  };

  // next.config.js
console.log("MONGODB_URI:", process.env.MONGODB_URI);

  