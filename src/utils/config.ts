import { PinataSDK } from 'pinata'; // Correct import

// Initialize Pinata SDK with JWT and Gateway URL
export const pinata = new PinataSDK({
  pinataJwt: `${process.env.PINATA_JWT}`,  // Authentication with Pinata JWT
  pinataGateway: `${process.env.NEXT_PUBLIC_GATEWAY_URL}`
});
