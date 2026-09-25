/**
 * Loads the fictitious demo data (see scripts/lib/seedData.ts).
 *
 *   npm run seed              (only on an empty database)
 *   npm run seed -- --reset   (DELETES all data, including the audit log, then seeds again)
 */
import { adminUri, hasFlag, loadScriptEnv } from './lib/env.js';

loadScriptEnv();
const uri = adminUri();
process.env.MONGODB_URI ??= uri;

const isProduction = process.env.NODE_ENV === 'production';
const { DEV_PASSWORD, seedDemoData } = await import('./lib/seedData.js');
const seedPassword = process.env.SEED_PASSWORD ?? (isProduction ? undefined : DEV_PASSWORD);
if (!seedPassword) {
  console.error('En producción define SEED_PASSWORD (la contraseña de demostración es pública en el repositorio).');
  process.exit(1);
}

const mongoose = (await import('mongoose')).default;
const { assertReplicaSet } = await import('../src/db/replicaSet.js');
const { ensureSchema } = await import('../src/db/schema.js');
const { User } = await import('../src/models/User.js');
const { appendAudit, SYSTEM_CONTEXT } = await import('../src/services/audit.service.js');

await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
await assertReplicaSet();

if (hasFlag('--reset')) {
  for (const collection of await mongoose.connection.db!.collections()) {
    await collection.deleteMany({});
  }
  console.log('Base de datos vaciada (--reset).');
} else if ((await User.estimatedDocumentCount()) > 0) {
  console.error('La base ya tiene datos. Usa "npm run seed -- --reset" para vaciarla y sembrar de nuevo.');
  await mongoose.disconnect();
  process.exit(1);
}

await ensureSchema();
await appendAudit(SYSTEM_CONTEXT, { action: 'system.genesis', result: 'success', details: { note: 'Datos de prueba' } });
await seedDemoData(seedPassword, isProduction);
console.log('\nListo. Las credenciales de prueba están en docs/credenciales-prueba.md.');
await mongoose.disconnect();
