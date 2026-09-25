import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { API_ROLE_PRIVILEGES } from '../../src/db/schema.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { appendAudit, SYSTEM_CONTEXT, verifyAuditChain } from '../../src/services/audit.service.js';
import { closeDatabase, createTestUser, getApp, loginWithEmail, resetDatabase } from '../helpers/app.js';

async function seedChain(count: number) {
  for (let i = 0; i < count; i += 1) {
    await appendAudit(SYSTEM_CONTEXT, { action: 'report.viewed', result: 'success', details: { i } });
  }
}

describe('audit log integrity (8.15)', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });
  afterAll(closeDatabase);

  it('chains every record to the previous hash', async () => {
    await seedChain(5);
    const entries = await AuditLog.find().sort({ seq: 1 }).lean();
    expect(entries[0]?.prevHash).toBe('0'.repeat(64));
    for (let i = 1; i < entries.length; i += 1) {
      expect(entries[i]?.prevHash).toBe(entries[i - 1]?.hash);
    }
    expect((await verifyAuditChain()).ok).toBe(true);
  });

  it('detects a modified record', async () => {
    await seedChain(6);
    await AuditLog.collection.updateOne({ seq: 3 }, { $set: { result: 'failure' } });
    expect(await verifyAuditChain()).toMatchObject({ ok: false, brokenAtSeq: 3, reason: 'hash' });
  });

  it('detects a modified record even if the attacker recomputes its hash', async () => {
    await seedChain(6);
    const target = await AuditLog.findOne({ seq: 2 }).lean();
    await AuditLog.collection.updateOne({ seq: 2 }, { $set: { hash: 'f'.repeat(64), 'details.i': 99 } });
    expect(target).not.toBeNull();
    expect(await verifyAuditChain()).toMatchObject({ ok: false, brokenAtSeq: 2 });
  });

  it('detects a deleted record', async () => {
    await seedChain(6);
    await AuditLog.collection.deleteOne({ seq: 4 });
    expect(await verifyAuditChain()).toMatchObject({ ok: false, brokenAtSeq: 4, reason: 'gap' });
  });

  it('keeps the chain valid under concurrent writes', async () => {
    await Promise.all(Array.from({ length: 30 }, (_, i) => appendAudit(SYSTEM_CONTEXT, { action: 'report.viewed', result: 'success', details: { i } })));
    const result = await verifyAuditChain();
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(30);
  });

  it('exposes verification to the Auditor and reports tampering', async () => {
    const auditor = await createTestUser('auditor');
    const client = await loginWithEmail(auditor);
    expect((await client.get('/api/audit/verify')).body.ok).toBe(true);
    await AuditLog.collection.updateOne({ seq: 1 }, { $set: { action: 'auth.logout' } });
    const res = await client.get('/api/audit/verify');
    expect(res.body).toMatchObject({ ok: false, brokenAtSeq: 1 });
  });

  it('has no API route that modifies or deletes the audit log', async () => {
    const client = await loginWithEmail(await createTestUser('auditor'));
    for (const method of ['put', 'patch', 'delete'] as const) {
      expect((await client.send(method, '/api/audit/logs', {})).status).toBe(404);
    }
  });
});

describe('database privileges of the API user', () => {
  it('can insert and read audit_logs but cannot update, delete or create indexes', async () => {
    const server = await MongoMemoryServer.create({
      auth: { enable: true, customRootName: 'root', customRootPwd: 'root-password-test' },
    });
    const dbName = 'farmacentro';
    const root = await mongoose
      .createConnection(server.getUri(dbName), { user: 'root', pass: 'root-password-test', authSource: 'admin' })
      .asPromise();
    try {
      await root.db!.createCollection('audit_logs');
      await root.db!.command({
        createRole: 'farmacentroApi',
        privileges: Object.entries(API_ROLE_PRIVILEGES).map(([collection, actions]) => ({
          resource: { db: dbName, collection },
          actions: [...actions],
        })),
        roles: [],
      });
      await root.db!.command({
        createUser: 'farmacentro_api',
        pwd: 'api-password-test',
        roles: [{ role: 'farmacentroApi', db: dbName }],
      });

      const api = await mongoose
        .createConnection(server.getUri(dbName), { user: 'farmacentro_api', pass: 'api-password-test', authSource: dbName })
        .asPromise();
      try {
        const logs = api.db!.collection('audit_logs');
        await logs.insertOne({ seq: 0, action: 'system.genesis' });
        expect(await logs.countDocuments()).toBe(1);
        await expect(logs.updateOne({ seq: 0 }, { $set: { action: 'x' } })).rejects.toThrow(/not authorized/i);
        await expect(logs.deleteOne({ seq: 0 })).rejects.toThrow(/not authorized/i);
        await expect(logs.createIndex({ action: 1 })).rejects.toThrow(/not authorized/i);
        await expect(logs.drop()).rejects.toThrow(/not authorized/i);
        await expect(api.db!.collection('inventory_movements').deleteMany({})).rejects.toThrow(/not authorized/i);
      } finally {
        await api.close();
      }
    } finally {
      await root.close();
      await server.stop();
    }
  });
});
