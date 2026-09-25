import { z } from 'zod';

const base64Key32 = z
  .string()
  .refine((value) => Buffer.from(value, 'base64').length === 32, {
    message: 'must be 32 bytes encoded in base64',
  });

const boolFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    CLIENT_ORIGIN: z.url(),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//),
    SESSION_SECRET: z.string().min(32),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(15).default(15),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(0).max(24).default(8),
    DATA_ENC_ACTIVE_VERSION: z.coerce.number().int().min(1).default(1),
    DATA_ENC_KEY_V1: base64Key32,
    BLIND_INDEX_KEY: base64Key32,
    OTP_HMAC_KEY: base64Key32,
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
    RP_ID: z.string().min(1),
    RP_NAME: z.string().min(1).default('FarmaCentro'),
    MAIL_TRANSPORT: z.enum(['smtp', 'brevo', 'console', 'memory']).default('smtp'),
    BREVO_API_KEY: z.string().min(20).optional(),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_SECURE: boolFromString.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('FarmaCentro <no-reply@farmacentro.local>'),
    STEP_UP_ALLOW_EMAIL: boolFromString.default(true),
    OTP_RESEND_SECONDS: z.coerce.number().int().min(0).max(600).default(60),
    RATE_LIMIT_FACTOR: z.coerce.number().int().min(1).max(1000).default(1),
    SERVE_CLIENT: boolFromString.default(false),
    CLIENT_DIST: z.string().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((env, ctx) => {
    // bcrypt cost must be >= 12 outside of automated tests (CLAUDE.md, control 5.17).
    if (env.NODE_ENV !== 'test' && env.BCRYPT_COST < 12) {
      ctx.addIssue({ code: 'custom', path: ['BCRYPT_COST'], message: 'must be >= 12' });
    }
    // Relaxed throttling exists only so the automated tests can log in many times.
    if (env.NODE_ENV !== 'test' && (env.OTP_RESEND_SECONDS < 60 || env.RATE_LIMIT_FACTOR !== 1)) {
      ctx.addIssue({ code: 'custom', path: ['OTP_RESEND_SECONDS'], message: 'throttling can only be relaxed in tests' });
    }
    // WebAuthn only works when the RP ID is the domain the browser is on.
    if (URL.canParse(env.CLIENT_ORIGIN) && new URL(env.CLIENT_ORIGIN).hostname !== env.RP_ID) {
      ctx.addIssue({ code: 'custom', path: ['RP_ID'], message: 'must be the hostname of CLIENT_ORIGIN' });
    }
    if (env.MAIL_TRANSPORT === 'brevo' && !env.BREVO_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['BREVO_API_KEY'], message: 'required when MAIL_TRANSPORT=brevo' });
    }
    // The console transport prints codes to the terminal: only for local development.
    if (env.NODE_ENV !== 'development' && env.MAIL_TRANSPORT === 'console') {
      ctx.addIssue({ code: 'custom', path: ['MAIL_TRANSPORT'], message: 'console is only allowed in development' });
    }
    // The in-memory mail transport never delivers mail; allow it only in tests.
    if (env.NODE_ENV !== 'test' && env.MAIL_TRANSPORT === 'memory') {
      ctx.addIssue({ code: 'custom', path: ['MAIL_TRANSPORT'], message: 'memory is only allowed in tests' });
    }
  });

export type Env = z.infer<typeof EnvSchema> & { dataKeys: Map<number, Buffer> };

function loadDataKeys(source: NodeJS.ProcessEnv): Map<number, Buffer> {
  const keys = new Map<number, Buffer>();
  for (const [name, value] of Object.entries(source)) {
    const match = /^DATA_ENC_KEY_V(\d+)$/.exec(name);
    if (match?.[1] && value) {
      const key = Buffer.from(value, 'base64');
      if (key.length !== 32) {
        throw new Error(`${name} must be 32 bytes encoded in base64`);
      }
      keys.set(Number(match[1]), key);
    }
  }
  return keys;
}

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Only variable names are printed, never their values.
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
  }
  const dataKeys = loadDataKeys(process.env);
  if (!dataKeys.has(parsed.data.DATA_ENC_ACTIVE_VERSION)) {
    throw new Error('DATA_ENC_ACTIVE_VERSION points to a missing DATA_ENC_KEY_V<n>');
  }
  return { ...parsed.data, dataKeys };
}

export const env: Env = loadEnv();
