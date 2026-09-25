import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { User } from '../../src/models/User.js';
import {
  closeDatabase,
  createTestUser,
  getApp,
  loginWithEmail,
  resetDatabase,
  TestClient,
} from '../helpers/app.js';

describe('NoSQL injection (control 8.28)', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });
  afterAll(closeDatabase);

  it('rejects operator objects in the login body before they reach MongoDB', async () => {
    await createTestUser('admin', { username: 'admin1' });
    const client = new TestClient(await getApp());
    const attacks = [
      { username: { $ne: null }, password: { $ne: null } },
      { username: 'admin1', password: { $gt: '' } },
      { username: { $regex: '.*' }, password: 'x' },
      { username: 'admin1', password: 'x', $where: 'sleep(1000)' },
    ];
    for (const body of attacks) {
      const res = await client.post('/api/auth/login', body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects operator syntax in query strings', async () => {
    const admin = await createTestUser('admin');
    const client = await loginWithEmail(admin);
    for (const url of ['/api/users?role[$ne]=admin', '/api/users?q[$regex]=.*', '/api/users?status=active&$where=1']) {
      expect((await client.get(url)).status).toBe(400);
    }
  });

  it('neutralises operators even if a filter object slipped through (sanitizeFilter)', async () => {
    await createTestUser('cajero', { username: 'victima' });
    const injected = { username: { $ne: 'nadie' } } as unknown as { username: string };
    // The operator is wrapped in $eq and can no longer match every user: the query is rejected.
    await expect(User.findOne(injected).lean()).rejects.toThrow(/Cast to string/);
    await expect(User.findOne({ $where: 'true' } as never).lean()).rejects.toThrow(/sanitizeFilter/);
  });

  it('escapes regular expressions built from user search text', async () => {
    const admin = await createTestUser('admin');
    const client = await loginWithEmail(admin);
    // Special regex characters are rejected by the schema; a plain dot is escaped, not a wildcard.
    expect((await client.get('/api/users?q=(a%2B)%2B')).status).toBe(400);
    const res = await client.get('/api/users?q=.');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});
