import { Schema, model, type Types } from 'mongoose';

export const PRODUCT_CATEGORIES = ['medicamento', 'cuidado_personal', 'otros'] as const;

export interface IProduct {
  _id: Types.ObjectId;
  sku: string;
  name: string;
  activeIngredient: string | null;
  presentation: string;
  category: (typeof PRODUCT_CATEGORIES)[number];
  unitPriceCents: number;
  isControlled: boolean;
  minStock: number;
  status: 'active' | 'inactive';
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    sku: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    activeIngredient: { type: String, default: null },
    presentation: { type: String, required: true, trim: true },
    category: { type: String, enum: PRODUCT_CATEGORIES, required: true },
    unitPriceCents: { type: Number, required: true, min: 1 },
    isControlled: { type: Boolean, default: false },
    minStock: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { collection: 'products', timestamps: true, strict: 'throw' },
);

ProductSchema.index({ sku: 1 }, { unique: true });
ProductSchema.index({ name: 1 });
ProductSchema.index({ isControlled: 1, status: 1 });

export const Product = model<IProduct>('Product', ProductSchema);
