import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '../../src/domain/roles.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import {
  closeDatabase,
  createTestUser,
  getApp,
  loginWithEmail,
  resetDatabase,
  type TestClient,
} from '../helpers/app.js';

const ID = '66f0a0a0a0a0a0a0a0a0a0a0';
const RANGE = 'from=2026-01-01&to=2026-01-31';

type Probe = [method: 'get' | 'post' | 'put' | 'patch', url: string, allowed: Role[], body?: unknown];

// One representative endpoint per permission of docs/roles-permisos.md.
const PROBES: Probe[] = [
  ['get', '/api/users', ['admin']],
  ['put', `/api/users/${ID}/role`, ['admin'], { role: 'cajero', reason: 'Cambio de funciones' }],
  ['post', '/api/products', ['bodeguero'], { sku: 'X-1', name: 'X', presentation: 'Caja', category: 'otros', unitPriceCents: 100, minStock: 0 }],
  ['put', `/api/products/${ID}/controlled`, ['regente'], { isControlled: true, reason: 'Medicamento psicotrópico' }],
  ['get', '/api/products', ['regente', 'cajero', 'bodeguero']],
  ['get', '/api/inventory/lots', ['regente', 'bodeguero']],
  ['post', '/api/inventory/adjustments', ['regente', 'bodeguero'], { lotId: ID, quantityDelta: -1, reasonCode: 'damaged', reason: 'Producto dañado' }],
  ['get', '/api/sales', ['regente', 'cajero']],
  ['post', `/api/sales/${ID}/void`, ['regente'], { reason: 'Cliente devolvió el producto' }],
  ['get', '/api/customers/lookup?phone=12345678', ['regente', 'cajero']],
  ['post', `/api/customers/${ID}/consent-withdrawal`, ['regente'], { reason: 'Solicitud del cliente' }],
  ['get', '/api/prescriptions', ['regente']],
  ['get', `/api/prescriptions/${ID}`, ['regente']],
  ['get', '/api/audit/logs', ['auditor']],
  ['get', '/api/audit/verify', ['auditor']],
  ['get', `/api/reports/failed-logins?${RANGE}`, ['auditor']],
  ['get', '/api/reports/users-roles', ['admin', 'auditor']],
  ['get', `/api/reports/voids?${RANGE}`, ['regente', 'auditor']],
  ['get', `/api/reports/adjustments?${RANGE}`, ['regente', 'bodeguero', 'auditor']],
];

const ROLES: Role[] = ['admin', 'regente', 'cajero', 'bodeguero', 'auditor'];

describe('role-based access control enforced by the backend (5.15, 5.18)', () => {
  const clients = new Map<Role, TestClient>();

  beforeAll(async () => {
    await getApp();
    await resetDatabase();
    for (const role of ROLES) {
      clients.set(role, await loginWithEmail(await createTestUser(role)));
    }
  });
  afterAll(closeDatabase);

  for (const [method, url, allowed, body] of PROBES) {
    for (const role of ROLES.filter((r) => !allowed.includes(r))) {
      it(`${role} cannot ${method.toUpperCase()} ${url}`, async () => {
        const before = await AuditLog.countDocuments({ action: 'authz.denied' });
        const client = clients.get(role)!;
        const res = await client.send(method, url, method === 'get' ? undefined : (body ?? {}));
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
        expect(await AuditLog.countDocuments({ action: 'authz.denied' })).toBe(before + 1);
      });
    }
  }

  it('only the Auditor can export reports to CSV', async () => {
    expect((await clients.get('regente')!.get(`/api/reports/voids?${RANGE}&format=csv`)).status).toBe(403);
    const res = await clients.get('auditor')!.get(`/api/reports/voids?${RANGE}&format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('rejects unauthenticated access', async () => {
    const res = await (await import('supertest')).default(await getApp()).get('/api/users');
    expect(res.status).toBe(401);
  });
});
