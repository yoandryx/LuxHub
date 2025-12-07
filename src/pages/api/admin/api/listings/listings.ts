import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../../../lib/database/mongodb";
import Listing from "../../../../../lib/database/listings";
import { verifyToken } from "../../../../../lib/auth/token";
import { JwtPayload } from "jsonwebtoken";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  if (req.method === "GET") {
    const { authorization } = req.headers;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authorization.split(" ")[1];
    const decoded = verifyToken(token);

    if (!decoded || (decoded as JwtPayload).role !== "admin") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const listings = await Listing.find({ approved: false });
      res.status(200).json(listings);
    } catch (error) {
      res.status(500).json({ error: "Server error", details: error });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
