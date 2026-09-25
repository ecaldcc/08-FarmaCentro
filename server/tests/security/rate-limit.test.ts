import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Real production limits for this file only (the other tests relax them to log in many times).
vi.hoisted(() => {
  process.env.RATE_LIMIT_FACTOR = '1';
});

const { AuditLog } = await import('../../src/models/AuditLog.js');
const { closeDatabase, getApp, resetDatabase, TestClient } = await import('../helpers/app.js');

describe('express-rate-limit on login', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });
  afterAll(closeDatabase);

  it('returns 429 after 10 login attempts in 15 minutes from the same IP and audits it', async () => {
    const client = new TestClient(await getApp());
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await client.post('/api/auth/login', { username: 'nadie', password: 'x'.repeat(12) })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(await AuditLog.exists({ action: 'security.rate_limited' })).toBeTruthy();
  });
});
