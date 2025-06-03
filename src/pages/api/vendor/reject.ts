import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import VendorProfileModel from "../../../lib/models/VendorProfile";
import InviteCodeModel from "../../../lib/models/InviteCode";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await dbConnect();
    const { wallet } = req.body;

    if (typeof wallet !== "string" || !wallet.trim()) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const vendor = await VendorProfileModel.findOne({ wallet });
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    // Delete vendor and invite codes
    await VendorProfileModel.deleteOne({ wallet });
    await InviteCodeModel.deleteMany({ vendorWallet: wallet });

    return res.status(200).json({ message: "Vendor rejected and removed from MongoDB." });
  } catch (err) {
    console.error("[rejectVendor] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
