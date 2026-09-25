import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/models/AuditLog.js';
import {
  closeDatabase,
  createTestUser,
  getApp,
  loginWithEmail,
  ORIGIN,
  resetDatabase,
  TestClient,
} from '../helpers/app.js';

describe('web security controls', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });
  afterAll(closeDatabase);

  it('sends security headers with a restrictive CSP', async () => {
    const res = await request(await getApp()).get('/api/health');
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('rejects state-changing requests without a trusted Origin', async () => {
    const user = await createTestUser('cajero');
    const noOrigin = new TestClient(await getApp(), null);
    expect((await noOrigin.post('/api/auth/login', { username: user.username, password: user.password })).status).toBe(403);
    const evil = new TestClient(await getApp(), 'https://evil.example');
    expect((await evil.post('/api/auth/login', { username: user.username, password: user.password })).status).toBe(403);
    expect(await AuditLog.countDocuments({ action: 'security.origin.rejected' })).toBe(2);
  });

  it('accepts a same-origin Referer when the Origin header is absent', async () => {
    const user = await createTestUser('cajero');
    const client = new TestClient(await getApp(), null);
    const res = await client.send('post', '/api/auth/login', { username: user.username, password: user.password }, {
      Referer: `${ORIGIN}/login`,
    });
    expect(res.status).toBe(200);
  });

  it('restricts CORS to the client origin', async () => {
    const app = await getApp();
    const good = await request(app).options('/api/auth/login').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'POST');
    expect(good.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(good.headers['access-control-allow-credentials']).toBe('true');
    const bad = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });

  it('returns generic errors without stack traces or internals', async () => {
    const app = await getApp();
    const malformed = await request(app)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{"username": "a", ');
    expect(malformed.status).toBe(400);
    expect(JSON.stringify(malformed.body)).not.toMatch(/stack|at .*\.js|SyntaxError|node_modules/);

    const notJson = await request(app).post('/api/auth/login').set('Origin', ORIGIN).set('Content-Type', 'text/plain').send('x');
    expect(notJson.status).toBe(415);

    const tooLarge = await request(app)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'a'.repeat(200_000), password: 'x' }));
    expect(tooLarge.status).toBe(413);

    const missing = await request(app).get('/api/no-existe');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toEqual({ code: 'NOT_FOUND', message: expect.any(String), requestId: expect.any(String) });
  });

  it('never returns password hashes', async () => {
    const admin = await createTestUser('admin');
    const client = await loginWithEmail(admin);
    const list = await client.get('/api/users');
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    const report = await (await loginWithEmail(await createTestUser('auditor'))).get('/api/reports/users-roles');
    expect(JSON.stringify(report.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });
});
