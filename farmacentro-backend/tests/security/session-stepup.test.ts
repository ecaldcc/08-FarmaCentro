import mongoose from 'mongoose';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { User } from '../../src/models/User.js';
import {
  closeDatabase,
  createTestUser,
  getApp,
  loginWithEmail,
  resetDatabase,
  stepUpWithEmail,
  TestClient,
} from '../helpers/app.js';

function sessions() {
  return mongoose.connection.db!.collection<{ _id: string; session: string; expires: Date }>('sessions');
}

async function editSession(mutate: (data: Record<string, unknown>) => void) {
  const doc = await sessions().findOne({});
  const data = JSON.parse(doc!.session) as Record<string, unknown>;
  mutate(data);
  await sessions().updateOne({ _id: doc!._id }, { $set: { session: JSON.stringify(data) } });
}

describe('server-side sessions (5.17, 8.5)', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });
  afterAll(closeDatabase);

  it('issues a 15-minute rolling cookie and stores the session in MongoDB', async () => {
    const client = await loginWithEmail(await createTestUser('cajero'));
    const expires = Date.parse(/Expires=([^;]+)/i.exec(client.lastSetCookie ?? '')?.[1] ?? '');
    const cookieMinutes = (expires - Date.now()) / 60_000;
    expect(cookieMinutes).toBeGreaterThan(14);
    expect(cookieMinutes).toBeLessThanOrEqual(15);
    const doc = await sessions().findOne({});
    const ttlMinutes = (doc!.expires.getTime() - Date.now()) / 60_000;
    expect(ttlMinutes).toBeGreaterThan(14);
    expect(ttlMinutes).toBeLessThanOrEqual(15);
    expect(doc!.session).not.toMatch(/password|codeHash/i);
  });

  it('expires after 15 minutes of inactivity', async () => {
    const client = await loginWithEmail(await createTestUser('cajero'));
    expect((await client.get('/api/auth/me')).status).toBe(200);
    // Simulate 15 minutes without requests: the stored session is past its expiry.
    await sessions().updateMany({}, { $set: { expires: new Date(Date.now() - 1000) } });
    const res = await client.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('ends the session when the absolute lifetime (8 h) is exceeded', async () => {
    const client = await loginWithEmail(await createTestUser('cajero'));
    await editSession((data) => {
      data.authenticatedAt = Date.now() - 9 * 60 * 60 * 1000;
    });
    expect((await client.get('/api/auth/me')).status).toBe(401);
  });

  it('regenerates the session id at login (no session fixation)', async () => {
    const user = await createTestUser('cajero');
    const client = new TestClient(await getApp());
    // Attacker-provided cookie before login
    client.cookie = 'fc.sid=s%3Aattacker-chosen-id.invalidsignature';
    await client.post('/api/auth/login', { username: user.username, password: user.password });
    expect(client.cookie).toBeDefined();
    expect(client.cookie).not.toContain('attacker-chosen-id');
  });

  it('applies a role change or deactivation on the very next request', async () => {
    const user = await createTestUser('regente');
    const client = await loginWithEmail(user);
    expect((await client.get('/api/prescriptions')).status).toBe(200);
    await User.updateOne({ _id: user.id }, { $set: { role: 'cajero' } });
    expect((await client.get('/api/prescriptions')).status).toBe(403);
    await User.updateOne({ _id: user.id }, { $set: { status: 'disabled' } });
    expect((await client.get('/api/auth/me')).status).toBe(401);
  });

  it('forces a password change before anything else when required', async () => {
    const user = await createTestUser('bodeguero', { mustChangePassword: true });
    const client = await loginWithEmail(user);
    const blocked = await client.get('/api/products');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const changed = await client.post('/api/auth/password/change', {
      currentPassword: user.password,
      newPassword: 'Nueva-Clave-Muy-Segura-2026',
    });
    expect(changed.status).toBe(204);
    expect((await client.get('/api/products')).status).toBe(200);
  });
});

describe('step-up re-authentication', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });

  it('is single-use, bound to the action and to the record', async () => {
    const admin = await createTestUser('admin');
    const a = await createTestUser('cajero');
    const b = await createTestUser('cajero');
    const client = await loginWithEmail(admin);
    const reason = { reason: 'Solicitud de soporte técnico' };

    await stepUpWithEmail(client, admin, 'user.unlock', a.id);
    // Bound to the record: cannot be used for user B.
    expect((await client.post(`/api/users/${b.id}/unlock`, reason)).body.error.code).toBe('STEP_UP_REQUIRED');
    // Bound to the action: cannot be used to reset A's password.
    expect((await client.post(`/api/users/${a.id}/password-reset`, reason)).body.error.code).toBe('STEP_UP_REQUIRED');
    expect((await client.post(`/api/users/${a.id}/unlock`, reason)).status).toBe(204);
    // Single use.
    expect((await client.post(`/api/users/${a.id}/unlock`, reason)).body.error.code).toBe('STEP_UP_REQUIRED');
  });

  it('expires after 2 minutes', async () => {
    const admin = await createTestUser('admin');
    const target = await createTestUser('cajero');
    const client = await loginWithEmail(admin);
    await stepUpWithEmail(client, admin, 'user.unlock', target.id);
    await editSession((data) => {
      (data.stepUpGrant as { expiresAt: number }).expiresAt = Date.now() - 1;
    });
    const res = await client.post(`/api/users/${target.id}/unlock`, { reason: 'Solicitud de soporte técnico' });
    expect(res.body.error.code).toBe('STEP_UP_REQUIRED');
  });

  it('protects role changes and keeps at least one administrator', async () => {
    const admin = await createTestUser('admin');
    const client = await loginWithEmail(admin);
    const body = { role: 'cajero', reason: 'Cambio de funciones en la sucursal' };
    await stepUpWithEmail(client, admin, 'user.role.change', admin.id);
    const self = await client.put(`/api/users/${admin.id}/role`, body);
    expect(self.status).toBe(409);
  });
});
