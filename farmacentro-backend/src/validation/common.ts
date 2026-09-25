import { z } from 'zod';
import { ROLES } from '../domain/roles.js';
import { STEP_UP_ACTIONS } from '../domain/stepUpActions.js';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from '../services/password.service.js';

export const ObjectId = z.string().regex(/^[a-f0-9]{24}$/, 'Identificador inválido');
export const IdParams = z.strictObject({ id: ObjectId });

export const Username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9._-]+$/, 'Solo letras minúsculas, números, punto, guion y guion bajo');

export const Password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(128)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES, 'Máximo 72 bytes');

export const Email = z.string().trim().toLowerCase().max(254).pipe(z.email('Correo inválido'));
export const Role = z.enum(ROLES);
export const PersonName = z.string().trim().min(3).max(100);
export const Reason = z.string().trim().min(10, 'El motivo debe tener al menos 10 caracteres').max(300);
export const Cents = z.number().int().positive().max(100_000_000);
export const Qty = z.number().int().positive().max(10_000);
export const Code6 = z.string().regex(/^\d{6}$/, 'El código tiene 6 dígitos');
export const PhoneGT = z.string().regex(/^\d{8}$/, 'El teléfono debe tener 8 dígitos');
export const IsoDate = z.iso.date();
export const StepUpAction = z.enum(STEP_UP_ACTIONS);
export const SearchText = z
  .string()
  .trim()
  .max(50)
  .regex(/^[\p{L}\p{N} ._-]*$/u, 'Caracteres no permitidos');

export const Page = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PageInput = z.infer<typeof Page>;

export const stringBool = z.enum(['true', 'false']).transform((value) => value === 'true');

const MAX_RANGE_DAYS = 366;

export function withDateRange<T extends z.ZodRawShape>(shape: T, required = true) {
  const from = required ? IsoDate : IsoDate.optional();
  const to = required ? IsoDate : IsoDate.optional();
  return z.strictObject({ ...shape, from, to }).refine(
    (value) => {
      const range = value as { from?: string; to?: string };
      if (!range.from || !range.to) return true;
      const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
      return days >= 0 && days <= MAX_RANGE_DAYS;
    },
    { message: 'Rango de fechas inválido (máximo 366 días)', path: ['to'] },
  );
}

/** WebAuthn JSON produced by @simplewebauthn/browser, validated strictly. */
export const WebAuthnAuthResponse = z.strictObject({
  id: z.string().min(1).max(1024),
  rawId: z.string().min(1).max(1024),
  type: z.literal('public-key'),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()),
  response: z.strictObject({
    clientDataJSON: z.string().max(4096),
    authenticatorData: z.string().max(4096),
    signature: z.string().max(1024),
    userHandle: z.string().max(512).optional(),
  }),
});

export const WebAuthnRegResponse = z.strictObject({
  id: z.string().min(1).max(1024),
  rawId: z.string().min(1).max(1024),
  type: z.literal('public-key'),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()),
  response: z.strictObject({
    clientDataJSON: z.string().max(4096),
    attestationObject: z.string().max(16_384),
    authenticatorData: z.string().max(8192).optional(),
    transports: z.array(z.string().max(20)).max(10).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: z.string().max(4096).optional(),
  }),
});
