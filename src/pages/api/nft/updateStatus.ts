// src/pages/api/nft/updateStatus.ts
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import SaleRequestModel from "../../../lib/models/SaleRequest";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mintAddress, marketStatus } = req.body;

  if (!mintAddress || !marketStatus) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    await dbConnect();
    const result = await SaleRequestModel.updateOne(
      { nftId: mintAddress },
      { $set: { marketStatus } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "No matching sale request found" });
    }

    res.status(200).json({ message: "Market status updated" });
  } catch (e: any) {
    console.error("Error updating market status:", e);
    res.status(500).json({ error: e.message });
  }
}