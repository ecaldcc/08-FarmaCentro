import { z } from 'zod';
import { Cents, IsoDate, ObjectId, Page, Qty, Reason } from './common.js';

/** Simulated payment: there is intentionally no field for any card data. */
export const Payment = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('cash'), amountReceivedCents: Cents }),
  z.strictObject({ method: z.literal('card_simulated') }),
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
});

export const ListSalesQuery = Page.extend({
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  status: z.enum(['completed', 'voided']).optional(),
});

export const VoidSaleBody = z.strictObject({ reason: Reason });

export type PaymentInput = z.infer<typeof Payment>;
export type SaleItemsInput = z.infer<typeof SaleItems>;
export type CreateSaleInput = z.infer<typeof CreateSaleBody>;
export type ListSalesInput = z.infer<typeof ListSalesQuery>;
export type VoidSaleInput = z.infer<typeof VoidSaleBody>;
