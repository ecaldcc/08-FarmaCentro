import { Schema, model, type Types } from 'mongoose';

export interface ISaleItem {
  productId: Types.ObjectId;
  lotId: Types.ObjectId;
  sku: string;
  name: string;
  isControlled: boolean;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

/** Simulated payment: never card number, expiry, CVV, holder or last four digits. */
export interface ISalePayment {
  method: 'cash' | 'card_simulated';
  amountReceivedCents: number | null;
  changeCents: number | null;
  authorizationRef: string | null;
}

export interface ISaleVoid {
  voidedAt: Date;
  voidedBy: Types.ObjectId;
  reason: string;
  stepUpMethod: string;
}

export interface ISale {
  _id: Types.ObjectId;
  saleNumber: string;
  cashierId: Types.ObjectId;
  customerId: Types.ObjectId | null;
  items: ISaleItem[];
  totalCents: number;
  payment: ISalePayment;
  pointsEarned: number;
  dispensationId: Types.ObjectId | null;
  status: 'completed' | 'voided';
  void: ISaleVoid | null;
  createdAt: Date;
  updatedAt: Date;
}

const SaleItemSchema = new Schema<ISaleItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    lotId: { type: Schema.Types.ObjectId, ref: 'InventoryLot', required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    isControlled: { type: Boolean, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceCents: { type: Number, required: true, min: 1 },
    lineTotalCents: { type: Number, required: true, min: 1 },
  },
  { _id: false, strict: 'throw' },
);

const SalePaymentSchema = new Schema<ISalePayment>(
  {
    method: { type: String, enum: ['cash', 'card_simulated'], required: true },
    amountReceivedCents: { type: Number, default: null },
    changeCents: { type: Number, default: null },
    authorizationRef: { type: String, default: null },
  },
  { _id: false, strict: 'throw' },
);

const SaleVoidSchema = new Schema<ISaleVoid>(
  {
    voidedAt: { type: Date, required: true },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    stepUpMethod: { type: String, required: true },
  },
  { _id: false, strict: 'throw' },
);

const SaleSchema = new Schema<ISale>(
  {
    saleNumber: { type: String, required: true },
    cashierId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    items: { type: [SaleItemSchema], required: true },
    totalCents: { type: Number, required: true, min: 1 },
    payment: { type: SalePaymentSchema, required: true },
    pointsEarned: { type: Number, default: 0 },
    dispensationId: { type: Schema.Types.ObjectId, ref: 'Dispensation', default: null },
    status: { type: String, enum: ['completed', 'voided'], default: 'completed' },
    void: { type: SaleVoidSchema, default: null },
  },
  { collection: 'sales', timestamps: true, strict: 'throw' },
);

SaleSchema.index({ saleNumber: 1 }, { unique: true });
SaleSchema.index({ cashierId: 1, createdAt: -1 });
SaleSchema.index({ status: 1, createdAt: -1 });
SaleSchema.index({ 'void.voidedAt': -1 }, { sparse: true });
SaleSchema.index({ customerId: 1, createdAt: -1 }, { partialFilterExpression: { customerId: { $type: 'objectId' } } });

export const Sale = model<ISale>('Sale', SaleSchema);
