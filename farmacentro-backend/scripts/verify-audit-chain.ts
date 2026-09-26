/**
 * Independent verification of the audit log hash chain (for the auditor group).
 * Needs only `find` on audit_logs: use MONGODB_URI_AUDIT_READER (falls back to MONGODB_URI_ADMIN).
 *
 *   npm run verify-audit
 */
import { loadScriptEnv } from './lib/env.js';

loadScriptEnv();
const uri =
  process.env.MONGODB_URI_AUDIT_READER ??
  process.env.MONGODB_URI_ADMIN ??
  (process.env.NODE_ENV !== 'production' ? process.env.MONGODB_URI : undefined);
if (!uri) {
  console.error('Define MONGODB_URI_AUDIT_READER (o MONGODB_URI_ADMIN) en scripts/.env, o MONGODB_URI en .env.');
  process.exit(1);
}

const mongoose = (await import('mongoose')).default;
const { verifyAuditChain } = await import('../src/services/audit.service.js');

mongoose.set('sanitizeFilter', true);
const { withDefaultDb } = await import('../src/db/uri.js');
await mongoose.connect(withDefaultDb(uri), { autoIndex: false, autoCreate: false });
const result = await verifyAuditChain();
await mongoose.disconnect();

console.log(`Registros verificados: ${result.checked}`);
if (result.ok) {
  console.log('Resultado: cadena ÍNTEGRA');
  console.log(`Ancla (anótala fuera del sistema): seq=${result.lastSeq} hash=${result.lastHash}`);
} else {
  console.log(`Resultado: cadena ROTA en seq ${result.brokenAtSeq} (motivo: ${result.reason})`);
  process.exitCode = 2;
}
