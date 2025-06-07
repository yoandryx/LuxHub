import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import VendorProfile from "../../../lib/models/VendorProfile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await dbConnect();
    const { wallet, verified } = req.body;

    if (!wallet || typeof verified !== "boolean") {
      return res.status(400).json({ error: "Missing wallet or verification flag" });
    }

    const vendor = await VendorProfile.findOne({ wallet });
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    vendor.verified = verified;
    await vendor.save();

    res.status(200).json({ message: "Verification updated", verified });
  } catch (err) {
    console.error("[verifyVendor] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
