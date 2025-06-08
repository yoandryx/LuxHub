import type { NextApiRequest, NextApiResponse } from "next";
import {
  getCachedNFTs,
  setCachedNFTs,
  getCachedTotalCount,
  setCachedTotalCount,
} from "../../../lib/database/cache";

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_API_SECRET = process.env.PINATA_API_SECRET_KEY;
const PAGE_LIMIT = 100;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!PINATA_API_KEY || !PINATA_API_SECRET) {
    return res.status(500).json({ error: "Pinata API credentials are not set." });
  }

  try {
    const metaResponse = await fetch(
      `https://api.pinata.cloud/data/pinList?status=pinned&pageLimit=1`,
      {
        headers: {
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_API_SECRET,
        },
      }
    );

    if (!metaResponse.ok) {
      const errorText = await metaResponse.text();
      throw new Error(`Pinata error: ${metaResponse.status} ${errorText}`);
    }

    const metaData = await metaResponse.json();
    const totalCount = metaData?.count || 0;
    const cachedCount = await getCachedTotalCount();
    const cachedNFTs = await getCachedNFTs();

    if (cachedNFTs && cachedCount === totalCount) {
      console.log("⚡ Serving NFTs from Edge Config (no change in count)");
      return res.status(200).json(cachedNFTs);
    }

    let allRows: any[] = [];
    let pageOffset = 0;

    while (true) {
      const response = await fetch(
        `https://api.pinata.cloud/data/pinList?status=pinned&pageLimit=${PAGE_LIMIT}&pageOffset=${pageOffset}`,
        {
          headers: {
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_API_SECRET,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pinata error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const rows = data?.rows || [];
      allRows.push(...rows);

      if (rows.length < PAGE_LIMIT) break;
      pageOffset += PAGE_LIMIT;
    }

    await setCachedNFTs(allRows);
    await setCachedTotalCount(totalCount);

    console.log("✅ Updated Edge Config cache with fresh NFTs");
    return res.status(200).json(allRows);
  } catch (error) {
    console.error("❌ Failed to fetch from Pinata:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: "Failed to fetch from Pinata", details: errorMessage });
  }
}
