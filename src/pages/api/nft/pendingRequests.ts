import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/database/mongodb";
import SaleRequestModel from "../../../lib/models/SaleRequest";

// Optional interface update
export interface SaleRequest {
  nftId: string;
  seller: string;
  seed: number;
  initializerAmount: number;
  takerAmount: number;
  fileCid: string;
  salePrice: number;
  ipfs_pin_hash?: string;
  timestamp: number;
  marketStatus?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") return res.status(405).json({ saleRequests: [] });

  try {
    await dbConnect();

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const seller = req.query.seller as string | undefined;

    const query: any = { marketStatus: "pending" };
    if (seller) query.seller = seller;

    const totalCount = await SaleRequestModel.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    const docs = await SaleRequestModel.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const saleRequests: SaleRequest[] = docs.map((doc) => ({
      nftId: doc.nftId,
      seller: doc.seller,
      seed: Number(doc.seed),
      initializerAmount: doc.initializerAmount,
      takerAmount: doc.takerAmount,
      fileCid: doc.fileCid,
      salePrice: doc.salePrice,
      ipfs_pin_hash: doc.ipfs_pin_hash,
      timestamp: doc.timestamp,
      marketStatus: doc.marketStatus,
    }));

    res.status(200).json({
      saleRequests,
      page,
      totalPages,
      totalCount,
    });
  } catch (error) {
    console.error("Error fetching paginated sale requests:", error);
    res.status(500).json({ saleRequests: [], page: 1, totalPages: 1, totalCount: 0 });
  }
}

