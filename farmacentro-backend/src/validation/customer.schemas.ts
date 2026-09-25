import { z } from 'zod';
import { Email, PersonName, PhoneGT, Reason } from './common.js';

export const LookupCustomerQuery = z
  .strictObject({ phone: PhoneGT.optional(), email: Email.optional() })
  .refine((q) => (q.phone ? 1 : 0) + (q.email ? 1 : 0) === 1, {
    message: 'Busca por teléfono o por correo (solo uno)',
  });

export const CreateCustomerBody = z.strictObject({
  fullName: PersonName,
  phone: PhoneGT,
  email: Email.optional(),
  // Consent is mandatory: anything other than `true` is rejected (control 5.34).
  consent: z.strictObject({
    accepted: z.literal(true, 'El cliente debe aceptar el aviso de privacidad'),
    noticeVersion: z.string().max(20),
  }),
});

export const UpdateCustomerBody = z
  .strictObject({ fullName: PersonName.optional(), phone: PhoneGT.optional(), email: Email.optional() })
  .refine((b) => Object.keys(b).length > 0, { message: 'Indica al menos un campo' });

export const WithdrawConsentBody = z.strictObject({ reason: Reason });

export type LookupCustomerInput = z.infer<typeof LookupCustomerQuery>;
export type CreateCustomerInput = z.infer<typeof CreateCustomerBody>;
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerBody>;
export type WithdrawConsentInput = z.infer<typeof WithdrawConsentBody>;
