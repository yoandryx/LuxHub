// pages/api/nft/pendingRequests.ts
import type { NextApiRequest, NextApiResponse } from "next";

// Retrieve pending sale requests from the in-memory store.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // globalThis.saleRequests was set in requestSale.ts
  const saleRequests = globalThis.saleRequests || [];
  res.status(200).json(saleRequests);
}
