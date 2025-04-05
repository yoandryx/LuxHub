// // src/pages/api/nft/activeListings.ts
// import type { NextApiRequest, NextApiResponse } from "next";
// import { Connection, PublicKey } from "@solana/web3.js";
// import { Metaplex } from "@metaplex-foundation/js";

// export default async function handler(req: NextApiRequest, res: NextApiResponse) {
//   try {
//     // Setup connection and Metaplex instance.
//     const connection = new Connection(process.env.NEXT_PUBLIC_ENDPOINT || "https://api.devnet.solana.com");
//     const metaplex = Metaplex.make(connection);

//     // Get the admin list from an environment variable (comma-separated list of admin public keys).
//     const adminListStr = process.env.ADMIN_LIST;
//     if (!adminListStr) {
//       throw new Error("ADMIN_LIST environment variable is not defined");
//     }
    // const adminList = adminListStr.split(",").map((s) => s.trim()).filter((s) => s);

//     // Query NFTs for each admin.
//     let allNfts: any[] = [];
//     for (const adminStr of adminList) {
//       const updateAuthority = new PublicKey(adminStr);
//       const nfts = await metaplex.nfts().findAllByUpdateAuthority({ updateAuthority });
//       allNfts = allNfts.concat(nfts);
//     }

//     // For each NFT, fetch its metadata from the URI and check the "Market Status" attribute.
//     const activeNfts = await Promise.all(allNfts.map(async (nft) => {
//       try {
//         const resp = await fetch(nft.uri);
//         if (!resp.ok) throw new Error("Failed to fetch metadata");
//         const json = await resp.json();
//         // Look for "Market Status" (case-insensitive).
//         const marketStatusAttr = json.attributes?.find((attr: any) =>
//           attr.trait_type.toLowerCase() === "market status"
//         );
//         if (marketStatusAttr && marketStatusAttr.value.toLowerCase() === "active") {
//           return {
//             title: json.name || "Untitled",
//             description: json.description || "",
//             image: json.image || "",
//             priceSol: json.priceSol ? parseFloat(json.priceSol) : 0,
//             mintAddress: nft.mintAddress.toBase58(),
//             metadataUri: nft.uri,
//             currentOwner: json.attributes?.find((attr: any) =>
//               attr.trait_type.toLowerCase() === "current owner"
//             )?.value || "",
//           };
//         } else {
//           return null;
//         }
//       } catch (err) {
//         console.error("Error processing NFT", nft.mintAddress.toBase58(), err);
//         return null;
//       }
//     }));

//     // Filter out any null entries.
//     const filtered = activeNfts.filter((nft) => nft !== null);
//     res.status(200).json(filtered);
//   } catch (error: any) {
//     console.error("Error fetching active listings:", error);
//     res.status(500).json({ error: "Failed to fetch active listings" });
//   }
// }
