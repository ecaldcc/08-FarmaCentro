import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { env } from '../config/env.js';
import type { StepUpAction } from '../domain/stepUpActions.js';
import type { SecondFactorMethod } from '../types/express.js';
import { HttpError } from '../utils/httpError.js';

export const STEP_UP_TTL_MS = 2 * 60 * 1000;

// Consumed grant ids (single API instance, D-09): closes the window in which two parallel
// requests could reuse the same grant before the session is saved.
const consumedGrants = new Map<string, number>();

function pruneConsumed(now: number): void {
  for (const [id, expiresAt] of consumedGrants) {
    if (expiresAt < now) consumedGrants.delete(id);
  }
}

export function allowedStepUpMethods(): SecondFactorMethod[] {
  return env.STEP_UP_ALLOW_EMAIL ? ['webauthn', 'email_otp'] : ['webauthn'];
}

export function grantStepUp(req: Request, action: StepUpAction, targetId: string | null, method: SecondFactorMethod) {
  const grant = { id: randomUUID(), action, targetId, method, expiresAt: Date.now() + STEP_UP_TTL_MS };
  req.session.stepUpGrant = grant;
  return grant;
}

export function stepUpRequired(action: StepUpAction, targetId: string | null): HttpError {
  return new HttpError(403, 'STEP_UP_REQUIRED', 'Esta operación requiere confirmar tu identidad.', {
    action,
    targetId,
    methods: allowedStepUpMethods(),
  });
}

/**
 * Consumes the one-time grant for (action, targetId). Returns the method that was used.
 * Throws STEP_UP_REQUIRED when there is no valid grant.
 */
export function consumeStepUp(req: Request, action: StepUpAction, targetId: string | null): SecondFactorMethod {
  const now = Date.now();
  pruneConsumed(now);
  const grant = req.session.stepUpGrant;
  const valid =
    grant !== undefined &&
    grant.action === action &&
    grant.targetId === targetId &&
    grant.expiresAt > now &&
    !consumedGrants.has(grant.id);
  if (!valid || !grant) {
    throw stepUpRequired(action, targetId);
  }
  consumedGrants.set(grant.id, grant.expiresAt);
  delete req.session.stepUpGrant;
  return grant.method;
}
