import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Messages captured by the in-memory transport (only allowed when NODE_ENV=test). */
export const sentMail: MailMessage[] = [];

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
    });
  }
  return transporter;
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (env.MAIL_TRANSPORT === 'memory') {
    sentMail.push(message);
    return;
  }
  if (env.MAIL_TRANSPORT === 'console') {
    // Development only (enforced in config/env.ts): shows the message instead of sending it.
    process.stdout.write(
      `
──────── correo de desarrollo (no enviado) ────────
Para: ${message.to}
Asunto: ${message.subject}
${message.text}
───────────────────────────────────────────────────
`,
    );
    return;
  }
  await getTransporter().sendMail({ from: env.MAIL_FROM, ...message });
}

const FOOTER =
  '\n\nSi no reconoces esta actividad, avisa de inmediato al Administrador del sistema.\n' +
  'FarmaCentro · mensaje automático, no respondas este correo.';

/** Security notifications (decision D-22). Failures are logged but never block the operation. */
export async function notifyUser(to: string, subject: string, body: string): Promise<void> {
  try {
    await sendMail({ to, subject: `FarmaCentro: ${subject}`, text: `${body}${FOOTER}` });
  } catch (error) {
    logger.warn({ err: error, subject }, 'security notification could not be sent');
  }
}
