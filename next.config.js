// next.config.js (CommonJS)
import cryptoBrowserify from "crypto-browserify";

export const reactStrictMode = true;
export const env = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  NEXT_PUBLIC_SOLANA_ENDPOINT: process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
  DEVNET_KEYPAIR: process.env.DEVNET_KEYPAIR,
  PROGRAM_ID: process.env.PROGRAM_ID,
  NEXT_PUBLIC_PINATA_API_KEY: process.env.PINATA_API_KEY,
  NEXT_PUBLIC_PINATA_SECRET_KEY: process.env.PINATA_API_SECRET_KEY,
  NEXT_PUBLIC_GATEWAY_URL: "https://orange-petite-wolf-341.mypinata.cloud/ipfs/"
};
export function webpack(config, { isServer }) {
  if (!isServer) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      dns: false,
      net: false,
      fs: false,
      crypto: cryptoBrowserify,
    };
  }
  console.log("MONGODB_URI:", process.env.MONGODB_URI);
  return config;
}
