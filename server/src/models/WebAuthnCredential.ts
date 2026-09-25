import { Schema, model, type Types } from 'mongoose';

export interface IWebAuthnCredential {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  credentialId: string;
  publicKey: Buffer;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  nickname: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const WebAuthnCredentialSchema = new Schema<IWebAuthnCredential>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    credentialId: { type: String, required: true },
    publicKey: { type: Buffer, required: true },
    counter: { type: Number, required: true, default: 0 },
    transports: { type: [String], default: [] },
    deviceType: { type: String, default: 'singleDevice' },
    backedUp: { type: Boolean, default: false },
    nickname: { type: String, required: true, trim: true },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { collection: 'webauthn_credentials', timestamps: true, strict: 'throw' },
);

WebAuthnCredentialSchema.index({ credentialId: 1 }, { unique: true });
WebAuthnCredentialSchema.index({ userId: 1, revokedAt: 1 });

export const WebAuthnCredential = model<IWebAuthnCredential>('WebAuthnCredential', WebAuthnCredentialSchema);
