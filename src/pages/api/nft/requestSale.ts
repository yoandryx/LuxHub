import type { NextApiRequest, NextApiResponse } from "next";

// Extend globalThis to include custom properties
declare global {
  var saleRequests: { nftId: string; ipfs_pin_hash: string; timestamp: number }[] | undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end(); // Method not allowed
    return;
  }

  const { nftId, ipfs_pin_hash } = req.body;
  if (!nftId || !ipfs_pin_hash) {
    res.status(400).json({ error: "Missing nftId or ipfs_pin_hash" });
    return;
  }

  globalThis.saleRequests = globalThis.saleRequests || [];
  globalThis.saleRequests.push({ nftId, ipfs_pin_hash, timestamp: Date.now() });
  res.status(200).json({ message: "Sale request received" });
}
