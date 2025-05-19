// /pages/api/nft/markRequestRejected.ts
import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import mongoose from "mongoose";

const MetadataChangeRequest =
  mongoose.models.MetadataChangeRequest ||
  mongoose.model("MetadataChangeRequest", new mongoose.Schema({}, { strict: false }));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ message: "Only POST allowed" });

  await dbConnect();

  const { id } = req.body;
  if (!id) return res.status(400).json({ message: "Missing ID" });

  await MetadataChangeRequest.findByIdAndUpdate(id, { status: "rejected" });

  res.status(200).json({ message: "Marked as rejected" });
}
