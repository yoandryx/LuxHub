import { Schema, model, models } from 'mongoose';

const ProcessedTransactionSchema = new Schema(
  {
    txSignature: { type: String, required: true, unique: true, index: true },
    endpoint: { type: String, required: true },
    wallet: { type: String, required: true, index: true },
    amount: { type: Number },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// TTL index: auto-delete after 30 days (2592000 seconds)
ProcessedTransactionSchema.index({ processedAt: 1 }, { expireAfterSeconds: 2592000 });

export const ProcessedTransaction =
  models.ProcessedTransaction || model('ProcessedTransaction', ProcessedTransactionSchema);
