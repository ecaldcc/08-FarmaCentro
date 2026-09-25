/**
 * Creates collections, indexes (including TTL indexes) and the genesis audit record.
 * Runs with the privileged user farmacentro_migrator (MONGODB_URI_ADMIN), never with the API user
 * in production. In local development it falls back to MONGODB_URI.
 *
 *   npm run setup-db
 *   npm run setup-db -- --print-role      also prints the custom role definitions for Atlas
 *   npm run setup-db -- --seed-if-empty   also loads the demo data when there are no users
 *                                         (runs automatically before `npm run dev`)
 */
import { adminUri, hasFlag, loadScriptEnv } from './lib/env.js';

loadScriptEnv();
const uri = adminUri();
const seedIfEmpty = hasFlag('--seed-if-empty');
if (seedIfEmpty) process.env.MONGODB_URI ??= uri;

const mongoose = (await import('mongoose')).default;
const { assertReplicaSet, diagnoseConnectionFailure } = await import('../src/db/replicaSet.js');
const { API_ROLE_PRIVILEGES, AUDIT_READER_PRIVILEGES, ensureSchema } = await import('../src/db/schema.js');
const { AuditLog } = await import('../src/models/AuditLog.js');
const { User } = await import('../src/models/User.js');
const { appendAudit, SYSTEM_CONTEXT } = await import('../src/services/audit.service.js');

try {
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 });
} catch {
  console.error(await diagnoseConnectionFailure(uri));
  process.exit(1);
}
// Collections, indexes and the genesis record do not need transactions: they are created even on
// a standalone server, so the database structure exists before the replica set is enabled.
const dbName = mongoose.connection.db?.databaseName ?? 'farmacentro';
await ensureSchema();
console.log(`Base "${dbName}": colecciones e índices listos.`);

if ((await AuditLog.estimatedDocumentCount()) === 0) {
  await appendAudit(SYSTEM_CONTEXT, {
    action: 'system.genesis',
    result: 'success',
    details: { note: 'Inicio de la cadena de la bitácora' },
  });
  console.log('Registro génesis de la bitácora creado (seq 0).');
}

// The API and the demo data use transactions (sales, voids, adjustments): they need a replica set.
try {
  await assertReplicaSet();
} catch (error) {
  console.error((error as Error).message);
  await mongoose.disconnect();
  process.exit(seedIfEmpty ? 1 : 0);
}

if (seedIfEmpty && process.env.NODE_ENV !== 'production' && (await User.estimatedDocumentCount()) === 0) {
  const { DEV_PASSWORD, seedDemoData } = await import('./lib/seedData.js');
  console.log('Base vacía: cargando datos de prueba…');
  await seedDemoData(process.env.SEED_PASSWORD ?? DEV_PASSWORD, false);
  console.log('Datos de prueba cargados. Credenciales en docs/credenciales-prueba.md.');
}

if (hasFlag('--print-role')) {
  const toPrivileges = (map: Readonly<Record<string, readonly string[]>>) =>
    Object.entries(map).map(([collection, actions]) => ({ resource: { db: dbName, collection }, actions }));
  console.log('\nRol personalizado "farmacentroApi" (Atlas → Database Access → Custom Roles):');
  console.log(JSON.stringify(toPrivileges(API_ROLE_PRIVILEGES), null, 2));
  console.log('\nRol personalizado "auditReader":');
  console.log(JSON.stringify(toPrivileges(AUDIT_READER_PRIVILEGES), null, 2));
}

await mongoose.disconnect();
