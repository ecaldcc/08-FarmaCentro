import { Schema, model, type Types } from 'mongoose';

export const MOVEMENT_TYPES = ['receipt', 'sale', 'sale_void', 'adjustment', 'dispensation'] as const;
export const ADJUSTMENT_REASONS = ['damaged', 'expired', 'count_correction', 'loss', 'other'] as const;

export interface IInventoryMovement {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  lotId: Types.ObjectId;
  type: (typeof MOVEMENT_TYPES)[number];
  quantityDelta: number;
  balanceAfter: number;
  reasonCode: (typeof ADJUSTMENT_REASONS)[number] | null;
  reason: string | null;
  refType: string | null;
  refId: Types.ObjectId | null;
  userId: Types.ObjectId;
  stepUpMethod: string | null;
  createdAt: Date;
}

// Append-only ledger: the API database role has only insert/find on this collection.
const InventoryMovementSchema = new Schema<IInventoryMovement>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    lotId: { type: Schema.Types.ObjectId, ref: 'InventoryLot', required: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    quantityDelta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reasonCode: { type: String, enum: [...ADJUSTMENT_REASONS, null], default: null },
    reason: { type: String, default: null },
    refType: { type: String, default: null },
    refId: { type: Schema.Types.ObjectId, default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    stepUpMethod: { type: String, default: null },
  },
  { collection: 'inventory_movements', timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' },
);

InventoryMovementSchema.index({ productId: 1, createdAt: -1 });
InventoryMovementSchema.index({ type: 1, createdAt: -1 });
InventoryMovementSchema.index({ lotId: 1, createdAt: -1 });

export const InventoryMovement = model<IInventoryMovement>('InventoryMovement', InventoryMovementSchema);
