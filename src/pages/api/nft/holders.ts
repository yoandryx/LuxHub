import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import SaleRequestModel from "../../../lib/models/SaleRequest";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await dbConnect();
    const holders = await SaleRequestModel.find({
      marketStatus: { $in: ["Holding", "Holding LuxHub"] }, // only NFTs currently held by buyers
    }).lean();

    res.status(200).json(holders);
  } catch (e: any) {
    console.error("[holders] DB query error:", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
