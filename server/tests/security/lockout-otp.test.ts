import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/models/AuditLog.js';
import { EmailOtp } from '../../src/models/EmailOtp.js';
import { User } from '../../src/models/User.js';
import { sentMail } from '../../src/services/mail.service.js';
import {
  closeDatabase,
  createTestUser,
  getApp,
  lastCodeFor,
  resetDatabase,
  TestClient,
} from '../helpers/app.js';

async function wrongPassword(client: TestClient, username: string) {
  return client.post('/api/auth/login', { username, password: 'contraseña-incorrecta' });
}

describe('account lockout (5 attempts → 15 minutes)', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });
  afterAll(closeDatabase);

  it('locks after 5 failures, rejects the right password while locked and notifies the user', async () => {
    const user = await createTestUser('cajero');
    const client = new TestClient(await getApp());
    for (let i = 0; i < 5; i += 1) {
      expect((await wrongPassword(client, user.username)).status).toBe(401);
    }
    const stored = await User.findById(user.id).lean();
    const minutes = ((stored?.lockedUntil?.getTime() ?? 0) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);

    const correct = await client.post('/api/auth/login', { username: user.username, password: user.password });
    expect(correct.status).toBe(401);
    expect(correct.body.error.message).toBe((await wrongPassword(client, user.username)).body.error.message);
    expect(await AuditLog.countDocuments({ action: 'auth.account.locked' })).toBe(1);
    expect(await AuditLog.exists({ action: 'auth.login.failure', 'details.reason': 'locked' })).toBeTruthy();
    expect(sentMail.some((m) => m.to === user.email && /bloquead/.test(m.subject))).toBe(true);

    // After the 15 minutes the user can log in again.
    await User.updateOne({ _id: user.id }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await client.post('/api/auth/login', { username: user.username, password: user.password })).status).toBe(200);
  });

  it('counts failed second-factor codes towards the lockout', async () => {
    const user = await createTestUser('cajero');
    const client = new TestClient(await getApp());
    await client.post('/api/auth/login', { username: user.username, password: user.password });
    await client.post('/api/auth/email-otp/send');
    for (let i = 0; i < 5; i += 1) {
      await client.post('/api/auth/email-otp/verify', { code: '000000' === lastCodeFor(user.email) ? '111111' : '000000' });
    }
    const stored = await User.findById(user.id).lean();
    expect(stored?.lockedUntil?.getTime() ?? 0).toBeGreaterThan(Date.now());
  });
});

describe('e-mailed one-time codes', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });

  it('stores only an HMAC of the code, never the code', async () => {
    const user = await createTestUser('regente');
    const client = new TestClient(await getApp());
    await client.post('/api/auth/login', { username: user.username, password: user.password });
    await client.post('/api/auth/email-otp/send');
    const code = lastCodeFor(user.email);
    const stored = await EmailOtp.collection.findOne({});
    expect(JSON.stringify(stored)).not.toContain(code);
    expect(stored?.codeHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('expires after 5 minutes', async () => {
    const user = await createTestUser('regente');
    const client = new TestClient(await getApp());
    await client.post('/api/auth/login', { username: user.username, password: user.password });
    const sent = await client.post('/api/auth/email-otp/send');
    const minutes = (Date.parse(sent.body.expiresAt) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(4.9);
    expect(minutes).toBeLessThanOrEqual(5);
    await EmailOtp.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await client.post('/api/auth/email-otp/verify', { code: lastCodeFor(user.email) })).status).toBe(401);
  });

  it('can be used only once', async () => {
    const user = await createTestUser('regente');
    const client = new TestClient(await getApp());
    await client.post('/api/auth/login', { username: user.username, password: user.password });
    await client.post('/api/auth/email-otp/send');
    const code = lastCodeFor(user.email);
    expect((await client.post('/api/auth/email-otp/verify', { code })).status).toBe(200);

    const again = new TestClient(await getApp());
    await again.post('/api/auth/login', { username: user.username, password: user.password });
    expect((await again.post('/api/auth/email-otp/verify', { code })).status).toBe(401);
  });

  it('is invalidated after 5 wrong attempts and the user is notified', async () => {
    const user = await createTestUser('bodeguero');
    await User.updateOne({ _id: user.id }, { $set: { failedLoginCount: -100 } }); // isolate from the lockout
    const client = new TestClient(await getApp());
    await client.post('/api/auth/login', { username: user.username, password: user.password });
    await client.post('/api/auth/email-otp/send');
    const code = lastCodeFor(user.email);
    const wrong = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i += 1) {
      await client.post('/api/auth/email-otp/verify', { code: wrong });
    }
    expect((await client.post('/api/auth/email-otp/verify', { code })).status).toBe(401);
    expect(await AuditLog.exists({ action: 'auth.mfa.email.exhausted' })).toBeTruthy();
    expect(sentMail.some((m) => m.to === user.email && /intentos/.test(m.subject))).toBe(true);
  });
});
