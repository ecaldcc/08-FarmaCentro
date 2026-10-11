/**
 * Enables or disables accounts from the command line (for example, the demo accounts before the
 * delivery to the auditor group). Each change is written with `user.disabled` / `user.enabled` in
 * the same transaction, with the script as the source. A disabled user's open session ends on the
 * next request (middlewares/auth.ts). At least one active Administrator always remains.
 * Run it while nobody is using the API: the audit chain lock lives inside each process.
 *
 *   npm run set-user-status -- --usernames=regente,cajero --status=disabled --reason="Motivo"
 *   npm run set-user-status:prod -- --usernames=regente,cajero --status=disabled --reason="Motivo"
 */
import { z } from 'zod';
import { adminUri, loadScriptEnv } from './lib/env.js';

loadScriptEnv();
const uri = adminUri();
process.env.MONGODB_URI ??= uri;

const argument = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const parsed = z
  .object({
    usernames: z.array(z.string().trim().toLowerCase().min(3).max(32)).min(1).max(20),
    status: z.enum(['active', 'disabled']),
    reason: z.string().trim().min(10).max(300),
  })
  .safeParse({
    usernames: argument('usernames')?.split(',').filter(Boolean),
    status: argument('status'),
    reason: argument('reason'),
  });
if (!parsed.success) {
  console.error('Uso: npm run set-user-status -- --usernames=<u1,u2> --status=disabled|active --reason="<motivo de 10+ caracteres>"');
  process.exit(1);
}
const { usernames, status, reason } = parsed.data;

const mongoose = (await import('mongoose')).default;
const { User } = await import('../src/models/User.js');
const { runAuditedTransaction } = await import('../src/services/audit.service.js');

mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);
await mongoose.connect(uri, { autoIndex: false, autoCreate: false });

const ctx = { actor: null, ip: null, userAgent: 'scripts/set-user-status.ts', requestId: null };
try {
  for (const username of usernames) {
    const user = await User.findOne({ username }).lean();
    if (!user) {
      console.log(`- ${username}: no existe, se omite.`);
      continue;
    }
    if (user.status === status) {
      console.log(`- ${username}: ya estaba ${status === 'active' ? 'activo' : 'deshabilitado'}.`);
      continue;
    }
    if (status === 'disabled' && user.role === 'admin') {
      const activeAdmins = await User.countDocuments({ role: 'admin', status: 'active' });
      if (activeAdmins <= 1) {
        console.log(`- ${username}: es el último Administrador activo, no se deshabilita.`);
        continue;
      }
    }
    await runAuditedTransaction(ctx, async ({ session, audit }) => {
      await User.updateOne({ _id: user._id }, { $set: { status } }, { session });
      audit({
        action: status === 'disabled' ? 'user.disabled' : 'user.enabled',
        result: 'success',
        entity: 'user',
        entityId: user._id,
        details: { reason, source: 'script' },
      });
    });
    console.log(`- ${username}: ${status === 'active' ? 'habilitado' : 'deshabilitado'} (registrado en la bitácora).`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
