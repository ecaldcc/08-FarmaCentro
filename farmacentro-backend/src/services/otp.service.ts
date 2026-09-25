import { randomInt } from 'node:crypto';
import { Types } from 'mongoose';
import type { StepUpAction } from '../domain/stepUpActions.js';
import { env } from '../config/env.js';
import { EmailOtp } from '../models/EmailOtp.js';
import { HttpError, Errors } from '../utils/httpError.js';
import { maskEmail } from '../utils/mask.js';
import { op } from '../utils/trusted.js';
import { appendAudit, type AuditContext } from './audit.service.js';
import { hashOtp, safeEqualHex } from './crypto.service.js';
import { notifyUser, sendMail } from './mail.service.js';

export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
const MAX_PER_HOUR = 10;

interface OtpUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

export interface OtpBinding {
  purpose: 'login' | 'step_up';
  action: StepUpAction | null;
  targetId: string | null;
}

/**
 * Sends a 6-digit, single-use code valid for 5 minutes. Generating a new code invalidates the
 * previous one. Only an HMAC of the code is stored (CLAUDE.md "Segundo factor").
 */
export async function sendOtp(user: OtpUser, binding: OtpBinding, ctx: AuditContext) {
  const userId = new Types.ObjectId(user.id);
  const now = new Date();

  // Resend throttling per purpose, so a login code does not block a later re-authentication.
  const last = await EmailOtp.findOne({ userId, purpose: binding.purpose }).sort({ createdAt: -1 }).lean();
  if (last && now.getTime() - last.createdAt.getTime() < env.OTP_RESEND_SECONDS * 1000) {
    throw new HttpError(429, 'RATE_LIMITED', `Espera ${env.OTP_RESEND_SECONDS} segundos antes de pedir otro código.`);
  }
  const lastHour = await EmailOtp.countDocuments({
    userId,
    createdAt: op({ $gte: new Date(now.getTime() - 60 * 60 * 1000) }),
  });
  if (lastHour >= MAX_PER_HOUR) {
    throw Errors.rateLimited();
  }

  await EmailOtp.updateMany(
    { userId, consumedAt: null, invalidatedAt: null },
    { $set: { invalidatedAt: now } },
  );

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const otpId = new Types.ObjectId();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
  await EmailOtp.create({
    _id: otpId,
    userId,
    purpose: binding.purpose,
    action: binding.action,
    targetId: binding.targetId,
    codeHash: hashOtp(otpId, code),
    expiresAt,
    requestIp: ctx.ip,
  });

  const auditBase = {
    action: 'auth.mfa.email.sent' as const,
    entity: 'user',
    entityId: user.id,
    actor: { userId: user.id, username: user.username, role: user.role },
    details: { purpose: binding.purpose, stepUpAction: binding.action },
  };
  try {
    await sendMail({
      to: user.email,
      subject: 'FarmaCentro: tu código de verificación',
      text:
        `Tu código de verificación es: ${code}\n\n` +
        `Vence en ${OTP_TTL_MINUTES} minutos y solo se puede usar una vez.\n` +
        'Si no lo pediste, avisa al Administrador del sistema.',
    });
  } catch {
    await EmailOtp.updateOne({ _id: otpId }, { $set: { invalidatedAt: new Date() } });
    await appendAudit(ctx, { ...auditBase, result: 'failure' });
    throw new HttpError(500, 'INTERNAL', 'No se pudo enviar el código.');
  }
  await appendAudit(ctx, { ...auditBase, result: 'success' });
  return { expiresAt: expiresAt.toISOString(), sentTo: maskEmail(user.email) };
}

/**
 * Checks a code. Returns true only for the latest valid, unused code with the same binding.
 * After 5 wrong attempts the code is invalidated and the user is notified.
 */
export async function verifyOtp(user: OtpUser, binding: OtpBinding, code: string, ctx: AuditContext): Promise<boolean> {
  const userId = new Types.ObjectId(user.id);
  const otp = await EmailOtp.findOne({
    userId,
    purpose: binding.purpose,
    consumedAt: null,
    invalidatedAt: null,
    expiresAt: op({ $gt: new Date() }),
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!otp || otp.action !== binding.action || otp.targetId !== binding.targetId) {
    return false;
  }

  if (safeEqualHex(hashOtp(otp._id, code), otp.codeHash)) {
    // Conditional update: a code can only be consumed once, even with parallel requests.
    const consumed = await EmailOtp.updateOne({ _id: otp._id, consumedAt: null }, { $set: { consumedAt: new Date() } });
    return consumed.modifiedCount === 1;
  }

  const updated = await EmailOtp.findOneAndUpdate({ _id: otp._id }, { $inc: { attempts: 1 } }, { returnDocument: 'after' }).lean();
  if (updated && updated.attempts >= OTP_MAX_ATTEMPTS) {
    await EmailOtp.updateOne({ _id: otp._id }, { $set: { invalidatedAt: new Date() } });
    await appendAudit(ctx, {
      action: 'auth.mfa.email.exhausted',
      result: 'failure',
      entity: 'user',
      entityId: user.id,
      actor: { userId: user.id, username: user.username, role: user.role },
      details: { purpose: binding.purpose },
    });
    await notifyUser(
      user.email,
      'se agotaron los intentos del código',
      `Se ingresó ${OTP_MAX_ATTEMPTS} veces un código incorrecto y el código fue invalidado.`,
    );
  }
  return false;
}
