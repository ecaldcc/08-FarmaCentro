import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { ENROLLMENT_ACTIONS, type StepUpAction } from '../domain/stepUpActions.js';
import type { SecondFactorMethod } from '../types/express.js';
import { Errors, HttpError } from '../utils/httpError.js';
import { hasTotp } from './totp.service.js';
import { hasActiveCredential } from './webauthn.service.js';

export const STEP_UP_TTL_MS = 2 * 60 * 1000;

// Consumed grant ids (single API instance, D-09): closes the window in which two parallel
// requests could reuse the same grant before the session is saved.
const consumedGrants = new Map<string, number>();

function pruneConsumed(now: number): void {
  for (const [id, expiresAt] of consumedGrants) {
    if (expiresAt < now) consumedGrants.delete(id);
  }
}

/**
 * Methods the user can use right now (decision D-32): the authenticator app and the fingerprint.
 * The e-mailed code only serves to register the first strong factor; without `action`, the list is
 * the one for critical operations.
 */
export async function availableStepUpMethods(userId: string, action?: StepUpAction): Promise<SecondFactorMethod[]> {
  const [totp, webauthn] = await Promise.all([hasTotp(userId), hasActiveCredential(userId)]);
  const methods: SecondFactorMethod[] = [];
  if (totp) methods.push('totp');
  if (webauthn) methods.push('webauthn');
  if (methods.length === 0 && action && ENROLLMENT_ACTIONS.includes(action)) methods.push('email_otp');
  return methods;
}

export async function assertMethodAllowed(userId: string, action: StepUpAction, method: SecondFactorMethod): Promise<void> {
  if (!(await availableStepUpMethods(userId, action)).includes(method)) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Las operaciones críticas se confirman con la app autenticadora o la huella. Configúrala en Mi cuenta.',
    );
  }
}

export function grantStepUp(req: Request, action: StepUpAction, targetId: string | null, method: SecondFactorMethod) {
  const grant = { id: randomUUID(), action, targetId, method, expiresAt: Date.now() + STEP_UP_TTL_MS };
  req.session.stepUpGrant = grant;
  return grant;
}

export async function stepUpRequired(userId: string, action: StepUpAction, targetId: string | null): Promise<HttpError> {
  return new HttpError(403, 'STEP_UP_REQUIRED', 'Esta operación requiere confirmar tu identidad.', {
    action,
    targetId,
    methods: await availableStepUpMethods(userId, action),
  });
}

/**
 * Consumes the one-time grant for (action, targetId). Returns the method that was used.
 * Throws STEP_UP_REQUIRED when there is no valid grant.
 */
export async function consumeStepUp(req: Request, action: StepUpAction, targetId: string | null): Promise<SecondFactorMethod> {
  const now = Date.now();
  pruneConsumed(now);
  const grant = req.session.stepUpGrant;
  const valid =
    grant !== undefined &&
    grant.action === action &&
    grant.targetId === targetId &&
    grant.expiresAt > now &&
    !consumedGrants.has(grant.id) &&
    // Defence in depth: an e-mailed code never authorises a critical operation.
    (grant.method !== 'email_otp' || ENROLLMENT_ACTIONS.includes(action));
  if (!valid || !grant) {
    if (!req.user) throw Errors.unauthenticated();
    throw await stepUpRequired(req.user.id, action, targetId);
  }
  consumedGrants.set(grant.id, grant.expiresAt);
  delete req.session.stepUpGrant;
  return grant.method;
}
