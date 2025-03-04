import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../lib/mongodb";
import User from "../../models/User";
import Listing from "../../models/listings";
import { verifyToken } from "../../lib/token";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { authorization } = req.headers;
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authorization.split(" ")[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });

  await dbConnect();
  
  const user = await User.findById(decoded.userId).select("email role");
  const listings = await Listing.find({ owner: decoded.userId });

  res.status(200).json({ user, listings });
}

