// /pages/api/users/sol-price.ts

import type { NextApiRequest, NextApiResponse } from "next";

type Data = {
  price: number;
} | {
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  try {
    const result = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");

    if (!result.ok) {
      throw new Error("CoinGecko API response not OK");
    }

    const data = await result.json();
    const solPrice = data?.solana?.usd;

    if (typeof solPrice !== "number") {
      throw new Error("Unexpected CoinGecko response structure");
    }

    res.status(200).json({ price: solPrice });
  } catch (err) {
    console.error("SOL Price Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch SOL price" });
  }
}
