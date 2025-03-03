import mongoose, { Schema, model } from "mongoose";

const listingSchema = new Schema({
    title: String,
    description: String,
    price: String,
    image: String,
    category: String,
    owner: String,
    approved: { type: Boolean, default: true },
    status: { type: String, default: "pending" }
}, { collection: "listings" });  // Make sure this matches exactly

export default mongoose.models.Listing || model("Listing", listingSchema);
