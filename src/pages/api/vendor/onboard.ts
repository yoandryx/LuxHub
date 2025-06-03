// File: /pages/api/vendor/onboard.ts
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import VendorProfileModel from "../../../lib/models/VendorProfile";
import InviteCodeModel from "../../../lib/models/InviteCode";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    wallet,
    name,
    username,
    bio,
    avatarUrl,
    bannerUrl,
    instagram,
    twitter,
    website,
    inviteCode,
  } = req.body;

  if (!wallet || !name || !username || !inviteCode || !avatarUrl || !bannerUrl) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await dbConnect();

    const invite = await InviteCodeModel.findOne({ code: inviteCode });

    if (!invite || invite.used) {
      return res.status(403).json({ error: "Invalid or already used invite code" });
    }

    if (invite.vendorWallet !== wallet) {
      return res.status(403).json({ error: "Wallet does not match invite" });
    }

    await VendorProfileModel.create({
      wallet,
      name,
      username,
      bio,
      avatarUrl,
      bannerUrl,
      socialLinks: {
        instagram,
        twitter,
        website,
      },
      approved: false,
      verified: false,
      inventory: [],
    });

    invite.used = true;
    await invite.save();

    return res.status(200).json({ message: "Vendor profile submitted for approval" });
  } catch (err) {
    console.error("Onboard error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
