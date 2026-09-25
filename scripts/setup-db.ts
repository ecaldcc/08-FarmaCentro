/**
 * Creates collections, indexes (including TTL indexes) and the genesis audit record.
 * Runs with the privileged user farmacentro_migrator (MONGODB_URI_ADMIN), never with the API user.
 *
 *   npm run setup-db
 *   npm run setup-db -- --print-role   (also prints the custom role definition for Atlas)
 */
import { hasFlag, loadScriptEnv, requireVar } from './lib/env.js';

loadScriptEnv();
const adminUri = requireVar('MONGODB_URI_ADMIN');

const mongoose = (await import('mongoose')).default;
const { API_ROLE_PRIVILEGES, AUDIT_READER_PRIVILEGES, ensureSchema } = await import('../server/src/db/schema.js');
const { AuditLog } = await import('../server/src/models/AuditLog.js');
const { appendAudit, SYSTEM_CONTEXT } = await import('../server/src/services/audit.service.js');

await mongoose.connect(adminUri, { autoIndex: false, autoCreate: false });
const dbName = mongoose.connection.db?.databaseName ?? 'farmacentro';
console.log(`Base de datos: ${dbName}`);

await ensureSchema();
console.log('Colecciones e índices listos (incluye TTL de sessions y email_otps).');

if ((await AuditLog.estimatedDocumentCount()) === 0) {
  await appendAudit(SYSTEM_CONTEXT, {
    action: 'system.genesis',
    result: 'success',
    details: { note: 'Inicio de la cadena de la bitácora' },
  });
  console.log('Registro génesis de la bitácora creado (seq 0).');
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
