import { Schema, model, type Types } from 'mongoose';
import { EncryptedValueSchema, type EncryptedValue } from './encryptedField.js';

export interface ICustomerConsent {
  accepted: boolean;
  noticeVersion: string;
  acceptedAt: Date;
  recordedBy: Types.ObjectId;
  channel: 'mostrador';
}

export interface ICustomer {
  _id: Types.ObjectId;
  fullName: string;
  phone: EncryptedValue | null;
  phoneHmac: string | null;
  email: EncryptedValue | null;
  emailHmac: string | null;
  consent: ICustomerConsent;
  consentWithdrawnAt: Date | null;
  pointsBalance: number;
  status: 'active' | 'withdrawn';
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ConsentSchema = new Schema<ICustomerConsent>(
  {
    accepted: { type: Boolean, required: true },
    noticeVersion: { type: String, required: true },
    acceptedAt: { type: Date, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: String, enum: ['mostrador'], required: true },
  },
  { _id: false, strict: 'throw' },
);

const CustomerSchema = new Schema<ICustomer>(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: EncryptedValueSchema, default: null },
    phoneHmac: { type: String, default: null },
    email: { type: EncryptedValueSchema, default: null },
    emailHmac: { type: String, default: null },
    consent: { type: ConsentSchema, required: true },
    consentWithdrawnAt: { type: Date, default: null },
    pointsBalance: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'withdrawn'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { collection: 'customers', timestamps: true, strict: 'throw' },
);

CustomerSchema.index(
  { phoneHmac: 1 },
  { unique: true, partialFilterExpression: { status: 'active', phoneHmac: { $type: 'string' } } },
);
CustomerSchema.index(
  { emailHmac: 1 },
  { unique: true, partialFilterExpression: { status: 'active', emailHmac: { $type: 'string' } } },
);
CustomerSchema.index({ status: 1 });

export const Customer = model<ICustomer>('Customer', CustomerSchema);
