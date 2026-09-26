import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { appendAudit } from '../services/audit.service.js';
import { Errors } from '../utils/httpError.js';
import { verifyHs256 } from '../utils/jws.js';
import { auditContext } from '../utils/requestContext.js';

/**
 * Signed Netlify proxy (enabled when NETLIFY_PROXY_SECRET is set, i.e. in the deployment):
 * - every /api request must carry Netlify's `x-nf-sign` JWS (HS256 with the shared secret), so the
 *   API cannot be called directly on Render bypassing Netlify's origin, CSP and single-site cookie;
 * - only then is `x-nf-client-connection-ip` trusted as the client IP for the audit log and the
 *   rate limits (Netlify does not put it in X-Forwarded-For).
 * The health check stays open for Render's monitor.
 */
export async function netlifyProxy(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const secret = env.NETLIFY_PROXY_SECRET;
  if (!secret || req.path === '/health') {
    next();
    return;
  }
  const token = req.get('x-nf-sign');
  const claims = token ? verifyHs256(token, secret) : null;
  const exp = typeof claims?.exp === 'number' ? claims.exp : null;
  const valid =
    claims !== null &&
    claims.iss === 'netlify' &&
    (exp === null || exp * 1000 > Date.now()) &&
    (claims.site_url === undefined || claims.site_url === env.CLIENT_ORIGIN);

  if (!valid) {
    await appendAudit(auditContext(req), {
      action: 'security.origin.rejected',
      result: 'denied',
      details: { reason: token ? 'invalid_proxy_signature' : 'missing_proxy_signature', path: req.path },
    });
    next(Errors.forbidden());
    return;
  }
  const clientIp = req.get('x-nf-client-connection-ip');
  if (clientIp && isIP(clientIp)) req.clientIp = clientIp;
  next();
}
