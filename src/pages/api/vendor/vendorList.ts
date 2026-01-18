import type { LeanDocument } from "../../../types/mongoose";
// GET approved vendors
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import VendorProfileModel from "../../../lib/models/VendorProfile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await dbConnect();
    const vendors = await VendorProfileModel.find({ approved: true }).lean();
    const verifiedVendors = await VendorProfileModel.find({ verified: true }).lean();
    res.status(200).json({ vendors, verifiedVendors });
  } catch (err) {
    console.error("Error fetching vendors:", err);
    res.status(500).json({ error: "Failed to fetch vendors." });
  }
}
