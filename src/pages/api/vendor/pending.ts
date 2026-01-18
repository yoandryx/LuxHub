import type { LeanDocument } from "../../../types/mongoose";
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import VendorProfileModel from "../../../lib/models/VendorProfile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  try {
    await dbConnect();
    const vendors = await VendorProfileModel.find({ approved: false }).lean();
    res.status(200).json({ vendors });
  } catch (err) {
    console.error("[pendingVendors] Error:", err);
    res.status(500).json({ error: "Failed to fetch pending vendors" });
  }
}
