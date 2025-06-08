// File: /pages/api/vendor/generateInvite.ts
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import InviteCodeModel from "../../../lib/models/InviteCode";
import { v4 as uuidv4 } from "uuid";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { vendorWallet, expiresAt, adminWallet } = req.body;

  if (!vendorWallet || !adminWallet) {
    return res.status(400).json({ error: "Missing vendor or admin wallet" });
  }

  try {
    await dbConnect();

    const code = uuidv4();

    await InviteCodeModel.create({
      code,
      vendorWallet,
      createdBy: adminWallet,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    return res.status(200).json({ code });
  } catch (err) {
    console.error("Generate Invite Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}