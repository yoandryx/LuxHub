import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/mongodb";
import Listing from "../../../models/listings";
import authMiddleware from "../../../lib/middleware/auth";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === "POST") {
        const { listingId, approved } = req.body;

        if (!listingId || typeof approved !== "boolean") {
            return res.status(400).json({ error: "Invalid request body" });
        }

        await dbConnect();

        const listing = await Listing.findById(listingId);

        if (!listing) {
            return res.status(404).json({ error: "Listing not found" });
        }

        listing.approved = approved;
        await listing.save();

        res.status(200).json({ message: "Listing status updated", listing });
    } else {
        res.status(405).json({ error: "Method not allowed" });
    }
};

export default authMiddleware(handler);
