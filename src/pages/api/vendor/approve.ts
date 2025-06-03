import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import VendorProfileModel from "../../../lib/models/VendorProfile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { wallet } = req.body;

  if (!wallet) {
    return res.status(400).json({ error: "Wallet address is required." });
  }

  try {
    await dbConnect();

    const updated = await VendorProfileModel.findOneAndUpdate(
      { wallet },
      { approved: true },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Vendor not found." });
    }

    return res.status(200).json({ message: "Vendor approved successfully." });
  } catch (error) {
    console.error("Error approving vendor:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
}
