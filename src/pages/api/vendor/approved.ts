// /api/vendor/approved.ts
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import VendorProfile from "../../../lib/models/VendorProfile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await dbConnect();
    const vendors = await VendorProfile.find({ approved: true });
    res.status(200).json({ vendors });
  } catch (err) {
    console.error("Fetch approved vendors failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
