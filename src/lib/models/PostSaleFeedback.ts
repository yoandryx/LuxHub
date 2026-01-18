// src/models/PostSaleFeedback.ts
import { Schema, model, models } from 'mongoose';

const PostSaleFeedbackSchema = new Schema(
  {
    escrow: { type: Schema.Types.ObjectId, ref: 'Escrow', required: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    asset: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
    authenticityRating: { type: Number, min: 1, max: 5 }, // Buyer feedback on watch condition
    comments: String,
    servicesOffered: [String], // e.g., 'insurance', 'appraisal'
    servicesAccepted: [String],
    contactHistory: [
      {
        type: String, // e.g., 'email_sent', 'call_made'
        at: Date,
      },
    ], // NEW: Track LuxHub contact with buyer
    resolved: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const PostSaleFeedback =
  models.PostSaleFeedback || model('PostSaleFeedback', PostSaleFeedbackSchema);
