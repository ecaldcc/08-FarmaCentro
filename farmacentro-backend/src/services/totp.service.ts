import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { User } from '../models/User.js';
import { Errors } from '../utils/httpError.js';
import { op } from '../utils/trusted.js';
import { appendAudit, type AuditContext } from './audit.service.js';
import { decryptField, encryptField } from './crypto.service.js';
import { notifyUser } from './mail.service.js';

/**
 * Authenticator app (TOTP, RFC 6238) for re-authentication of critical operations (decision D-32).
 * Parameters compatible with Google and Microsoft Authenticator: HMAC-SHA1, 6 digits, 30 seconds.
 * The secret is stored only encrypted (AES-256-GCM, AAD users:<id>:<field>), never logged or audited.
 */
export const TOTP_PERIOD_SECONDS = 30;
const DIGITS = 6;
/** Accepted clock drift: the previous and the next 30-second step. */
const DRIFT_STEPS = 1;
const SECRET_BYTES = 20;
export const TOTP_SETUP_MINUTES = 10;
const ISSUER = 'FarmaCentro';
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
}

/** HOTP (RFC 4226) for the given 30-second step. */
export function totpCode(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(binary).padStart(DIGITS, '0');
}

/** Returns the matching step within the allowed drift, or null. Compares in constant time. */
function matchStep(secret: Buffer, code: string, now = Date.now()): number | null {
  const step = currentStep(now);
  let match: number | null = null;
  for (let offset = -DRIFT_STEPS; offset <= DRIFT_STEPS; offset += 1) {
    const expected = Buffer.from(totpCode(secret, step + offset));
    const given = Buffer.from(code.padEnd(DIGITS, ' ').slice(0, DIGITS));
    if (timingSafeEqual(expected, given) && match === null) match = step + offset;
  }
  return match;
}

function otpauthUri(username: string, secretBase32: string): string {
  const label = encodeURIComponent(`${ISSUER}:${username}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export async function totpStatus(userId: string): Promise<{ enabled: boolean; enabledAt: Date | null }> {
  const user = await User.findById(userId, { totpEnabledAt: 1 }).lean();
  return { enabled: Boolean(user?.totpEnabledAt), enabledAt: user?.totpEnabledAt ?? null };
}

export async function hasTotp(userId: string): Promise<boolean> {
  return (await totpStatus(userId)).enabled;
}

/**
 * Starts the enrollment: a new random secret is kept as "pending" for 10 minutes until the user
 * proves with a code that the app was configured. Route protected by requireStepUp('totp.enroll').
 */
export async function startEnrollment(user: { id: string; username: string }) {
  const secret = randomBytes(SECRET_BYTES);
  const secretBase32 = base32Encode(secret);
  const expiresAt = new Date(Date.now() + TOTP_SETUP_MINUTES * 60 * 1000);
  await User.updateOne(
    { _id: new Types.ObjectId(user.id) },
    {
      $set: {
        totpPendingSecret: encryptField('users', user.id, 'totpPendingSecret', secretBase32),
        totpPendingExpiresAt: expiresAt,
      },
    },
  );
  return {
    otpauthUri: otpauthUri(user.username, secretBase32),
    secret: secretBase32.match(/.{1,4}/g)!.join(' '),
    issuer: ISSUER,
    account: user.username,
    expiresAt: expiresAt.toISOString(),
  };
}

/** Activates the pending secret if the code matches. Replaces a previous app, if any. */
export async function confirmEnrollment(user: { id: string; email: string }, code: string, ctx: AuditContext) {
  const doc = await User.findById(user.id).select('+totpPendingSecret totpPendingExpiresAt totpEnabledAt').lean();
  const pending = doc?.totpPendingSecret;
  const valid = pending && doc.totpPendingExpiresAt && doc.totpPendingExpiresAt.getTime() > Date.now();
  const secretBase32 = valid ? decryptField('users', user.id, 'totpPendingSecret', pending) : null;
  const step = secretBase32 ? matchStep(base32Decode(secretBase32), code) : null;
  if (!secretBase32 || step === null) {
    await appendAudit(ctx, {
      action: 'totp.enrolled',
      result: 'failure',
      entity: 'user',
      entityId: user.id,
      details: { reason: secretBase32 ? 'bad_code' : 'no_pending_setup' },
    });
    throw Errors.badRequest(
      secretBase32
        ? 'El código no coincide. Revisa que la hora del celular sea automática e intenta con el código nuevo.'
        : 'La configuración venció. Vuelve a empezar.',
    );
  }
  const replaced = Boolean(doc?.totpEnabledAt);
  await User.updateOne(
    { _id: new Types.ObjectId(user.id) },
    {
      $set: {
        totpSecret: encryptField('users', user.id, 'totpSecret', secretBase32),
        totpEnabledAt: new Date(),
        // The code used to confirm cannot be reused for a critical operation.
        totpLastUsedStep: step,
        totpPendingSecret: null,
        totpPendingExpiresAt: null,
      },
    },
  );
  await appendAudit(ctx, {
    action: 'totp.enrolled',
    result: 'success',
    entity: 'user',
    entityId: user.id,
    details: { replaced },
  });
  await notifyUser(
    user.email,
    'app autenticadora configurada',
    'Se configuró una app autenticadora en tu cuenta. Desde ahora confirma con ella las operaciones críticas.',
  );
  return totpStatus(user.id);
}

export type TotpFailure = 'not_enrolled' | 'bad_code' | 'replayed';

/**
 * Verifies a code for a critical operation. Each 30-second step is accepted only once (the
 * update is conditional on the last used step), so an observed code cannot be replayed.
 */
export async function verifyCode(userId: string, code: string): Promise<{ ok: true } | { ok: false; reason: TotpFailure }> {
  const doc = await User.findById(userId).select('+totpSecret totpLastUsedStep').lean();
  if (!doc?.totpSecret) return { ok: false, reason: 'not_enrolled' };
  const secret = base32Decode(decryptField('users', userId, 'totpSecret', doc.totpSecret));
  const step = matchStep(secret, code);
  if (step === null) return { ok: false, reason: 'bad_code' };
  const result = await User.updateOne(
    { _id: doc._id, totpLastUsedStep: op({ $lt: step }) },
    { $set: { totpLastUsedStep: step } },
  );
  return result.modifiedCount === 1 ? { ok: true } : { ok: false, reason: 'replayed' };
}

/** Removes the app (lost phone, or the owner's own request). The user can configure it again. */
export async function revokeTotp(
  target: { id: string; email: string },
  by: 'owner' | 'admin',
  ctx: AuditContext,
  details: Record<string, unknown> = {},
): Promise<void> {
  const result = await User.updateOne(
    { _id: new Types.ObjectId(target.id), totpEnabledAt: op({ $ne: null }) },
    { $set: { totpSecret: null, totpEnabledAt: null, totpLastUsedStep: 0, totpPendingSecret: null, totpPendingExpiresAt: null } },
  );
  if (result.modifiedCount === 0) {
    throw Errors.conflict('El usuario no tiene una app autenticadora configurada.');
  }
  await appendAudit(ctx, { action: 'totp.revoked', result: 'success', entity: 'user', entityId: target.id, details: { by, ...details } });
  await notifyUser(
    target.email,
    'app autenticadora eliminada',
    by === 'owner'
      ? 'Eliminaste la app autenticadora de tu cuenta.'
      : 'El Administrador eliminó la app autenticadora de tu cuenta. Configúrala de nuevo en Mi cuenta.',
  );
}

