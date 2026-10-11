import { Schema, model, type Types } from 'mongoose';
import { ROLES, type Role } from '../domain/roles.js';
import { EncryptedValueSchema, type EncryptedValue } from './encryptedField.js';

export interface IUser {
  _id: Types.ObjectId;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  status: 'active' | 'disabled';
  passwordHash: string;
  passwordChangedAt: Date;
  mustChangePassword: boolean;
  /** Expiry of the temporary password sent in the invitation (null = no temporary password). */
  temporaryPasswordExpiresAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  /** Authenticator app (TOTP) secret, encrypted (D-32). Never selected by default. */
  totpSecret: EncryptedValue | null;
  totpEnabledAt: Date | null;
  /** Last 30-second step accepted: a code is accepted only once (anti-replay). */
  totpLastUsedStep: number;
  totpPendingSecret: EncryptedValue | null;
  totpPendingExpiresAt: Date | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, lowercase: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ROLES, required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    passwordHash: { type: String, required: true, select: false },
    passwordChangedAt: { type: Date, required: true },
    mustChangePassword: { type: Boolean, default: true },
    temporaryPasswordExpiresAt: { type: Date, default: null },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    totpSecret: { type: EncryptedValueSchema, default: null, select: false },
    totpEnabledAt: { type: Date, default: null },
    totpLastUsedStep: { type: Number, default: 0 },
    totpPendingSecret: { type: EncryptedValueSchema, default: null, select: false },
    totpPendingExpiresAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { collection: 'users', timestamps: true, strict: 'throw' },
);

UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1, status: 1 });

export const User = model<IUser>('User', UserSchema);
