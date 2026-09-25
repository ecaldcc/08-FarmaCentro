import { Schema, model, type Types } from 'mongoose';
import { EncryptedValueSchema, type EncryptedValue } from './encryptedField.js';

/** Buyer identified on receipts with NIT or DPI. The number is encrypted (AES-256-GCM). */
export interface IBillingParty {
  _id: Types.ObjectId;
  type: 'NIT' | 'CUI';
  taxId: EncryptedValue;
  taxIdHmac: string;
  name: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BillingPartySchema = new Schema<IBillingParty>(
  {
    type: { type: String, enum: ['NIT', 'CUI'], required: true },
    taxId: { type: EncryptedValueSchema, required: true },
    taxIdHmac: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { collection: 'billing_parties', timestamps: true, strict: 'throw' },
);

BillingPartySchema.index({ type: 1, taxIdHmac: 1 }, { unique: true });

export const BillingParty = model<IBillingParty>('BillingParty', BillingPartySchema);
