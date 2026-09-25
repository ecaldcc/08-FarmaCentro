import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { appendAudit } from '../services/audit.service.js';
import { HttpError, Errors } from '../utils/httpError.js';
import { auditContext } from '../utils/requestContext.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

/**
 * Origin verification for state-changing requests (CLAUDE.md, "Seguridad web").
 * The Origin header (or, if absent, the Referer) must match CLIENT_ORIGIN exactly.
 */
export async function verifyOrigin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!UNSAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const origin = req.get('origin');
  const referer = req.get('referer');
  let allowed = false;
  if (origin) {
    allowed = origin === env.CLIENT_ORIGIN;
  } else if (referer) {
    allowed = referer === env.CLIENT_ORIGIN || referer.startsWith(`${env.CLIENT_ORIGIN}/`);
  }
  if (allowed) {
    next();
    return;
  }
  await appendAudit(auditContext(req), {
    action: 'security.origin.rejected',
    result: 'denied',
    details: { method: req.method, path: req.path, origin: origin?.slice(0, 100) ?? null },
  });
  next(Errors.forbidden());
}

/** Rejects bodies that are not JSON on POST/PUT/PATCH (415). */
export function requireJson(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (!req.is('application/json')) {
      next(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'El contenido debe enviarse como JSON.'));
      return;
    }
  }
  next();
}
