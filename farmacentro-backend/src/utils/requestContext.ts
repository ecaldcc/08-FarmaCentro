import type { Request } from 'express';
import type { AuditContext } from '../services/audit.service.js';

/** Audit context for the current request (actor, IP, user agent, request id). */
export function auditContext(req: Request): AuditContext {
  return {
    actor: req.user ? { userId: req.user.id, username: req.user.username, role: req.user.role } : null,
    ip: req.clientIp ?? req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
    requestId: req.requestId ?? null,
  };
}

export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

export function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve) => {
    req.session.destroy(() => resolve());
  });
}
