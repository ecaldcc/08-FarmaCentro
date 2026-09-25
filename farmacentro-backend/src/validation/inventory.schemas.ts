import { z } from 'zod';
import { ADJUSTMENT_REASONS, MOVEMENT_TYPES } from '../models/InventoryMovement.js';
import { PRODUCT_CATEGORIES } from '../models/Product.js';
import { Cents, IsoDate, ObjectId, Page, Qty, Reason, SearchText, stringBool } from './common.js';

const ProductFields = {
  name: z.string().trim().min(2).max(120),
  activeIngredient: z.string().trim().max(120).optional(),
  presentation: z.string().trim().min(2).max(120),
  category: z.enum(PRODUCT_CATEGORIES),
  unitPriceCents: Cents,
  minStock: z.number().int().min(0).max(100_000),
};

export const ListProductsQuery = Page.extend({
  q: SearchText.optional(),
  isControlled: stringBool.optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  lowStock: stringBool.optional(),
});

export const CreateProductBody = z.strictObject({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,20}$/, 'SKU: 3 a 20 caracteres A-Z, 0-9 o guion'),
  ...ProductFields,
});

// isControlled is deliberately absent: only the Regente changes it, with step-up (PUT /controlled).
export const UpdateProductBody = z
  .strictObject({
    name: ProductFields.name.optional(),
    activeIngredient: ProductFields.activeIngredient,
    presentation: ProductFields.presentation.optional(),
    category: ProductFields.category.optional(),
    unitPriceCents: ProductFields.unitPriceCents.optional(),
    minStock: ProductFields.minStock.optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Indica al menos un campo' });

export const SetControlledBody = z.strictObject({ isControlled: z.boolean(), reason: Reason });

export const ListLotsQuery = Page.extend({
  productId: ObjectId.optional(),
  includeExpired: stringBool.default(false),
});

export const ExpiringQuery = z.strictObject({
  withinDays: z.coerce.number().int().min(1).max(365).default(60),
});

export const ListMovementsQuery = Page.extend({
  productId: ObjectId.optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
});

export const ReceiptBody = z.strictObject({
  productId: ObjectId,
  lotNumber: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[\p{L}\p{N}._/-]+$/u, 'Número de lote inválido'),
  expiresAt: IsoDate,
  quantity: Qty,
  supplier: z.string().trim().max(100).optional(),
  documentRef: z.string().trim().max(40).optional(),
});

export const AdjustmentBody = z.strictObject({
  lotId: ObjectId,
  quantityDelta: z
    .number()
    .int()
    .min(-10_000)
    .max(10_000)
    .refine((n) => n !== 0, 'La cantidad no puede ser cero'),
  reasonCode: z.enum(ADJUSTMENT_REASONS),
  reason: Reason,
});

export type ListProductsInput = z.infer<typeof ListProductsQuery>;
export type CreateProductInput = z.infer<typeof CreateProductBody>;
export type UpdateProductInput = z.infer<typeof UpdateProductBody>;
export type SetControlledInput = z.infer<typeof SetControlledBody>;
export type ListLotsInput = z.infer<typeof ListLotsQuery>;
export type ExpiringInput = z.infer<typeof ExpiringQuery>;
export type ListMovementsInput = z.infer<typeof ListMovementsQuery>;
export type ReceiptInput = z.infer<typeof ReceiptBody>;
export type AdjustmentInput = z.infer<typeof AdjustmentBody>;
