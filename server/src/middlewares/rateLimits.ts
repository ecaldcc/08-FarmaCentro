import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import rateLimit, { type Options } from 'express-rate-limit';
import { appendAudit } from '../services/audit.service.js';
import { Errors } from '../utils/httpError.js';
import { auditContext } from '../utils/requestContext.js';

async function onLimitReached(req: Request, res: Response, _next: unknown, options: Options): Promise<void> {
  await appendAudit(auditContext(req), {
    action: 'security.rate_limited',
    result: 'denied',
    details: { path: req.baseUrl + req.path, limit: options.limit },
  });
  const error = Errors.rateLimited();
  res.status(429).json({ error: { code: error.code, message: error.message, requestId: req.requestId } });
}

function limiter(windowMinutes: number, limit: number) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: limit * env.RATE_LIMIT_FACTOR,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: onLimitReached,
  });
}

// Memory store: valid for a single API instance (decision D-09).
export const loginLimiter = limiter(15, 10);
export const mfaLimiter = limiter(15, 10);
export const otpSendLimiter = limiter(15, 5);
export const apiLimiter = limiter(5, 300);
