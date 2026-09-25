import { Schema, model, type Types } from 'mongoose';
import { EncryptedValueSchema, type EncryptedValue } from './encryptedField.js';

export const PRESCRIPTION_STATUSES = ['registered', 'partially_dispensed', 'dispensed', 'cancelled'] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number];

/** Clear-text shape of the encrypted `items` field. */
export interface PrescriptionItem {
  productId: string;
  productName: string;
  dosage: string;
  quantityPrescribed: number;
}

export interface IPrescriptionCancel {
  cancelledAt: Date;
  cancelledBy: Types.ObjectId;
  reason: string;
}

export interface IPrescription {
  _id: Types.ObjectId;
  folio: string;
  customerId: Types.ObjectId | null;
  patientName: EncryptedValue;
  doctorName: EncryptedValue;
  doctorLicense: EncryptedValue;
  issuedAt: Date;
  items: EncryptedValue;
  notes: EncryptedValue | null;
  hasControlled: boolean;
  status: PrescriptionStatus;
  registeredBy: Types.ObjectId;
  cancel: IPrescriptionCancel | null;
  createdAt: Date;
  updatedAt: Date;
}

const CancelSchema = new Schema<IPrescriptionCancel>(
  {
    cancelledAt: { type: Date, required: true },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
  },
  { _id: false, strict: 'throw' },
);

// Health data lives in its own collection with every clinical field encrypted (ISO 27799).
const PrescriptionSchema = new Schema<IPrescription>(
  {
    folio: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    patientName: { type: EncryptedValueSchema, required: true },
    doctorName: { type: EncryptedValueSchema, required: true },
    doctorLicense: { type: EncryptedValueSchema, required: true },
    issuedAt: { type: Date, required: true },
    items: { type: EncryptedValueSchema, required: true },
    notes: { type: EncryptedValueSchema, default: null },
    hasControlled: { type: Boolean, required: true },
    status: { type: String, enum: PRESCRIPTION_STATUSES, default: 'registered' },
    registeredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cancel: { type: CancelSchema, default: null },
  },
  { collection: 'prescriptions', timestamps: true, strict: 'throw' },
);

PrescriptionSchema.index({ folio: 1 }, { unique: true });
PrescriptionSchema.index({ status: 1, createdAt: -1 });
PrescriptionSchema.index({ customerId: 1 }, { partialFilterExpression: { customerId: { $type: 'objectId' } } });

export const Prescription = model<IPrescription>('Prescription', PrescriptionSchema);
