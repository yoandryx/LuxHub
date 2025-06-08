import mongoose from "mongoose";

const InviteCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  used: { type: Boolean, default: false },
  expiresAt: { type: Date, default: null },
  vendorWallet: { type: String, required: true },
  createdBy: { type: String, required: true },
  maxUses: { type: Number, default: 1 },
  uses: { type: Number, default: 0 },
});

InviteCodeSchema.index({ code: 1 });
InviteCodeSchema.index({ vendorWallet: 1 });

export default mongoose.models.InviteCode || mongoose.model("InviteCode", InviteCodeSchema);

export type InviteCode = {
  code: string;
  used: boolean;
  expiresAt?: Date | null;
  vendorWallet: string;
  createdBy: string;
  maxUses?: number;
  uses?: number;
};
