// ✅ FILE 1: /pages/api/nft/seller.ts (Updated with detailed console logs)
import type { NextApiRequest, NextApiResponse } from "next";

interface NFT {
  mintAddress: string;
  title: string;
  description: string;
  image: string;
  marketStatus: string;
  fileCid: string;
  salePrice: number;
  metadataUri: string;
  currentOwner: string;
}

const gatewayUrl =
  process.env.NEXT_PUBLIC_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/";
const baseURL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXTAUTH_URL ||
  "http://localhost:3000";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { wallet } = req.query;
  if (!wallet || typeof wallet !== "string") {
    return res.status(400).json({ error: "Missing wallet query parameter" });
  }

  try {
    const pinataRes = await fetch(`${baseURL}/api/pinata/nfts`);
    if (!pinataRes.ok) throw new Error("Failed to fetch NFT pins");
    const pins = await pinataRes.json();

    const nfts: NFT[] = [];
    const seenMintAddresses = new Set<string>();

    for (const pin of pins) {
      const ipfsHash = pin.ipfs_pin_hash;
      try {
        const metadataRes = await fetch(`${gatewayUrl}${ipfsHash}`);
        if (!metadataRes.ok) {
          console.log(`[SKIP] Metadata fetch failed for: ${ipfsHash}`);
          continue;
        }
        const metadata = await metadataRes.json();

        if (!metadata.mintAddress) {
          console.log(`[SKIP] Missing mintAddress in metadata for ${ipfsHash}`);
          continue;
        }
        if (seenMintAddresses.has(metadata.mintAddress)) {
          console.log(`[SKIP] Duplicate mintAddress: ${metadata.mintAddress}`);
          continue;
        }

        let currentOwner = "";
        if (metadata.attributes && Array.isArray(metadata.attributes)) {
          const ownerAttr = metadata.attributes.find(
            // (attr: any) => attr.trait_type === "Current Owner" || attr.trait_type === "Provenance"
            (attr: any) => attr.trait_type === "Provenance" || attr.trait_type === "Provenance"

          );
          if (ownerAttr) currentOwner = ownerAttr.value;
        }

        if (!currentOwner) {
          console.log(`[SKIP] No owner attribute for mint: ${metadata.mintAddress}`);
          continue;
        }

        if (currentOwner.toLowerCase() !== wallet.toLowerCase()) {
          console.log(`[SKIP] Owner mismatch for mint: ${metadata.mintAddress}, expected ${wallet}, got ${currentOwner}`);
          continue;
        }

        let salePrice = 0;
        if (metadata.attributes && Array.isArray(metadata.attributes)) {
          const priceAttr = metadata.attributes.find((attr: any) => attr.trait_type === "Price");
          if (priceAttr) salePrice = parseFloat(priceAttr.value);
        }

        const nft: NFT = {
          mintAddress: metadata.mintAddress,
          title: metadata.name || "No Title",
          description: metadata.description || "No Description",
          image:
            metadata.image && metadata.image.startsWith("http")
              ? metadata.image
              : `${gatewayUrl}${ipfsHash}`,
          marketStatus:
            metadata.attributes?.find((attr: any) => attr.trait_type === "Market Status")?.value ||
            "inactive",
          fileCid: ipfsHash,
          salePrice,
          metadataUri: `${gatewayUrl}${ipfsHash}`,
          currentOwner,
        };

        seenMintAddresses.add(metadata.mintAddress);
        nfts.push(nft);
      } catch (error) {
        console.log(`[SKIP] Error processing ${ipfsHash}:`, error);
        continue;
      }
    }

    return res.status(200).json(nfts);
  } catch (error: any) {
    console.error("[API /api/nft/seller] Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
