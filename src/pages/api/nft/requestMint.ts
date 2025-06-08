// /pages/api/nft/requestMint.ts
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import MintRequest from "../../../lib/models/MintRequest";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    title, description, brand, serialNumber, imageBase64, wallet, timestamp,
    priceSol, model, material, productionYear, limitedEdition,
    certificate, warrantyInfo, provenance, movement,
    caseSize, waterResistance, dialColor, country,
    releaseDate, boxPapers, condition, features
  } = req.body;

  if (!wallet || !title || !imageBase64 || !timestamp) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await dbConnect();

    await MintRequest.create({
      title, description, brand, serialNumber, imageBase64, wallet, timestamp,
      priceSol, model, material, productionYear, limitedEdition,
      certificate, warrantyInfo, provenance, movement,
      caseSize, waterResistance, dialColor, country,
      releaseDate, boxPapers, condition, features,
      status: "pending"
    });

    return res.status(200).json({ message: "Mint request submitted" });
  } catch (error) {
    console.error("Mint request error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
