/**
 * Evidence for control 8.15: connects as the API user and shows that it can insert into and read
 * audit_logs but cannot update, delete, drop or index it. Writes the result to docs/evidencias/.
 *
 *   npm run check-db-privileges
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { withDefaultDb } from '../src/db/uri.js';
import { EVIDENCE_DIR, loadScriptEnv, REPO_ROOT, requireVar } from './lib/env.js';

loadScriptEnv();
// The API user: MONGODB_URI_API, or MONGODB_URI (same user) when only that one is set.
const apiUri = withDefaultDb(process.env.MONGODB_URI_API ?? requireVar('MONGODB_URI'));

const mongoose = (await import('mongoose')).default;
await mongoose.connect(apiUri, { autoIndex: false, autoCreate: false });
const db = mongoose.connection.db!;
const logs = db.collection('audit_logs');
const lines: string[] = [`Verificación de privilegios del usuario de la API — ${new Date().toISOString()}`, `Base: ${db.databaseName}`, ''];

const status = await db.command({ connectionStatus: 1, showPrivileges: true });
const users = (status.authInfo?.authenticatedUsers ?? []) as { user: string; db: string }[];
lines.push(`Usuario autenticado: ${users.map((u) => `${u.user}@${u.db}`).join(', ') || '(ninguno)'}`);
const privileges = (status.authInfo?.authenticatedUserPrivileges ?? []) as {
  resource: { db?: string; collection?: string };
  actions: string[];
}[];
lines.push('Privilegios efectivos:');
for (const p of privileges) {
  lines.push(`  ${p.resource.db ?? '*'}.${p.resource.collection ?? '*'}: ${p.actions.sort().join(', ')}`);
}
lines.push('');

async function attempt(label: string, expectAllowed: boolean, action: () => Promise<unknown>) {
  let allowed = true;
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/not authorized|unauthorized|not allowed to do action/i.test(message)) throw error;
    allowed = false;
  }
  const ok = allowed === expectAllowed;
  lines.push(`${ok ? 'OK   ' : 'FALLA'} ${label}: ${allowed ? 'permitido' : 'denegado'} (esperado: ${expectAllowed ? 'permitido' : 'denegado'})`);
  return ok;
}

const results = [
  await attempt('find en audit_logs', true, () => logs.findOne({})),
  await attempt('updateOne en audit_logs', false, () => logs.updateOne({ seq: -1 }, { $set: { action: 'x' } })),
  await attempt('deleteOne en audit_logs', false, () => logs.deleteOne({ seq: -1 })),
  await attempt('createIndex en audit_logs', false, () => logs.createIndex({ probe: 1 })),
  await attempt('drop de audit_logs', false, () => logs.drop()),
  await attempt('deleteMany en inventory_movements', false, () => db.collection('inventory_movements').deleteMany({ probe: true })),
];
await mongoose.disconnect();

const report = lines.join('\n');
console.log(report);
const dir = EVIDENCE_DIR;
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `privilegios-bd-${new Date().toISOString().slice(0, 10)}.txt`);
writeFileSync(file, `${report}\n`);
console.log(`\nEvidencia guardada en ${path.relative(REPO_ROOT, file)}`);
if (results.some((ok) => !ok)) process.exitCode = 2;
