// /pages/api/pinata/nft/[mintAddress].ts

import type { NextApiRequest, NextApiResponse } from "next";
import { Metaplex } from "@metaplex-foundation/js";
import { Connection, PublicKey } from "@solana/web3.js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { mintAddress } = req.query;

  if (!mintAddress || typeof mintAddress !== "string") {
    return res.status(400).json({ error: "Invalid mint address" });
  }

  try {
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.devnet.solana.com");
    const metaplex = Metaplex.make(connection);
    const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mintAddress) });

    const metadataUri = nft.uri;
    const metadataRes = await fetch(metadataUri);

    if (!metadataRes.ok) throw new Error("Failed to fetch metadata from URI");
    const metadataJson = await metadataRes.json();

    return res.status(200).json(metadataJson);
  } catch (error) {
    console.error("❌ Error fetching NFT metadata:", error);
    return res.status(500).json({ error: "Failed to fetch metadata" });
  }
}
