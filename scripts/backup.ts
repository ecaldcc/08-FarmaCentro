/**
 * Simulated backup (control 8.13, decision D-18): Atlas M0 has no automatic backups, so every
 * collection is exported as Extended JSON, compressed and encrypted with AES-256-GCM
 * (BACKUP_ENC_KEY) into backups/ (excluded from Git).
 *
 *   npm run backup   →   backups/farmacentro-<fecha>.bak
 */
import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { loadScriptEnv, requireVar, ROOT } from './lib/env.js';

loadScriptEnv();
const uri = requireVar('MONGODB_URI_ADMIN');
const key = Buffer.from(requireVar('BACKUP_ENC_KEY'), 'base64');
if (key.length !== 32) {
  console.error('BACKUP_ENC_KEY debe tener 32 bytes en base64 (npm run generate-keys).');
  process.exit(1);
}

const mongoose = (await import('mongoose')).default;
await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
const db = mongoose.connection.db!;
const { EJSON } = mongoose.mongo.BSON;

const dump: Record<string, unknown[]> = {};
for (const info of await db.listCollections({}, { nameOnly: true }).toArray()) {
  if (info.name === 'sessions') continue; // sessions are ephemeral and must not be restored
  dump[info.name] = await db.collection(info.name).find({}).toArray();
}
await mongoose.disconnect();

const plain = gzipSync(Buffer.from(EJSON.stringify({ createdAt: new Date().toISOString(), collections: dump }, { relaxed: false })));
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const body = Buffer.concat([cipher.update(plain), cipher.final()]);
const file = Buffer.concat([Buffer.from('FCBK1'), iv, cipher.getAuthTag(), body]);

const dir = path.join(ROOT, 'backups');
mkdirSync(dir, { recursive: true });
const name = `farmacentro-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
writeFileSync(path.join(dir, name), file);
const counts = Object.entries(dump).map(([c, docs]) => `${c}=${docs.length}`).join(', ');
console.log(`Respaldo cifrado: backups/${name}`);
console.log(`Documentos: ${counts}`);
