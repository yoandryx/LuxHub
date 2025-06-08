// /pages/api/nft/getMetadataChangeRequests.ts
import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import mongoose from "mongoose";

const MetadataChangeRequestSchema = new mongoose.Schema({
  mintAddress: String,
  seller: String,
  requestedChanges: mongoose.Schema.Types.Mixed,
  status: { type: String, default: "pending" },
  timestamp: Number,
}, { timestamps: true });

const MetadataChangeRequest = mongoose.models.MetadataChangeRequest || mongoose.model("MetadataChangeRequest", MetadataChangeRequestSchema);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await dbConnect();
    const requests = await MetadataChangeRequest.find().sort({ createdAt: -1 });
    res.status(200).json({ requests });
  } catch (error) {
    console.error("[getMetadataChangeRequests] Error:", error);
    res.status(500).json({ message: "Server error fetching requests." });
  }
}
