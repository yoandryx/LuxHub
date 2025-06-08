// src/pages/api/nft/updateBuyer.ts
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import SaleRequestModel from "../../../lib/models/SaleRequest";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { buyer, mintAddress, vaultAta, priceSol } = req.body;

  console.log("📝 Incoming buyer update:", req.body);

  if (!buyer || !mintAddress || !vaultAta || !priceSol) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    await dbConnect();

    const result = await SaleRequestModel.updateOne(
      { nftId: mintAddress },
      {
        $set: {
          buyer,
          vaultAta,
          salePrice: priceSol,
          marketStatus: "In Escrow",
          updatedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "No matching sale request found for this NFT" });
    }

    res.status(200).json({ message: "Buyer updated successfully" });
  } catch (e: any) {
    console.error("❌ Error updating buyer:", e);
    res.status(500).json({ error: e.message });
  }
}
