import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/models/AuditLog.js';
import { User } from '../../src/models/User.js';
import { verifyAuditChain } from '../../src/services/audit.service.js';
import {
  closeDatabase,
  createTestUser,
  getApp,
  lastCodeFor,
  loginWithEmail,
  resetDatabase,
  TestClient,
} from '../helpers/app.js';

describe('login with password + e-mailed code', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });
  afterAll(closeDatabase);

  it('completes the two-step login and issues a hardened session cookie', async () => {
    const user = await createTestUser('cajero');
    const client = new TestClient(await getApp());

    const first = await client.post('/api/auth/login', { username: user.username, password: user.password });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ next: 'mfa', methods: ['email'] });
    const passwordStageCookie = client.cookie;
    expect(client.lastSetCookie).toMatch(/HttpOnly/i);
    expect(client.lastSetCookie).toMatch(/Secure/i);
    expect(client.lastSetCookie).toMatch(/SameSite=Strict/i);

    // Only the second-factor endpoints are reachable before completing MFA.
    const blocked = await client.get('/api/auth/me');
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe('MFA_REQUIRED');

    const sent = await client.post('/api/auth/email-otp/send');
    expect(sent.status).toBe(200);
    expect(sent.body.sentTo).toMatch(/^c\*\*\*@/);
    expect(JSON.stringify(sent.body)).not.toMatch(/\d{6}/);

    const verified = await client.post('/api/auth/email-otp/verify', { code: lastCodeFor(user.email) });
    expect(verified.status).toBe(200);
    expect(verified.body.user.role).toBe('cajero');
    // Session id is regenerated after the second factor.
    expect(client.cookie).toBeDefined();
    expect(client.cookie).not.toBe(passwordStageCookie);

    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.headers['x-session-expires-at']).toBeDefined();
  });

  it('answers the same generic error for unknown user and wrong password', async () => {
    const user = await createTestUser('cajero');
    const client = new TestClient(await getApp());
    const unknown = await client.post('/api/auth/login', { username: 'nadie', password: 'x'.repeat(12) });
    const wrong = await client.post('/api/auth/login', { username: user.username, password: 'x'.repeat(12) });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');

    const failures = await AuditLog.find({ action: 'auth.login.failure' }).lean();
    expect(failures.map((f) => f.details.reason).sort()).toEqual(['bad_password', 'unknown_user']);
  });

  it('rejects a code that was replaced by a newer one (single valid code)', async () => {
    const user = await createTestUser('bodeguero');
    const client = new TestClient(await getApp());
    await client.post('/api/auth/login', { username: user.username, password: user.password });
    await client.post('/api/auth/email-otp/send');
    const oldCode = lastCodeFor(user.email);
    await client.post('/api/auth/email-otp/send');
    const newCode = lastCodeFor(user.email);
    if (oldCode !== newCode) {
      const res = await client.post('/api/auth/email-otp/verify', { code: oldCode });
      expect(res.status).toBe(401);
    }
    const ok = await client.post('/api/auth/email-otp/verify', { code: newCode });
    expect(ok.status).toBe(200);
  });

  it('logs out and destroys the server-side session', async () => {
    const user = await createTestUser('auditor');
    const client = await loginWithEmail(user);
    const stolenCookie = client.cookie;
    const out = await client.post('/api/auth/logout');
    expect(out.status).toBe(204);

    const replay = new TestClient(await getApp());
    replay.cookie = stolenCookie;
    expect((await replay.get('/api/auth/me')).status).toBe(401);
  });

  it('writes every login event to a valid hash chain', async () => {
    const user = await createTestUser('regente');
    await loginWithEmail(user);
    const actions = (await AuditLog.find().sort({ seq: 1 }).lean()).map((e) => e.action);
    expect(actions).toEqual([
      'auth.password.success',
      'auth.mfa.email.sent',
      'auth.mfa.email.success',
      'auth.login.success',
    ]);
    const chain = await verifyAuditChain();
    expect(chain.ok).toBe(true);
    expect(chain.checked).toBe(4);
    const stored = await User.findById(user.id).lean();
    expect(stored?.lastLoginAt).toBeInstanceOf(Date);
  });
});
