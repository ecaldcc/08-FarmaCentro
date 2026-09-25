import { randomBytes } from 'node:crypto';

// Test-only configuration. Keys are random per run; nothing here is a real secret.
const key = () => randomBytes(32).toString('base64');

process.env.NODE_ENV = 'test';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.DATA_ENC_ACTIVE_VERSION = '1';
process.env.DATA_ENC_KEY_V1 ??= key();
process.env.BLIND_INDEX_KEY ??= key();
process.env.OTP_HMAC_KEY ??= key();
process.env.BCRYPT_COST = '4';
process.env.RP_ID = 'localhost';
process.env.RP_NAME = 'FarmaCentro';
process.env.MAIL_TRANSPORT = 'memory';
process.env.STEP_UP_ALLOW_EMAIL = 'true';
process.env.OTP_RESEND_SECONDS ??= '0';
process.env.RATE_LIMIT_FACTOR ??= '100';
process.env.LOG_LEVEL = 'silent';
