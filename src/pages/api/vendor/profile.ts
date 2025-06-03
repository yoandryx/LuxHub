// /pages/api/vendor/profile.ts
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import VendorProfileModel from "../../../lib/models/VendorProfile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { wallet } = req.query;
  if (!wallet || typeof wallet !== "string") {
    return res.status(400).json({ error: "Missing or invalid wallet address" });
  }

  try {
    await dbConnect();
    const profile = await VendorProfileModel.findOne({ wallet }).lean();
    if (!profile) return res.status(404).json({ error: "Vendor not found" });

    res.status(200).json(profile);
  } catch (err) {
    console.error("[vendor/profile] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
