// /pages/api/profile.ts
import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../lib/mongodb";
import User from "../../models/User";
import Listing from "../../models/listings";
import { verifyToken } from "../../lib/token";
import { JwtPayload } from "jsonwebtoken";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("No or invalid auth header");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token) as JwtPayload | null;

  if (!decoded) {
    console.log("Token verification failed");
    return res.status(401).json({ error: "Invalid token" });
  }

  // For example, if your login sets { userId: user._id, role: user.role }
  // then read `decoded.userId`. If you used { id: user._id, role: user.role },
  // read `decoded.id`.
  const userId = decoded.userId;
  console.log("Decoded token payload:", decoded);

  if (!userId) {
    console.log("No userId in token");
    return res.status(401).json({ error: "No userId in token" });
  }

  await dbConnect();

  const user = await User.findById(userId);
  console.log("Fetched user from DB:", user);

  if (!user) {
    console.log("User not found in DB for ID:", userId);
    return res.status(404).json({ error: "User not found" });
  }

  // If we get here, user was found
  const listings = await Listing.find({ owner: userId });
  console.log("Fetched listings for user:", listings);

  return res.status(200).json({ user, listings });
}
