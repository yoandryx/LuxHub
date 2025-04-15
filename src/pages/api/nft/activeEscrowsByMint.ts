import type { NextApiRequest, NextApiResponse } from "next";
import connectToDatabase from "../../../lib/database/mongodb"; // your mongo util

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
  ) {
    try {
      const db = await connectToDatabase();
      const active = await db
        .collection("salerequests")
        .find({ marketStatus: "In Escrow" }) 
        .toArray();
  
      res.status(200).json(active);
    } catch (err) {
      console.error("Mongo fetch failed:", err);
      res.status(500).json({ error: "Failed to fetch active escrows." });
    }
  }