import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/mongodb";
import Listing from "../../../models/listings";
import { verifyToken } from "../../../lib/token";
import { JwtPayload } from "jsonwebtoken";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token) as JwtPayload | null;
  if (!decoded) {
    return res.status(401).json({ error: "Invalid token" });
  }

  // Use the same key as used when signing the token
  const userId = decoded.userId || decoded.id;
  if (!userId) {
    return res.status(401).json({ error: "Token does not contain userId" });
  }

  await dbConnect();

  try {
    const listings = await Listing.find({ owner: userId });
    return res.status(200).json(listings);
  } catch (error: any) {
    console.error("Error fetching listings:", error);
    return res.status(500).json({ error: "Server error", details: error.message });
  }
}
