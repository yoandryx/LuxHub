// pages/api/vendor/onboard-b-api.ts
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import VendorProfileModel from "../../../lib/models/VendorProfile";
import InviteCodeModel from "../../../lib/models/InviteCode";
import { z } from "zod";

const onboardSchema = z.object({
  wallet: z.string().min(1),
  name: z.string().min(1),
  username: z.string().min(1),
  bio: z.string().optional(),
  avatarUrl: z.string().url(),
  bannerUrl: z.string().url(),
  inviteCode: z.string().min(1),
  socialLinks: z.object({
    instagram: z.string().optional(),
    x: z.string().optional(),
    website: z.string().url().optional(),
  }).optional(),
  multisigPda: z.string().optional(),
});

function formatSocialLinks(instagram?: string, x?: string, website?: string) {
  const clean = (h: string) => h.replace(/^@/, "").trim();
  return {
    instagram: instagram ? `https://instagram.com/${clean(instagram)}` : "",
    x: x ? `https://x.com/${clean(x)}` : "",
    website: website || "",
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body;
    console.log("API RECEIVED:", body); // DEBUG

    const parsed = onboardSchema.parse(body);

    await dbConnect();

    const existing = await VendorProfileModel.findOne({ username: parsed.username });
    if (existing) return res.status(400).json({ error: "Username taken" });

    const invite = await InviteCodeModel.findOne({ code: parsed.inviteCode });
    if (!invite || invite.used || invite.vendorWallet !== parsed.wallet) {
      return res.status(403).json({ error: "Invalid invite" });
    }

    await VendorProfileModel.create({
      ...parsed,
      socialLinks: formatSocialLinks(
        parsed.socialLinks?.instagram,
        parsed.socialLinks?.x,
        parsed.socialLinks?.website
      ),
      multisigPda: parsed.multisigPda || null,
      approved: false,
      verified: false,
      inventory: [],
    });

    invite.used = true;
    await invite.save();

    return res.status(200).json({ message: "Submitted!" });
  } catch (err: any) {
    console.error("API ERROR:", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid data", details: err.errors });
    }
    return res.status(500).json({ error: "Server error" });
  }
}