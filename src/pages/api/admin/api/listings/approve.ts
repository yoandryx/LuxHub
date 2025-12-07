import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../../../lib/database/mongodb";
import Listing from "../../../../../lib/database/listings";
import { verifyToken } from "../../../../../lib/auth/token";
import { JwtPayload } from "jsonwebtoken";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    const { authorization } = req.headers;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authorization.split(" ")[1];
    const decoded = verifyToken(token);

    if (!decoded || (decoded as JwtPayload).role !== "admin") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { listingId, approved } = req.body;

    if (!listingId || typeof approved !== "boolean") {
      return res.status(400).json({ error: "Invalid request body" });
    }

    await dbConnect();

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    listing.approved = approved;
    await listing.save();

    res.status(200).json({ message: "Listing status updated", listing });
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
