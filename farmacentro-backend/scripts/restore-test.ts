/**
 * Restore test (control 8.13): decrypts a backup into a throw-away in-memory MongoDB, compares
 * document counts and verifies the audit chain. Writes the result to docs/evidencias/.
 *
 *   npm run restore-test -- backups/farmacentro-<fecha>.bak
 */
import { createDecipheriv } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { EVIDENCE_DIR, loadScriptEnv, REPO_ROOT, requireVar, ROOT } from './lib/env.js';

loadScriptEnv();
const key = Buffer.from(requireVar('BACKUP_ENC_KEY'), 'base64');
const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!fileArg) {
  console.error('Uso: npm run restore-test -- backups/<archivo>.bak');
  process.exit(1);
}

const raw = readFileSync(path.resolve(ROOT, fileArg));
if (raw.subarray(0, 5).toString() !== 'FCBK1') {
  console.error('El archivo no es un respaldo de FarmaCentro.');
  process.exit(1);
}
const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(5, 17));
decipher.setAuthTag(raw.subarray(17, 33));
const plain = gunzipSync(Buffer.concat([decipher.update(raw.subarray(33)), decipher.final()]));

const mongoose = (await import('mongoose')).default;
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { verifyAuditChain } = await import('../src/services/audit.service.js');
const { EJSON } = mongoose.mongo.BSON;
const backup = EJSON.parse(plain.toString('utf8'), { relaxed: false }) as {
  createdAt: string;
  collections: Record<string, Record<string, unknown>[]>;
};

const server = await MongoMemoryServer.create();
const started = Date.now();
await mongoose.connect(server.getUri('farmacentro_restore'));
const db = mongoose.connection.db!;
const lines = [`Prueba de restauración — ${new Date().toISOString()}`, `Respaldo: ${path.basename(fileArg)} (creado ${backup.createdAt})`, ''];
let countsOk = true;
for (const [name, docs] of Object.entries(backup.collections)) {
  if (docs.length > 0) await db.collection(name).insertMany(docs);
  const restored = await db.collection(name).countDocuments();
  countsOk &&= restored === docs.length;
  lines.push(`${restored === docs.length ? 'OK   ' : 'FALLA'} ${name}: ${restored}/${docs.length}`);
}
const chain = await verifyAuditChain();
const seconds = ((Date.now() - started) / 1000).toFixed(1);
lines.push('', `Cadena de bitácora: ${chain.ok ? 'íntegra' : `rota en seq ${chain.brokenAtSeq}`} (${chain.checked} registros)`);
lines.push(`Tiempo de restauración: ${seconds} s`);
await mongoose.disconnect();
await server.stop();

const report = lines.join('\n');
console.log(report);
const dir = EVIDENCE_DIR;
mkdirSync(dir, { recursive: true });
const out = path.join(dir, `prueba-restauracion-${new Date().toISOString().slice(0, 10)}.txt`);
writeFileSync(out, `${report}\n`);
console.log(`\nEvidencia guardada en ${path.relative(REPO_ROOT, out)}`);
if (!countsOk || !chain.ok) process.exitCode = 2;
