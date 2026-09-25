import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Types } from 'mongoose';
import { env } from '../config/env.js';
import type { EncryptedValue } from '../models/encryptedField.js';
import { toBuffer } from '../utils/binary.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Additional authenticated data binds each ciphertext to its collection, document and field,
 * so a ciphertext copied to another record or field fails to decrypt (docs/modelo-datos.md §2).
 */
function aad(collection: string, id: Types.ObjectId | string, field: string): Buffer {
  return Buffer.from(`${collection}:${String(id)}:${field}`, 'utf8');
}

export function encryptField(
  collection: string,
  id: Types.ObjectId | string,
  field: string,
  plaintext: string,
): EncryptedValue {
  const version = env.DATA_ENC_ACTIVE_VERSION;
  const key = env.dataKeys.get(version);
  if (!key) {
    throw new Error('Active data encryption key is missing');
  }
  const iv = randomBytes(IV_BYTES); // fresh random IV for every field of every record
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(collection, id, field));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { v: version, iv, tag: cipher.getAuthTag(), ct };
}

export function decryptField(
  collection: string,
  id: Types.ObjectId | string,
  field: string,
  value: EncryptedValue,
): string {
  const key = env.dataKeys.get(value.v);
  if (!key) {
    throw new Error(`Data encryption key version ${value.v} is not available`);
  }
  const decipher = createDecipheriv(ALGORITHM, key, toBuffer(value.iv), { authTagLength: TAG_BYTES });
  decipher.setAAD(aad(collection, id, field));
  decipher.setAuthTag(toBuffer(value.tag));
  return Buffer.concat([decipher.update(toBuffer(value.ct)), decipher.final()]).toString('utf8');
}

export function encryptJson(collection: string, id: Types.ObjectId | string, field: string, value: unknown): EncryptedValue {
  return encryptField(collection, id, field, JSON.stringify(value));
}

export function decryptJson<T>(collection: string, id: Types.ObjectId | string, field: string, value: EncryptedValue): T {
  return JSON.parse(decryptField(collection, id, field, value)) as T;
}

/** Blind index for exact-match search over encrypted values (phone, email). */
export function blindIndex(kind: 'phone' | 'email', normalizedValue: string): string {
  const key = Buffer.from(env.BLIND_INDEX_KEY, 'base64');
  return createHmac('sha256', key).update(`${kind}:${normalizedValue}`).digest('hex');
}

/** Keyed hash of a one-time code; the code itself is never stored. */
export function hashOtp(otpId: Types.ObjectId | string, code: string): string {
  const key = Buffer.from(env.OTP_HMAC_KEY, 'base64');
  return createHmac('sha256', key).update(`${String(otpId)}:${code}`).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
