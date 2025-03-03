import mongoose, { Schema, model, models } from "mongoose";

const UserSchema = new Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String },
    walletAddress: { type: String },
    stripeID: { type: String },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    type: { type: String, enum: ["web2", "web3"], required: true }
}, { timestamps: true });

const User = models.User || model("User", UserSchema);

export default User;
