// pages/api/nft/approveSale.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import { uploadToPinata } from "../../../utils/pinata";
import { createMetadata } from "../../../utils/metadata";

// Extend globalThis with saleRequests and activeListings
declare global {
  var saleRequests: { nftId: string; ipfs_pin_hash: string; timestamp: number }[] | undefined;
  var activeListings: any[] | undefined;
}

// Create an admin wallet adapter from your secret key.
if (!process.env.ADMIN_SECRET) {
  throw new Error("ADMIN_SECRET environment variable is not defined");
}
const adminKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(process.env.ADMIN_SECRET))
);
const adminWalletAdapter = {
  publicKey: adminKeypair.publicKey,
  signTransaction: async (tx: any) => {
    tx.partialSign(adminKeypair);
    return tx;
  },
  signAllTransactions: async (txs: any[]) => {
    txs.forEach((tx) => tx.partialSign(adminKeypair));
    return txs;
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end(); // Method not allowed
    return;
  }

  const { nftId, ipfs_pin_hash, newPrice } = req.body; // newPrice is optional if you want to update it
  if (!nftId || !ipfs_pin_hash) {
    res.status(400).json({ error: "Missing nftId or ipfs_pin_hash" });
    return;
  }

  try {
    // Remove the sale request from the pending requests store.
    let saleRequests = globalThis.saleRequests || [];
    saleRequests = saleRequests.filter((req: any) => req.nftId !== nftId);
    globalThis.saleRequests = saleRequests;

    // Use your Pinata gateway URL.
    const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/";
    const ipfsRes = await fetch(`${gateway}${ipfs_pin_hash}`);
    if (!ipfsRes.ok) {
      throw new Error("Failed to fetch metadata from IPFS");
    }
    const jsonData = await ipfsRes.json();

    // Update (or add) the "Market Status" attribute to "active".
    let attributes = jsonData.attributes || [];
    const statusIndex = attributes.findIndex((attr: any) => attr.trait_type === "Market Status");
    if (statusIndex !== -1) {
      attributes[statusIndex].value = "active";
    } else {
      attributes.push({ trait_type: "Market Status", value: "active" });
    }
    
    // Optionally update the Price attribute if newPrice is provided.
    if (newPrice) {
      const priceIndex = attributes.findIndex((attr: any) => attr.trait_type === "Price");
      if (priceIndex !== -1) {
        attributes[priceIndex].value = newPrice.toString();
      } else {
        attributes.push({ trait_type: "Price", value: newPrice.toString() });
      }
    }
    jsonData.attributes = attributes;

    // Re-upload updated metadata JSON to IPFS.
    const updatedMetadataUri = await uploadToPinata(jsonData, jsonData.name || "Updated NFT Metadata");
    console.log("Updated metadata uploaded. New URI:", updatedMetadataUri);

    // Update on-chain metadata via Metaplex using the admin wallet adapter.
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.devnet.solana.com");
    const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(adminWalletAdapter));
    const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(nftId) });
    await metaplex.nfts().update({
      nftOrSft: nft,
      uri: updatedMetadataUri,
    });
    console.log("On-chain metadata updated.");

    // Create an enriched NFT object for active listings.
    const enrichedNFT = {
      nftId,
      title: jsonData.name || "No Title",
      description: jsonData.description || "No description provided.",
      image: jsonData.image && jsonData.image.startsWith("http")
        ? jsonData.image
        : `${gateway}${ipfs_pin_hash}`,
      priceSol: jsonData.priceSol ? parseFloat(jsonData.priceSol) : 0,
      currentOwner: jsonData.attributes?.find((attr: any) => attr.trait_type === "Current Owner")?.value || "",
      metadataUri: updatedMetadataUri,
      ipfs_pin_hash,
    };

    let activeListings = globalThis.activeListings || [];
    activeListings.push(enrichedNFT);
    globalThis.activeListings = activeListings;

    res.status(200).json({ message: "NFT approved for sale", nftId });
  } catch (error) {
    console.error("Error approving NFT sale:", error);
    res.status(500).json({ error: "Failed to approve NFT sale" });
  }
}
