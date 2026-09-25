import { Types } from 'mongoose';
import type { AuditAction } from '../domain/auditActions.js';
import { User, type IUser } from '../models/User.js';
import type { SecondFactorMethod } from '../types/express.js';
import { Errors } from '../utils/httpError.js';
import { appendAudit, type AuditContext } from './audit.service.js';
import { isLocked, registerAuthFailure } from './lockout.service.js';
import { notifyUser } from './mail.service.js';
import { checkPasswordPolicy, hashPassword, spendDummyCompare, verifyPassword } from './password.service.js';

export function actorOf(user: Pick<IUser, '_id' | 'username' | 'role'> | { id: string; username: string; role: string }) {
  const id = '_id' in user ? String(user._id) : user.id;
  return { userId: id, username: user.username, role: user.role };
}

type FailureReason = 'unknown_user' | 'bad_password' | 'locked' | 'disabled';

async function auditLoginFailure(ctx: AuditContext, reason: FailureReason, username: string, user?: IUser | null) {
  await appendAudit(ctx, {
    action: 'auth.login.failure',
    result: 'failure',
    entity: 'user',
    entityId: user ? String(user._id) : null,
    actor: user ? actorOf(user) : { userId: null, username, role: null },
    details: { reason },
  });
}

/**
 * First factor. Always answers with the same generic error and a similar response time for
 * unknown, disabled, locked or wrong-password cases; the real reason only goes to audit_logs.
 */
export async function verifyFirstFactor(username: string, password: string, ctx: AuditContext): Promise<IUser> {
  const user = await User.findOne({ username }).select('+passwordHash').lean();
  if (!user) {
    await spendDummyCompare(password);
    await auditLoginFailure(ctx, 'unknown_user', username);
    throw Errors.invalidCredentials();
  }
  if (user.status !== 'active') {
    await spendDummyCompare(password);
    await auditLoginFailure(ctx, 'disabled', username, user);
    throw Errors.invalidCredentials();
  }
  if (isLocked(user.lockedUntil)) {
    await spendDummyCompare(password);
    await auditLoginFailure(ctx, 'locked', username, user);
    throw Errors.invalidCredentials();
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    await auditLoginFailure(ctx, 'bad_password', username, user);
    await registerAuthFailure(user._id, ctx);
    throw Errors.invalidCredentials();
  }
  await appendAudit(ctx, {
    action: 'auth.password.success',
    result: 'success',
    entity: 'user',
    entityId: String(user._id),
    actor: actorOf(user),
  });
  return user;
}

/** Records a failed second factor and counts it towards the lockout (D-24). */
export async function recordSecondFactorFailure(
  userId: string,
  action: AuditAction,
  details: Record<string, unknown>,
  ctx: AuditContext,
): Promise<{ locked: boolean }> {
  await appendAudit(ctx, { action, result: 'failure', entity: 'user', entityId: userId, details });
  const locked = await registerAuthFailure(userId, ctx);
  return { locked };
}

export async function completeLogin(userId: string, method: SecondFactorMethod, ctx: AuditContext): Promise<void> {
  await User.updateOne(
    { _id: new Types.ObjectId(userId) },
    { $set: { failedLoginCount: 0, lastLoginAt: new Date(), lastLoginIp: ctx.ip } },
  );
  const successAction: AuditAction = method === 'webauthn' ? 'auth.mfa.webauthn.success' : 'auth.mfa.email.success';
  await appendAudit(
    ctx,
    { action: successAction, result: 'success', entity: 'user', entityId: userId },
    { action: 'auth.login.success', result: 'success', entity: 'user', entityId: userId, details: { method } },
  );
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ctx: AuditContext,
): Promise<void> {
  const user = await User.findById(userId).select('+passwordHash').lean();
  if (!user) {
    throw Errors.unauthenticated();
  }
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    await appendAudit(ctx, {
      action: 'auth.password.changed',
      result: 'failure',
      entity: 'user',
      entityId: userId,
      details: { reason: 'bad_current_password' },
    });
    await registerAuthFailure(user._id, ctx);
    throw Errors.badRequest('La contraseña actual no es correcta.');
  }
  const problems = checkPasswordPolicy(newPassword, user.username);
  if (problems.length > 0) {
    throw Errors.validation(problems.map((message) => ({ path: 'body.newPassword', message })));
  }
  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw Errors.validation([{ path: 'body.newPassword', message: 'Debe ser distinta de la actual.' }]);
  }
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date(), mustChangePassword: false } },
  );
  await appendAudit(ctx, { action: 'auth.password.changed', result: 'success', entity: 'user', entityId: userId });
  await notifyUser(user.email, 'contraseña cambiada', 'La contraseña de tu cuenta se cambió correctamente.');
}
