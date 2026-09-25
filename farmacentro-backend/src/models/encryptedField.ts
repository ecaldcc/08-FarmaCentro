import { Schema } from 'mongoose';

/** AES-256-GCM ciphertext stored per field (docs/modelo-datos.md §2). */
export interface EncryptedValue {
  v: number;
  iv: Buffer;
  tag: Buffer;
  ct: Buffer;
}

export const EncryptedValueSchema = new Schema<EncryptedValue>(
  {
    v: { type: Number, required: true },
    iv: { type: Buffer, required: true },
    tag: { type: Buffer, required: true },
    ct: { type: Buffer, required: true },
  },
  { _id: false, strict: 'throw' },
);
