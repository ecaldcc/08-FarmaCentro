import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../config/env.js';
import type { Role } from '../domain/roles.js';
import { User } from '../models/User.js';
import { appendAudit } from '../services/audit.service.js';
import { Errors } from '../utils/httpError.js';
import { auditContext, destroySession } from '../utils/requestContext.js';

const MFA_PENDING_MS = 5 * 60 * 1000;

export function sessionExpiresAt(): string {
  return new Date(Date.now() + env.SESSION_IDLE_MINUTES * 60 * 1000).toISOString();
}

/**
 * Reloads the user on every request so that role changes and deactivations take effect
 * immediately (docs/arquitectura.md §4, step 9). Also enforces the MFA-pending window and the
 * absolute session lifetime (decision D-21).
 */
export async function loadUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { userId, authStage } = req.session;
  if (!userId || !authStage) {
    next();
    return;
  }
  const now = Date.now();
  const mfaExpired = authStage === 'password' && now - (req.session.passwordVerifiedAt ?? 0) > MFA_PENDING_MS;
  const absoluteExpired =
    authStage === 'authenticated' &&
    env.SESSION_ABSOLUTE_HOURS > 0 &&
    now - (req.session.authenticatedAt ?? 0) > env.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000;

  const user = mfaExpired || absoluteExpired ? null : await User.findById(userId).lean();
  if (!user || user.status !== 'active') {
    await destroySession(req);
    next();
    return;
  }
  req.user = {
    id: String(user._id),
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
  if (authStage === 'authenticated') {
    // The session is rolling: every request pushes the expiry forward. The header lets the
    // client schedule the inactivity warning without polling.
    res.setHeader('X-Session-Expires-At', sessionExpiresAt());
  }
  next();
}

/** Only for the second-factor endpoints of the login flow. */
export function requirePasswordStage(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || req.session.authStage !== 'password') {
    next(Errors.unauthenticated());
    return;
  }
  next();
}

export function requireAuth(options: { allowPasswordChange?: boolean } = {}): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(Errors.unauthenticated());
      return;
    }
    if (req.session.authStage !== 'authenticated') {
      next(Errors.mfaRequired());
      return;
    }
    if (req.user.mustChangePassword && !options.allowPasswordChange) {
      next(Errors.passwordChangeRequired());
      return;
    }
    next();
  };
}

/** Role-based authorization enforced in the backend (controls 5.15, 5.18). */
export function requireRole(...roles: Role[]): RequestHandler {
  return async (req, _res, next) => {
    if (req.user && roles.includes(req.user.role)) {
      next();
      return;
    }
    await appendAudit(auditContext(req), {
      action: 'authz.denied',
      result: 'denied',
      details: { method: req.method, path: req.baseUrl + req.path, requiredRoles: roles },
    });
    next(Errors.forbidden());
  };
}
