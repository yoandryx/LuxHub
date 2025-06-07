import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import VendorProfileModel from "../../../lib/models/VendorProfile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  try {
    await dbConnect();

    const { wallet, username, name, bio, socialLinks, avatarUrl, bannerUrl } = req.body;

    if (!wallet) return res.status(400).json({ error: "Missing wallet address" });

    const profile = await VendorProfileModel.findOne({ wallet });

    if (!profile) return res.status(404).json({ error: "Vendor profile not found" });

    if (profile.approved && username !== profile.username) {
      return res.status(403).json({ error: "Username is locked after approval." });
    }

    profile.name = name || profile.name;
    profile.bio = bio || profile.bio;
    profile.avatarUrl = avatarUrl || profile.avatarUrl;
    profile.bannerUrl = bannerUrl || profile.bannerUrl;
    const defaultLinks = { instagram: "", x: "", website: "" };
    profile.socialLinks = { ...defaultLinks, ...profile.socialLinks, ...socialLinks };


    if (!profile.approved && username) {
      profile.username = username;
    }

    await profile.save();
    return res.status(200).json({ message: "Profile updated successfully", profile });
  } catch (err) {
    console.error("[updateProfile] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
