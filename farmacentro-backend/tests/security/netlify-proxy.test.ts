import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Enables the signed Netlify proxy for this file only.
const SECRET = vi.hoisted(() => {
  const secret = 'test-netlify-proxy-secret-0123456789abcdef';
  process.env.NETLIFY_PROXY_SECRET = secret;
  return secret;
});

const { AuditLog } = await import('../../src/models/AuditLog.js');
const { closeDatabase, getApp, ORIGIN, resetDatabase, TestClient } = await import('../helpers/app.js');

function sign(claims: Record<string, unknown>, secret = SECRET): string {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

const validClaims = () => ({
  iss: 'netlify',
  site_url: ORIGIN,
  deploy_context: 'production',
  exp: Math.floor(Date.now() / 1000) + 60,
});

const login = (client: InstanceType<typeof TestClient>, headers: Record<string, string>) =>
  client.send('post', '/api/auth/login', { username: 'nadie', password: 'x'.repeat(12) }, headers);

describe('signed Netlify proxy', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });
  afterAll(closeDatabase);

  it('rejects API calls that do not come through Netlify, except the health check', async () => {
    const client = new TestClient(await getApp());
    expect((await client.get('/api/health')).status).toBe(200);
    const direct = await login(client, {});
    expect(direct.status).toBe(403);
    expect(await AuditLog.exists({ action: 'security.origin.rejected', 'details.reason': 'missing_proxy_signature' })).toBeTruthy();
  });

  it('rejects forged, expired or foreign-site signatures', async () => {
    const client = new TestClient(await getApp());
    const bad = [
      sign(validClaims(), 'otro-secreto-que-no-es-el-de-netlify-123456'),
      sign({ ...validClaims(), exp: Math.floor(Date.now() / 1000) - 5 }),
      sign({ ...validClaims(), iss: 'otro' }),
      sign({ ...validClaims(), site_url: 'https://evil.netlify.app' }),
      'no.es.un.jws',
    ];
    for (const token of bad) {
      expect((await login(client, { 'x-nf-sign': token })).status).toBe(403);
    }
  });

  it('accepts signed requests and records the client IP sent by Netlify', async () => {
    const client = new TestClient(await getApp());
    const res = await login(client, { 'x-nf-sign': sign(validClaims()), 'x-nf-client-connection-ip': '190.14.139.245' });
    expect(res.status).toBe(401); // reaches the login: unknown user
    const entry = await AuditLog.findOne({ action: 'auth.login.failure' }).lean();
    expect(entry?.ip).toBe('190.14.139.245');
  });

  it('ignores a client IP header that is not a valid address', async () => {
    const client = new TestClient(await getApp());
    await login(client, { 'x-nf-sign': sign(validClaims()), 'x-nf-client-connection-ip': '1.2.3.4, 5.6.7.8' });
    const entry = await AuditLog.findOne({ action: 'auth.login.failure' }).lean();
    expect(entry?.ip).not.toBe('1.2.3.4, 5.6.7.8');
  });
});
