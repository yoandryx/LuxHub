import mongoose, { Schema, model, models } from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String },
    walletAddress: { type: String },
    stripeID: { type: String },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    type: { type: String, enum: ["web2", "web3"], required: true }
}, { timestamps: true });

// Hash password before saving
UserSchema.pre("save", async function (next) {
    if (this.isModified("password") && this.password) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

UserSchema.methods.comparePassword = async function (candidatePassword: string) {
    return await bcrypt.compare(candidatePassword, this.password);
};

const User = models.User || model("User", UserSchema);

export default User;
