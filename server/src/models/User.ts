import { Schema, model, type Types } from 'mongoose';
import { ROLES, type Role } from '../domain/roles.js';

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
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
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
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { collection: 'users', timestamps: true, strict: 'throw' },
);

UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1, status: 1 });

export const User = model<IUser>('User', UserSchema);
