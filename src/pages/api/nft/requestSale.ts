import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import SaleRequestModel from "../../../lib/models/SaleRequest";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end(); // Method not allowed
    return;
  }

  const {
    nftId,
    ipfs_pin_hash,
    seller,
    seed,
    initializerAmount,
    takerAmount,
    fileCid,
    salePrice,
    buyer // ⬅️ Optional
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
    await dbConnect();

    const requestDoc: any = {
      nftId,
      ipfs_pin_hash,
      seller,
      seed,
      initializerAmount,
      takerAmount,
      fileCid,
      salePrice,
      timestamp: Date.now(),
      marketStatus: "pending",
    };

    if (buyer) {
      requestDoc.buyer = buyer;
    }

    await SaleRequestModel.create(requestDoc);

    res.status(200).json({ message: "Sale request received" });
  } catch (error) {
    console.error("Error processing sale request:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
