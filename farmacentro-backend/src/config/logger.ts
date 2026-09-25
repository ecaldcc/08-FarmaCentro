import pino from 'pino';
import { env } from './env.js';

// Technical log (not the audit log). Secrets and personal data are redacted.
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.temporaryPassword',
      '*.code',
      '*.passwordHash',
      '*.codeHash',
    ],
    censor: '[REDACTED]',
  },
});
