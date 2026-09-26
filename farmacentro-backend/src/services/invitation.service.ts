import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { maskEmail } from '../utils/mask.js';
import { appendAudit, type AuditContext } from './audit.service.js';
import { sendMail } from './mail.service.js';
import { TEMP_PASSWORD_HOURS } from './password.service.js';

export interface InvitationResult {
  sent: boolean;
  sentTo: string;
  expiresAt: string;
}

const dateTime = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Guatemala',
});

export function temporaryPasswordExpiry(now = new Date()): Date {
  return new Date(now.getTime() + TEMP_PASSWORD_HOURS * 60 * 60 * 1000);
}

/**
 * E-mails the account data to the employee. The temporary password goes only to the employee:
 * the Administrator never sees it, and it is never logged or written to the audit log.
 * A failure does not undo the account: the Administrator can send a new invitation.
 */
export async function sendInvitation(
  user: { id: string; username: string; fullName: string; email: string },
  temporaryPassword: string,
  expiresAt: Date,
  kind: 'created' | 'reset',
  ctx: AuditContext,
): Promise<InvitationResult> {
  const intro =
    kind === 'created'
      ? 'Se creó tu cuenta en el sistema de gestión de FarmaCentro.'
      : 'El Administrador restableció el acceso a tu cuenta de FarmaCentro.';
  const text = [
    `Hola, ${user.fullName}:`,
    '',
    intro,
    '',
    `Usuario: ${user.username}`,
    `Contraseña temporal: ${temporaryPassword}`,
    `Vence: ${dateTime.format(expiresAt)} (hora de Guatemala)`,
    '',
    `Ingresa en: ${env.CLIENT_ORIGIN}/login`,
    '',
    'Al iniciar sesión te enviaremos a este correo un código de verificación de 6 dígitos y después',
    'deberás elegir tu propia contraseña (mínimo 12 caracteres). La contraseña temporal deja de',
    'funcionar en cuanto la cambies o cuando venza.',
    '',
    'Si no esperabas este correo, avisa al Administrador del sistema.',
  ].join('\n');

  let sent = true;
  try {
    await sendMail({
      to: user.email,
      subject: kind === 'created' ? 'FarmaCentro: tu cuenta está lista' : 'FarmaCentro: nueva contraseña temporal',
      text,
    });
  } catch (error) {
    sent = false;
    logger.warn({ err: error, userId: user.id }, 'invitation e-mail could not be sent');
  }
  await appendAudit(ctx, {
    action: 'user.invitation.sent',
    result: sent ? 'success' : 'failure',
    entity: 'user',
    entityId: user.id,
    details: { kind, expiresAt: expiresAt.toISOString() },
  });
  return { sent, sentTo: maskEmail(user.email), expiresAt: expiresAt.toISOString() };
}
