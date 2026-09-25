import { describe, expect, it } from 'vitest';
import { demoEmail } from '../../scripts/lib/seedData.js';
import { EnvSchema } from '../../src/config/env.js';
import { BREVO_ENDPOINT, parseSender, sendViaBrevo } from '../../src/services/brevo.js';

const PRODUCTION = {
  NODE_ENV: 'production',
  CLIENT_ORIGIN: 'https://farmacentro.netlify.app',
  MONGODB_URI: 'mongodb+srv://farmacentro_api@cluster.example/farmacentro',
  SESSION_SECRET: 'x'.repeat(48),
  DATA_ENC_KEY_V1: Buffer.alloc(32).toString('base64'),
  BLIND_INDEX_KEY: Buffer.alloc(32).toString('base64'),
  OTP_HMAC_KEY: Buffer.alloc(32).toString('base64'),
  RP_ID: 'farmacentro.netlify.app',
};

describe('production e-mail through Brevo', () => {
  it('requires an API key when MAIL_TRANSPORT=brevo and rejects the console transport', () => {
    expect(EnvSchema.safeParse({ ...PRODUCTION, MAIL_TRANSPORT: 'brevo' }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...PRODUCTION, MAIL_TRANSPORT: 'brevo', BREVO_API_KEY: 'k'.repeat(40) }).success).toBe(true);
    expect(EnvSchema.safeParse({ ...PRODUCTION, MAIL_TRANSPORT: 'console' }).success).toBe(false);
  });

  it('requires RP_ID to be the hostname of CLIENT_ORIGIN (WebAuthn)', () => {
    const base = { ...PRODUCTION, MAIL_TRANSPORT: 'brevo', BREVO_API_KEY: 'k'.repeat(40) };
    expect(EnvSchema.safeParse({ ...base, RP_ID: 'farmacentro-api.onrender.com' }).success).toBe(false);
    expect(EnvSchema.safeParse(base).success).toBe(true);
  });

  it('parses the sender', () => {
    expect(parseSender('FarmaCentro <equipo@gmail.com>')).toEqual({ name: 'FarmaCentro', email: 'equipo@gmail.com' });
    expect(parseSender('equipo@gmail.com')).toEqual({ name: 'FarmaCentro', email: 'equipo@gmail.com' });
  });

  it('calls the Brevo API and never leaks the key or the body in errors', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 201 });
    }) as unknown as typeof fetch;
    await sendViaBrevo('secret-key-1234567890', { name: 'FarmaCentro', email: 'a@b.com' }, { to: 'c@d.com', subject: 'S', text: 'código 123456' }, ok);
    expect(calls[0]?.url).toBe(BREVO_ENDPOINT);
    expect((calls[0]?.init.headers as Record<string, string>)['api-key']).toBe('secret-key-1234567890');
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ to: [{ email: 'c@d.com' }], textContent: 'código 123456' });

    const failing = (async () => new Response('bad', { status: 401 })) as unknown as typeof fetch;
    const error = await sendViaBrevo('secret-key-1234567890', { name: 'F', email: 'a@b.com' }, { to: 'c@d.com', subject: 'S', text: 'código 123456' }, failing).catch((e: Error) => e);
    expect(String(error)).toContain('HTTP 401');
    expect(String(error)).not.toContain('secret-key');
    expect(String(error)).not.toContain('123456');
  });
});

describe('demo users in the deployed environment', () => {
  it('uses sub-addresses of the team mailbox so codes can really be delivered', () => {
    expect(demoEmail('regente', undefined)).toBe('regente@farmacentro.test');
    expect(demoEmail('regente', 'Equipo.FarmaCentro@gmail.com')).toBe('equipo.farmacentro+regente@gmail.com');
    expect(() => demoEmail('regente', 'no-es-correo')).toThrow();
  });
});
