import { z } from 'zod';
import { isValidCui, isValidNit, normalizeTaxId } from '../domain/taxId.js';
import { Cents, IsoDate, ObjectId, Page, Qty, Reason } from './common.js';

/** Simulated payment: there is intentionally no field for any card data. */
export const Payment = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('cash'), amountReceivedCents: Cents }),
  z.strictObject({ method: z.literal('card_simulated') }),
]);

const TaxIdText = z.string().max(20).transform(normalizeTaxId);
const BillingName = z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(150);

/** Receipt identification: CF, NIT or DPI (CUI). Without a registered number, a name is needed. */
export const Billing = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('CF') }),
  z.strictObject({
    type: z.literal('NIT'),
    taxId: TaxIdText.refine(isValidNit, 'NIT inválido: revisa el número y el dígito verificador'),
    name: BillingName.optional(),
  }),
  z.strictObject({
    type: z.literal('CUI'),
    taxId: TaxIdText.refine(isValidCui, 'DPI inválido: deben ser 13 dígitos válidos'),
    name: BillingName.optional(),
  }),
]);

export const BillingLookupQuery = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('NIT'), taxId: TaxIdText.refine(isValidNit, 'NIT inválido') }),
  z.strictObject({ type: z.literal('CUI'), taxId: TaxIdText.refine(isValidCui, 'DPI inválido') }),
]);

export const SaleItems = z
  .array(z.strictObject({ productId: ObjectId, quantity: Qty }))
  .min(1)
  .max(50)
  .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
    message: 'No repitas productos: ajusta la cantidad',
  });

export const CreateSaleBody = z.strictObject({
  customerId: ObjectId.optional(),
  items: SaleItems,
  payment: Payment,
  billing: Billing.default({ type: 'CF' }),
});

export const ListSalesQuery = Page.extend({
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  status: z.enum(['completed', 'voided']).optional(),
});

export const VoidSaleBody = z.strictObject({ reason: Reason });

export type PaymentInput = z.infer<typeof Payment>;
export type BillingInput = z.infer<typeof Billing>;
export type BillingLookupInput = z.infer<typeof BillingLookupQuery>;
export type SaleItemsInput = z.infer<typeof SaleItems>;
export type CreateSaleInput = z.infer<typeof CreateSaleBody>;
export type ListSalesInput = z.infer<typeof ListSalesQuery>;
export type VoidSaleInput = z.infer<typeof VoidSaleBody>;
