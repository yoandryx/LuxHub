import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/mongodb";
import Listing from "../../../models/listings";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  if (req.method === "POST") {
    try {
      const newListing = new Listing(req.body);
      const savedListing = await newListing.save();
      res.status(201).json(savedListing);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create listing" });
    }
  } else if (req.method === "GET") {
    try {
      const listings = await Listing.find({ approved: true });
      res.status(200).json(listings);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch listings" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
