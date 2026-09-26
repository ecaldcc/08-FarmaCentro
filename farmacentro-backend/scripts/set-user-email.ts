/**
 * Changes the e-mail of an existing account from the command line (for example, to point the
 * production `admin` at the team mailbox). The change is written with the audit event
 * `user.updated` in the same transaction, with the script as the source (no user actor).
 * Run it while nobody is using the API: the audit chain lock lives inside each process.
 *
 *   npm run set-user-email -- --username=admin --email=farmacentro053@gmail.com
 *   npm run set-user-email:prod -- --username=admin --email=farmacentro053@gmail.com
 */
import { z } from 'zod';
import { adminUri, loadScriptEnv } from './lib/env.js';

loadScriptEnv();
const uri = adminUri();
process.env.MONGODB_URI ??= uri;

const argument = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const parsed = z
  .object({ username: z.string().trim().toLowerCase().min(3).max(32), email: z.email().trim().toLowerCase().max(254) })
  .safeParse({ username: argument('username'), email: argument('email') });
if (!parsed.success) {
  console.error('Uso: npm run set-user-email -- --username=<usuario> --email=<correo>');
  process.exit(1);
}
const { username, email } = parsed.data;

const mongoose = (await import('mongoose')).default;
const { User } = await import('../src/models/User.js');
const { runAuditedTransaction } = await import('../src/services/audit.service.js');
const { notifyUser } = await import('../src/services/mail.service.js');
const { maskEmail } = await import('../src/utils/mask.js');

mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);
await mongoose.connect(uri, { autoIndex: false, autoCreate: false });

try {
  const user = await User.findOne({ username }).lean();
  if (!user) throw new Error(`No existe el usuario "${username}".`);
  if (user.email === email) {
    console.log(`"${username}" ya usa ${maskEmail(email)}. Sin cambios.`);
  } else {
    if (await User.exists({ email })) throw new Error('Ya existe otro usuario con ese correo.');
    const ctx = { actor: null, ip: null, userAgent: 'scripts/set-user-email.ts', requestId: null };
    await runAuditedTransaction(ctx, async ({ session, audit }) => {
      await User.updateOne({ _id: user._id }, { $set: { email } }, { session });
      audit({
        action: 'user.updated',
        result: 'success',
        entity: 'user',
        entityId: user._id,
        details: { fields: ['email'], emailChanged: true, source: 'script' },
      });
    });
    const body = 'El correo de tu cuenta de FarmaCentro fue cambiado por el equipo del sistema.';
    await notifyUser(user.email, 'correo de la cuenta cambiado', body);
    await notifyUser(email, 'correo de la cuenta cambiado', body);
    console.log(`Correo de "${username}" actualizado: ${maskEmail(user.email)} -> ${maskEmail(email)} (registrado en la bitácora).`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
