import type { Types } from 'mongoose';
import { User } from '../models/User.js';
import { op } from '../utils/trusted.js';
import { appendAudit, type AuditContext } from './audit.service.js';
import { notifyUser } from './mail.service.js';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

/**
 * Counts a failed authentication (password or second factor, decision D-24).
 * On the 5th consecutive failure the account is locked for 15 minutes (control 8.5).
 * Returns true when this failure locked the account.
 */
export async function registerAuthFailure(userId: Types.ObjectId | string, ctx: AuditContext): Promise<boolean> {
  const updated = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { failedLoginCount: 1 } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated || updated.failedLoginCount < MAX_FAILED_ATTEMPTS) {
    return false;
  }
  const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
  const lock = await User.updateOne(
    { _id: userId, failedLoginCount: op({ $gte: MAX_FAILED_ATTEMPTS }) },
    { $set: { lockedUntil, failedLoginCount: 0 } },
  );
  if (lock.modifiedCount === 0) {
    return false; // another request already applied the lock
  }
  await appendAudit(ctx, {
    action: 'auth.account.locked',
    result: 'success',
    entity: 'user',
    entityId: String(updated._id),
    actor: { userId: updated._id, username: updated.username, role: updated.role },
    details: { lockedUntil: lockedUntil.toISOString(), attempts: MAX_FAILED_ATTEMPTS },
  });
  await notifyUser(
    updated.email,
    'cuenta bloqueada temporalmente',
    `Tu cuenta se bloqueó durante ${LOCK_MINUTES} minutos después de ${MAX_FAILED_ATTEMPTS} intentos fallidos de acceso.`,
  );
  return true;
}

export function isLocked(lockedUntil: Date | null | undefined): boolean {
  return lockedUntil instanceof Date && lockedUntil.getTime() > Date.now();
}
