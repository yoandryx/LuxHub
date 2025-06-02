// /api/nft/checkSaleRequest.ts
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import SaleRequestModel from "../../../lib/models/SaleRequest";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  const { nftId } = req.query;
  if (!nftId || typeof nftId !== "string") return res.status(400).json({ message: "Invalid nftId" });

  await dbConnect();

  const existing = await SaleRequestModel.findOne({ nftId });
  return res.status(200).json({ exists: !!existing });
}
