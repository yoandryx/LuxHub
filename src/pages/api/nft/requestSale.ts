// src/pages/api/nft/requestSale.ts
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import SaleRequestModel from "../../../lib/models/SaleRequest";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end(); // Method not allowed
    return;
  }

  // Destructure required fields from the request body.
  const { 
    nftId, 
    ipfs_pin_hash, 
    seller, 
    seed,
    initializerAmount, 
    takerAmount, 
    fileCid, 
    salePrice 
  } = req.body;

  if (
    !nftId ||
    !ipfs_pin_hash ||
    !seller ||
    seed === undefined ||
    initializerAmount === undefined ||
    takerAmount === undefined ||
    !fileCid ||
    salePrice === undefined
  ) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    // Connect to MongoDB.
    await dbConnect();

    // Create and save the new sale request.
    await SaleRequestModel.create({
      nftId,
      ipfs_pin_hash,
      seller,
      seed,
      initializerAmount,
      takerAmount,
      fileCid,
      salePrice,
      timestamp: Date.now(),
    });

    res.status(200).json({ message: "Sale request received" });
  } catch (error) {
    console.error("Error processing sale request:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
