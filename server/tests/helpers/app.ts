import type { Express } from 'express';
import mongoose from 'mongoose';
import request, { type Response } from 'supertest';
import { createApp } from '../../src/app.js';
import { connectDatabase } from '../../src/config/db.js';
import { ensureSchema } from '../../src/db/schema.js';
import type { Role } from '../../src/domain/roles.js';
import { User } from '../../src/models/User.js';
import { sentMail } from '../../src/services/mail.service.js';
import { hashPassword } from '../../src/services/password.service.js';

export const ORIGIN = 'http://localhost:5173';
export const DEFAULT_PASSWORD = 'Prueba-Segura-2026';

let app: Express | undefined;

/** Connects to the in-memory replica set, creates indexes and builds the app once per test file. */
export async function getApp(): Promise<Express> {
  if (!app) {
    if (mongoose.connection.readyState !== 1) {
      await connectDatabase(process.env.MONGODB_URI);
    }
    await ensureSchema();
    app = createApp();
  }
  return app;
}

export async function resetDatabase(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  for (const collection of await db.collections()) {
    await collection.deleteMany({});
  }
  sentMail.length = 0;
}

export async function closeDatabase(): Promise<void> {
  await mongoose.disconnect();
  app = undefined;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * HTTP client with a manual cookie jar. superagent refuses to send Secure cookies over plain
 * HTTP, so the fc.sid cookie is kept here and the request declares HTTPS like the dev proxy does.
 */
export class TestClient {
  cookie: string | undefined;
  lastSetCookie: string | undefined;

  constructor(
    private readonly application: Express,
    private readonly origin: string | null = ORIGIN,
  ) {}

  async send(method: Method, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
    let req = request(this.application)[method](url).set('X-Forwarded-Proto', 'https');
    if (this.origin) req = req.set('Origin', this.origin);
    if (this.cookie) req = req.set('Cookie', this.cookie);
    for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
    if (body !== undefined) req = req.send(body as object);
    const res = await req;
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const sid = setCookie.find((c) => c.startsWith('fc.sid='));
    if (sid) {
      this.lastSetCookie = sid;
      const pair = sid.split(';')[0] ?? '';
      this.cookie = pair === 'fc.sid=' || /expires=Thu, 01 Jan 1970/i.test(sid) ? undefined : pair;
    }
    return res;
  }

  get(url: string) {
    return this.send('get', url);
  }
  post(url: string, body: unknown = {}) {
    return this.send('post', url, body);
  }
  put(url: string, body: unknown = {}) {
    return this.send('put', url, body);
  }
  patch(url: string, body: unknown = {}) {
    return this.send('patch', url, body);
  }
  delete(url: string, body: unknown = {}) {
    return this.send('delete', url, body);
  }
}

export interface TestUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  password: string;
}

let userCounter = 0;

export async function createTestUser(role: Role, overrides: Partial<TestUser> & { mustChangePassword?: boolean } = {}) {
  userCounter += 1;
  const username = overrides.username ?? `${role}${userCounter}`;
  const password = overrides.password ?? DEFAULT_PASSWORD;
  const user = await User.create({
    username,
    fullName: `Usuario ${role} ${userCounter}`,
    email: overrides.email ?? `${username}@farmacentro.test`,
    role,
    passwordHash: await hashPassword(password),
    passwordChangedAt: new Date(),
    mustChangePassword: overrides.mustChangePassword ?? false,
  });
  return { id: String(user._id), username, email: user.email, role, password } satisfies TestUser;
}

/** Last 6-digit code e-mailed to the given address (in-memory transport). */
export function lastCodeFor(email: string): string {
  const message = [...sentMail].reverse().find((m) => m.to === email && /código de verificación/.test(m.text));
  const code = message?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`no code sent to ${email}`);
  return code;
}

/** Full login (password + e-mailed code). */
export async function loginWithEmail(user: TestUser): Promise<TestClient> {
  const client = new TestClient(await getApp());
  const first = await client.post('/api/auth/login', { username: user.username, password: user.password });
  if (first.status !== 200) throw new Error(`login failed: ${first.status} ${JSON.stringify(first.body)}`);
  await client.post('/api/auth/email-otp/send');
  const verify = await client.post('/api/auth/email-otp/verify', { code: lastCodeFor(user.email) });
  if (verify.status !== 200) throw new Error(`otp failed: ${verify.status} ${JSON.stringify(verify.body)}`);
  return client;
}

/** Obtains a step-up grant with an e-mailed code. */
export async function stepUpWithEmail(client: TestClient, user: TestUser, action: string, targetId: string | null) {
  const sent = await client.post('/api/auth/step-up/email-otp/send', { action, targetId });
  if (sent.status !== 200) throw new Error(`step-up send failed: ${sent.status} ${JSON.stringify(sent.body)}`);
  const res = await client.post('/api/auth/step-up/email-otp/verify', { action, targetId, code: lastCodeFor(user.email) });
  if (res.status !== 200) throw new Error(`step-up failed: ${res.status} ${JSON.stringify(res.body)}`);
}
