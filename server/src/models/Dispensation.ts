import { Schema, model, type Types } from 'mongoose';

export interface IDispensationItem {
  productId: Types.ObjectId;
  lotId: Types.ObjectId;
  quantity: number;
  isControlled: boolean;
}

export interface IDispensation {
  _id: Types.ObjectId;
  prescriptionId: Types.ObjectId;
  saleId: Types.ObjectId;
  items: IDispensationItem[];
  pharmacistId: Types.ObjectId;
  stepUpMethod: string | null;
  createdAt: Date;
}

const DispensationItemSchema = new Schema<IDispensationItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    lotId: { type: Schema.Types.ObjectId, ref: 'InventoryLot', required: true },
    quantity: { type: Number, required: true, min: 1 },
    isControlled: { type: Boolean, required: true },
  },
  { _id: false, strict: 'throw' },
);

// Append-only: the API database role has only insert/find on this collection.
const DispensationSchema = new Schema<IDispensation>(
  {
    prescriptionId: { type: Schema.Types.ObjectId, ref: 'Prescription', required: true },
    saleId: { type: Schema.Types.ObjectId, ref: 'Sale', required: true },
    items: { type: [DispensationItemSchema], required: true },
    pharmacistId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    stepUpMethod: { type: String, default: null },
  },
  { collection: 'dispensations', timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' },
);

DispensationSchema.index({ prescriptionId: 1 });
DispensationSchema.index({ createdAt: -1 });
DispensationSchema.index({ 'items.productId': 1, createdAt: -1 });

export const Dispensation = model<IDispensation>('Dispensation', DispensationSchema);
