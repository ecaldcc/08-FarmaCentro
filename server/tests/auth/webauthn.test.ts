import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/models/AuditLog.js';
import { WebAuthnCredential } from '../../src/models/WebAuthnCredential.js';
import {
  closeDatabase,
  createTestUser,
  getApp,
  loginWithEmail,
  ORIGIN,
  resetDatabase,
  stepUpWithEmail,
  TestClient,
  type TestUser,
} from '../helpers/app.js';
import { SoftAuthenticator } from '../helpers/softAuthenticator.js';

async function registerFingerprint(user: TestUser, authenticator: SoftAuthenticator) {
  const client = await loginWithEmail(user);
  await stepUpWithEmail(client, user, 'webauthn.register', null);
  const options = await client.post('/api/me/webauthn/register/options', { nickname: 'Caja 1' });
  expect(options.status).toBe(200);
  expect(options.body.authenticatorSelection.userVerification).toBe('required');
  const verify = await client.post('/api/me/webauthn/register/verify', { response: authenticator.register(options.body) });
  expect(verify.status).toBe(201);
  return client;
}

describe('WebAuthn (fingerprint) second factor', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });
  afterAll(closeDatabase);

  it('requires step-up to register a fingerprint', async () => {
    const user = await createTestUser('regente');
    const client = await loginWithEmail(user);
    const res = await client.post('/api/me/webauthn/register/options', { nickname: 'Caja 1' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STEP_UP_REQUIRED');
  });

  it('registers a fingerprint and logs in with it', async () => {
    const user = await createTestUser('regente');
    const authenticator = new SoftAuthenticator(ORIGIN, 'localhost');
    await registerFingerprint(user, authenticator);
    expect(await WebAuthnCredential.countDocuments({ revokedAt: null })).toBe(1);

    const client = new TestClient(await getApp());
    const login = await client.post('/api/auth/login', { username: user.username, password: user.password });
    expect(login.body.methods).toEqual(['webauthn', 'email']);
    const options = await client.post('/api/auth/webauthn/login/options');
    expect(options.body.userVerification).toBe('required');
    const verify = await client.post('/api/auth/webauthn/login/verify', {
      response: authenticator.authenticate(options.body),
    });
    expect(verify.status).toBe(200);
    expect(verify.body.user.hasWebAuthn).toBe(true);
    expect(await AuditLog.exists({ action: 'auth.mfa.webauthn.success' })).toBeTruthy();
  });

  it('rejects an assertion without user verification (no fingerprint)', async () => {
    const user = await createTestUser('cajero');
    const good = new SoftAuthenticator(ORIGIN, 'localhost');
    await registerFingerprint(user, good);
    const noUv = good.withoutUserVerification();

    const client = new TestClient(await getApp());
    await client.post('/api/auth/login', { username: user.username, password: user.password });
    const options = await client.post('/api/auth/webauthn/login/options');
    const verify = await client.post('/api/auth/webauthn/login/verify', { response: noUv.authenticate(options.body) });
    expect(verify.status).toBe(401);
  });

  it('rejects a replayed challenge and a counter that goes backwards', async () => {
    const user = await createTestUser('cajero');
    const authenticator = new SoftAuthenticator(ORIGIN, 'localhost');
    await registerFingerprint(user, authenticator);

    const client = new TestClient(await getApp());
    await client.post('/api/auth/login', { username: user.username, password: user.password });
    const options = await client.post('/api/auth/webauthn/login/options');
    const assertion = authenticator.authenticate(options.body, { counter: 10 });
    expect((await client.post('/api/auth/webauthn/login/verify', { response: assertion })).status).toBe(200);

    const second = new TestClient(await getApp());
    await second.post('/api/auth/login', { username: user.username, password: user.password });
    // Replay of the old assertion: its challenge is not the one stored in this session.
    expect((await second.post('/api/auth/webauthn/login/verify', { response: assertion })).status).toBe(401);
    const fresh = await second.post('/api/auth/webauthn/login/options');
    const cloned = authenticator.authenticate(fresh.body, { counter: 5 });
    expect((await second.post('/api/auth/webauthn/login/verify', { response: cloned })).status).toBe(401);
    expect(await AuditLog.exists({ action: 'webauthn.counter.anomaly' })).toBeTruthy();
  });

  it('grants a single-use step-up with the fingerprint', async () => {
    const user = await createTestUser('regente');
    const authenticator = new SoftAuthenticator(ORIGIN, 'localhost');
    const client = await registerFingerprint(user, authenticator);
    const credential = await WebAuthnCredential.findOne().lean();
    const id = String(credential?._id);

    const options = await client.post('/api/auth/step-up/webauthn/options', { action: 'webauthn.revoke', targetId: id });
    expect(options.status).toBe(200);
    const granted = await client.post('/api/auth/step-up/webauthn/verify', {
      response: authenticator.authenticate(options.body),
    });
    expect(granted.status).toBe(200);
    expect((await client.delete(`/api/me/webauthn/credentials/${id}`)).status).toBe(204);
    const entry = await AuditLog.findOne({ action: 'auth.stepup.granted' }).sort({ seq: -1 }).lean();
    expect(entry?.details).toMatchObject({ method: 'webauthn', stepUpAction: 'webauthn.revoke' });
  });
});
