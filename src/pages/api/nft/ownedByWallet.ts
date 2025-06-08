// /src/pages/api/nft/ownedByWallet.ts
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import SaleRequestModel from "../../../lib/models/SaleRequest";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { wallet } = req.query;

  if (!wallet || typeof wallet !== "string") {
    return res.status(400).json({ error: "Wallet missing or invalid" });
  }

  try {
    await dbConnect();
    const owned = await SaleRequestModel.find({
      buyer: wallet,
      marketStatus: "Holding",
    }).lean();

    res.status(200).json(owned);
  } catch (e: any) {
    console.error("[ownedByWallet] DB query error:", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
