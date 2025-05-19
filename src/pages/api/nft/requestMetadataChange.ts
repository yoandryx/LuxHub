// src/pages/api/nft/requestMetadataChange.ts
import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import mongoose from "mongoose";

// 1. Define schema
const MetadataChangeRequestSchema = new mongoose.Schema({
  mintAddress: { type: String, required: true },
  seller: { type: String, default: "unknown" },
  requestedChanges: {
    title: String,
    description: String,
    priceSol: String,
  },
  status: { type: String, default: "pending" },
  timestamp: { type: Number, default: Date.now },
}, { timestamps: true });

// 2. Model reuse logic
const MetadataChangeRequest = mongoose.models.MetadataChangeRequest ||
  mongoose.model("MetadataChangeRequest", MetadataChangeRequestSchema);

// 3. API handler
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Only POST allowed" });
  }

  try {
    await dbConnect();

    const { mintAddress, requestedChanges, status, timestamp, seller } = req.body;

    if (!mintAddress || !requestedChanges) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const newRequest = new MetadataChangeRequest({
      mintAddress,
      seller: seller || "unknown",
      requestedChanges,
      status: status || "pending",
      timestamp: timestamp || Date.now(),
    });

    await newRequest.save();

    res.status(200).json({ message: "Metadata change request submitted." });
  } catch (error) {
    console.error("[requestMetadataChange] Error:", error);
    res.status(500).json({ message: "Server error submitting metadata change." });
  }
}
