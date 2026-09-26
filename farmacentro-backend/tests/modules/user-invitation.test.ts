import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/models/AuditLog.js';
import { User } from '../../src/models/User.js';
import { sentMail } from '../../src/services/mail.service.js';
import {
  closeDatabase,
  createTestUser,
  getApp,
  lastCodeFor,
  loginWithEmail,
  resetDatabase,
  stepUpWithEmail,
  TestClient,
  type TestUser,
} from '../helpers/app.js';

const EMPLOYEE = {
  username: 'cajero.nuevo',
  fullName: 'Ana Lucía Pérez',
  email: 'ana.perez@farmacentro.test',
  role: 'cajero',
};

function invitationFor(email: string) {
  const message = [...sentMail].reverse().find((m) => m.to === email && /Contraseña temporal/.test(m.text));
  if (!message) throw new Error(`no invitation sent to ${email}`);
  const password = /Contraseña temporal: (\S+)/.exec(message.text)?.[1];
  return { message, password: password ?? '' };
}

async function adminCreatesEmployee(): Promise<{ admin: TestClient; body: Record<string, unknown> }> {
  const adminUser = await createTestUser('admin');
  const admin = await loginWithEmail(adminUser);
  await stepUpWithEmail(admin, adminUser, 'user.create', null);
  const res = await admin.post('/api/users', EMPLOYEE);
  expect(res.status).toBe(201);
  return { admin, body: res.body as Record<string, unknown> };
}

describe('user invitation by e-mail (5.16, 5.17)', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });
  afterAll(closeDatabase);

  it('e-mails the username and temporary password to the employee and never returns it to the Administrator', async () => {
    const { body } = await adminCreatesEmployee();
    expect(body).not.toHaveProperty('temporaryPassword');
    expect(body.invitation).toMatchObject({ sent: true, sentTo: 'a***@farmacentro.test' });

    const { message, password } = invitationFor(EMPLOYEE.email);
    expect(message.text).toContain(`Usuario: ${EMPLOYEE.username}`);
    expect(message.text).toContain('/login');
    expect(password).toHaveLength(16);
    expect(JSON.stringify(body)).not.toContain(password);

    const stored = await User.findOne({ username: EMPLOYEE.username }).lean();
    const hours = (stored!.temporaryPasswordExpiresAt!.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(47.9);
    expect(hours).toBeLessThanOrEqual(48);
    expect(stored!.mustChangePassword).toBe(true);

    const audit = await AuditLog.findOne({ action: 'user.invitation.sent' }).lean();
    expect(audit).toMatchObject({ result: 'success', entityId: String(stored!._id) });
    expect(JSON.stringify(audit)).not.toContain(password);
  });

  it('asks for the second factor and then forces the password change on first login', async () => {
    await adminCreatesEmployee();
    const { password } = invitationFor(EMPLOYEE.email);
    const employee = new TestClient(await getApp());

    const login = await employee.post('/api/auth/login', { username: EMPLOYEE.username, password });
    expect(login.status).toBe(200);
    await employee.post('/api/auth/email-otp/send');
    const verify = await employee.post('/api/auth/email-otp/verify', { code: lastCodeFor(EMPLOYEE.email) });
    expect(verify.status).toBe(200);
    expect(verify.body.user.mustChangePassword).toBe(true);

    expect((await employee.get('/api/products')).body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const newPassword = 'Mi-Clave-Propia-2026';
    const change = await employee.post('/api/auth/password/change', { currentPassword: password, newPassword });
    expect(change.status).toBeLessThan(300);

    const stored = await User.findOne({ username: EMPLOYEE.username }).lean();
    expect(stored!.mustChangePassword).toBe(false);
    expect(stored!.temporaryPasswordExpiresAt).toBeNull();
    // The temporary password stops working once it has been replaced.
    const again = new TestClient(await getApp());
    expect((await again.post('/api/auth/login', { username: EMPLOYEE.username, password })).status).toBe(401);
  });

  it('rejects an expired temporary password with the generic message and audits the reason', async () => {
    await adminCreatesEmployee();
    const { password } = invitationFor(EMPLOYEE.email);
    await User.updateOne(
      { username: EMPLOYEE.username },
      { $set: { temporaryPasswordExpiresAt: new Date(Date.now() - 1000) } },
    );
    const res = await new TestClient(await getApp()).post('/api/auth/login', { username: EMPLOYEE.username, password });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    const audit = await AuditLog.findOne({ action: 'auth.login.failure' }).sort({ seq: -1 }).lean();
    expect(JSON.stringify(audit?.details)).toContain('temporary_password_expired');
  });

  it('a password reset sends a new invitation and invalidates the previous temporary password', async () => {
    const adminUser: TestUser = await createTestUser('admin');
    const admin = await loginWithEmail(adminUser);
    const target = await createTestUser('bodeguero');

    await stepUpWithEmail(admin, adminUser, 'user.password.reset', target.id);
    const res = await admin.post(`/api/users/${target.id}/password-reset`, { reason: 'El empleado olvidó su contraseña' });
    expect(res.status).toBe(200);
    expect(res.body.temporaryPassword).toBeUndefined();
    expect(res.body.invitation.sent).toBe(true);

    const { password } = invitationFor(target.email);
    const old = new TestClient(await getApp());
    expect((await old.post('/api/auth/login', { username: target.username, password: target.password })).status).toBe(401);
    const fresh = new TestClient(await getApp());
    const login = await fresh.post('/api/auth/login', { username: target.username, password });
    expect(login.status).toBe(200);
  });
});
