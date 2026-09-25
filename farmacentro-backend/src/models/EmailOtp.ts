import { Schema, model, type Types } from 'mongoose';

export interface IEmailOtp {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  purpose: 'login' | 'step_up';
  action: string | null;
  targetId: string | null;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
  requestIp: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const EmailOtpSchema = new Schema<IEmailOtp>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: ['login', 'step_up'], required: true },
    action: { type: String, default: null },
    targetId: { type: String, default: null },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    invalidatedAt: { type: Date, default: null },
    requestIp: { type: String, default: null },
  },
  { collection: 'email_otps', timestamps: true, strict: 'throw' },
);

EmailOtpSchema.index({ userId: 1, purpose: 1, createdAt: -1 });
// Expired codes are deleted by MongoDB 24 h after they expire (the API has no remove privilege).
EmailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 });

export const EmailOtp = model<IEmailOtp>('EmailOtp', EmailOtpSchema);
