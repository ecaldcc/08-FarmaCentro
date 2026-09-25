import { z } from 'zod';
import { PRESCRIPTION_STATUSES } from '../models/Prescription.js';
import { IsoDate, ObjectId, Page, PersonName, Qty, Reason } from './common.js';
import { Payment, SaleItems } from './sales.schemas.js';

export const ListPrescriptionsQuery = Page.extend({
  folio: z
    .string()
    .regex(/^R-\d{6}$/, 'Folio con formato R-000000')
    .optional(),
  status: z.enum(PRESCRIPTION_STATUSES).optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
});

export const CreatePrescriptionBody = z.strictObject({
  customerId: ObjectId.optional(),
  patientName: PersonName,
  doctorName: PersonName,
  doctorLicense: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[\p{L}\p{N} .-]+$/u, 'Número de colegiado inválido'),
  issuedAt: IsoDate,
  items: z
    .array(
      z.strictObject({
        productId: ObjectId,
        dosage: z.string().trim().min(1).max(200),
        quantityPrescribed: Qty,
      }),
    )
    .min(1)
    .max(20)
    .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
      message: 'No repitas medicamentos',
    }),
  notes: z.string().trim().max(500).optional(),
});

export const CancelPrescriptionBody = z.strictObject({ reason: Reason });

export const DispenseBody = z.strictObject({
  items: SaleItems.refine((items) => items.length <= 20, { message: 'Máximo 20 medicamentos' }),
  payment: Payment,
});

export type ListPrescriptionsInput = z.infer<typeof ListPrescriptionsQuery>;
export type CreatePrescriptionInput = z.infer<typeof CreatePrescriptionBody>;
export type DispenseInput = z.infer<typeof DispenseBody>;
