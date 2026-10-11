import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/models/AuditLog.js';
import { User } from '../../src/models/User.js';
import { base32Decode, base32Encode, totpCode } from '../../src/services/totp.service.js';
import {
  closeDatabase,
  codeFor,
  createTestUser,
  enrollTotp,
  getApp,
  loginWithEmail,
  resetDatabase,
  stepUp,
  stepUpWithEmail,
} from '../helpers/app.js';

describe('TOTP algorithm (RFC 6238)', () => {
  it('matches the reference vectors (SHA-1, 30 s, last 6 digits)', () => {
    const secret = Buffer.from('12345678901234567890', 'ascii');
    expect(base32Encode(secret)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ').equals(secret)).toBe(true);
    expect(totpCode(secret, Math.floor(59 / 30))).toBe('287082');
    expect(totpCode(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(totpCode(secret, Math.floor(2000000000 / 30))).toBe('279037');
  });
});

describe('authenticator app for critical operations (D-32)', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });
  afterAll(closeDatabase);

  it('never accepts the e-mailed code for a critical operation', async () => {
    const admin = await createTestUser('admin');
    const target = await createTestUser('cajero');
    const client = await loginWithEmail(admin);

    const required = await client.post(`/api/users/${target.id}/unlock`, { reason: 'Solicitud de soporte técnico' });
    expect(required.body.error.code).toBe('STEP_UP_REQUIRED');
    expect(required.body.error.methods).toEqual([]);

    const send = await client.post('/api/auth/step-up/email-otp/send', { action: 'user.unlock', targetId: target.id });
    expect(send.status).toBe(403);
    const verify = await client.post('/api/auth/step-up/email-otp/verify', {
      action: 'user.unlock',
      targetId: target.id,
      code: '123456',
    });
    expect(verify.status).toBe(403);
  });

  it('configures the app with the e-mailed code once, stores the secret encrypted and audits it', async () => {
    const user = await createTestUser('regente');
    const client = await loginWithEmail(user);

    const required = await client.post('/api/me/totp/setup');
    expect(required.body.error.code).toBe('STEP_UP_REQUIRED');
    expect(required.body.error.methods).toEqual(['email_otp']);

    await stepUpWithEmail(client, user, 'totp.enroll', null);
    const setup = await client.post('/api/me/totp/setup');
    expect(setup.status).toBe(200);
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/FarmaCentro%3A.+\?secret=[A-Z2-7]+&issuer=FarmaCentro/);
    const secret = (setup.body.secret as string).replace(/ /g, '');

    expect((await client.post('/api/me/totp/confirm', { code: codeFor(secret, 5) })).status).toBe(400);
    const confirm = await client.post('/api/me/totp/confirm', { code: codeFor(secret) });
    expect(confirm.status).toBe(200);
    expect(confirm.body.enabled).toBe(true);
    expect((await client.get('/api/auth/me')).body.user.hasTotp).toBe(true);

    const raw = await User.collection.findOne({ _id: (await User.findById(user.id).lean())!._id });
    expect(raw!.totpSecret.ct).toBeDefined();
    expect(JSON.stringify(raw)).not.toContain(secret);
    expect(await AuditLog.exists({ action: 'totp.enrolled', result: 'success' })).toBeTruthy();
    expect(JSON.stringify(await AuditLog.find().lean())).not.toContain(secret);

    // Once a strong factor exists, the e-mailed code no longer serves even to configure a new app.
    const again = await client.post('/api/auth/step-up/email-otp/send', { action: 'totp.enroll', targetId: null });
    expect(again.status).toBe(403);
  });

  it('grants a single-use step-up and rejects a replayed code', async () => {
    const admin = await createTestUser('admin');
    const a = await createTestUser('cajero');
    const b = await createTestUser('cajero');
    const secret = await enrollTotp(admin);
    const client = await loginWithEmail(admin);
    const code = codeFor(secret);

    const first = await client.post('/api/auth/step-up/totp/verify', { action: 'user.unlock', targetId: a.id, code });
    expect(first.status).toBe(200);
    expect((await client.post(`/api/users/${a.id}/unlock`, { reason: 'Solicitud de soporte técnico' })).status).toBe(204);

    const replay = await client.post('/api/auth/step-up/totp/verify', { action: 'user.unlock', targetId: b.id, code });
    expect(replay.status).toBe(401);
    const failure = await AuditLog.findOne({ action: 'auth.stepup.failed' }).sort({ seq: -1 }).lean();
    expect(failure?.details).toMatchObject({ method: 'totp', reason: 'replayed' });
    expect(await AuditLog.exists({ action: 'auth.stepup.granted', 'details.method': 'totp' })).toBeTruthy();
  });

  it('counts wrong codes towards the lockout', async () => {
    const user = await createTestUser('bodeguero');
    const secret = await enrollTotp(user);
    const client = await loginWithEmail(user);
    const wrong = codeFor(secret, 10);
    let last = 0;
    for (let i = 0; i < 5; i += 1) {
      last = (await client.post('/api/auth/step-up/totp/verify', { action: 'inventory.adjust', targetId: null, code: wrong })).status;
    }
    expect(last).toBe(401);
    expect((await User.findById(user.id).lean())!.lockedUntil).not.toBeNull();
    expect((await client.get('/api/auth/me')).status).toBe(401);
  });

  it('lets the Administrator reset a lost app, and the user can configure it again', async () => {
    const admin = await createTestUser('admin');
    const target = await createTestUser('cajero');
    await enrollTotp(target);
    const client = await loginWithEmail(admin);

    const body = { reason: 'El empleado perdió su celular' };
    expect((await client.delete(`/api/users/${target.id}/totp`, body)).body.error.code).toBe('STEP_UP_REQUIRED');
    await stepUp(client, admin, 'user.totp.revoke', target.id);
    expect((await client.delete(`/api/users/${target.id}/totp`, body)).status).toBe(204);

    const detail = await client.get(`/api/users/${target.id}`);
    expect(detail.body.hasTotp).toBe(false);
    const audit = await AuditLog.findOne({ action: 'totp.revoked' }).lean();
    expect(audit?.details).toMatchObject({ by: 'admin', reason: body.reason });

    const employee = await loginWithEmail(target);
    await stepUpWithEmail(employee, target, 'totp.enroll', null);
    expect((await employee.post('/api/me/totp/setup')).status).toBe(200);
  });
});
