import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "../../../lib/mongodb";
import Listing from "../../../models/listings";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  const { method } = req;

  switch (method) {
    case "GET":
      try {
        const listings = await Listing.find({ approved: true });
        return res.status(200).json(listings);
      } catch (error) {
        return res.status(500).json({ message: "Server Error", error });
      }

    case "POST":
      try {
        const newListing = new Listing(req.body);
        await newListing.save();
        return res.status(201).json({ message: "Listing created successfully", newListing });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error creating listing", error });
      }

    default:
      return res.status(405).json({ message: "Method Not Allowed" });
  }
}
