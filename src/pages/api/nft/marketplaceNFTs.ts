// app/api/marketplace/nfts/route.ts (App Router) or pages/api/...
import dbConnect from "../../../lib/database/mongodb";
import { MarketplaceNFT } from "../../../lib/models/marketplaceNFTs";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await dbConnect();

    const nfts = await MarketplaceNFT.find({
      marketStatus: { $in: ["active", "Holding LuxHub"] },
    })
      .sort({ updatedAt: -1 })
      .lean(); // Faster, returns plain objects

    return NextResponse.json(nfts);
  } catch (error) {
    console.error("Error fetching marketplace NFTs:", error);
    return NextResponse.json(
      { error: "Failed to fetch NFTs" },
      { status: 500 }
    );
  }
}