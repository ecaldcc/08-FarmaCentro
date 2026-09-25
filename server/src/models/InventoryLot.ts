import { Schema, model, type Types } from 'mongoose';

export interface IInventoryLot {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  lotNumber: string;
  expiresAt: Date;
  quantity: number;
  supplier: string | null;
  receivedAt: Date;
  receivedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryLotSchema = new Schema<IInventoryLot>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    lotNumber: { type: String, required: true, trim: true },
    expiresAt: { type: Date, required: true },
    quantity: { type: Number, required: true, min: 0 },
    supplier: { type: String, default: null },
    receivedAt: { type: Date, required: true },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { collection: 'inventory_lots', timestamps: true, strict: 'throw' },
);

InventoryLotSchema.index({ productId: 1, lotNumber: 1 }, { unique: true });
InventoryLotSchema.index({ productId: 1, expiresAt: 1 });
InventoryLotSchema.index({ expiresAt: 1 });

export const InventoryLot = model<IInventoryLot>('InventoryLot', InventoryLotSchema);
