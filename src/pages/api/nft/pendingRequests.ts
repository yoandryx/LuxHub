// src/pages/api/nft/pendingRequests.ts
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import SaleRequestModel from "../../../lib/models/SaleRequest";

// Define the interface for type-checking (optional).
export interface SaleRequest {
  nftId: string;
  seller: string;
  seed: number;
  initializerAmount: number;
  takerAmount: number;
  fileCid: string;
  salePrice: number;
  ipfs_pin_hash?: string;
  timestamp: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SaleRequest[]>
) {
  if (req.method !== "GET") {
    res.status(405).json([]);
    return;
  }
  try {
    // Connect to MongoDB.
    await dbConnect();

    // Retrieve sale request documents.
    const docs = await SaleRequestModel.find({}).lean();

    // Map documents to the SaleRequest interface, discarding extra Mongoose fields.
    const saleRequests: SaleRequest[] = docs.map((doc) => ({
      nftId: doc.nftId,
      seller: doc.seller,
      seed: Number(doc.seed),
      initializerAmount: doc.initializerAmount,
      takerAmount: doc.takerAmount,
      fileCid: doc.fileCid,
      salePrice: doc.salePrice,
      ipfs_pin_hash: doc.ipfs_pin_hash,
      timestamp: doc.timestamp,
    }));

    res.status(200).json(saleRequests);
  } catch (error) {
    console.error("Error fetching pending sale requests:", error);
    res.status(500).json([]);
  }
}
