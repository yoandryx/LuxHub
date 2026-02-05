// src/pages/api/auth/nonce.ts
// API endpoint for getting a nonce for wallet signature authentication
import { handleNonceRequest } from '../../../lib/middleware/walletAuth';

export default handleNonceRequest;
