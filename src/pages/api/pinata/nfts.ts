// pages/api/pinata/nfts.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const PINATA_API_KEY = process.env.PINATA_API_KEY;
  const PINATA_API_SECRET = process.env.PINATA_API_SECRET_KEY;

  if (!PINATA_API_KEY || !PINATA_API_SECRET) {
    res.status(500).json({ error: "Pinata API credentials are not set." });
    return;
  }

  try {
    // Query Pinata's pinList endpoint to get pinned files
    const response = await fetch("https://api.pinata.cloud/data/pinList?status=pinned", {
      headers: {
        "pinata_api_key": PINATA_API_KEY,
        "pinata_secret_api_key": PINATA_API_SECRET,
      },
    });
    const data = await response.json();
    // For this example, we assume each file contains a "ipfs_pin_hash" field.
    // You can adjust this according to the actual shape of the data.
    res.status(200).json(data.rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch from Pinata", details: error });
  }
}
