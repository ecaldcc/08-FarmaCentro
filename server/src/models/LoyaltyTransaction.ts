import { Schema, model, type Types } from 'mongoose';

export interface ILoyaltyTransaction {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  type: 'earn' | 'void_reversal';
  points: number;
  saleId: Types.ObjectId;
  userId: Types.ObjectId;
  createdAt: Date;
}

// Append-only: the API database role has only insert/find on this collection.
const LoyaltyTransactionSchema = new Schema<ILoyaltyTransaction>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    type: { type: String, enum: ['earn', 'void_reversal'], required: true },
    points: { type: Number, required: true },
    saleId: { type: Schema.Types.ObjectId, ref: 'Sale', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { collection: 'loyalty_transactions', timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' },
);

LoyaltyTransactionSchema.index({ customerId: 1, createdAt: -1 });
LoyaltyTransactionSchema.index({ saleId: 1 });

export const LoyaltyTransaction = model<ILoyaltyTransaction>('LoyaltyTransaction', LoyaltyTransactionSchema);
