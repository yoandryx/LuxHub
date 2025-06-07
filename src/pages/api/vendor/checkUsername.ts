import dbConnect from "../../../lib/database/mongodb";
import VendorProfile from "../../../lib/models/VendorProfile";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  await dbConnect();

  const { username } = req.body;

  if (!username || typeof username !== "string") {
    return res.status(400).json({ available: false, error: "Invalid username." });
  }

  const exists = await VendorProfile.findOne({ username: username.trim() });

  res.status(200).json({ available: !exists });
}
