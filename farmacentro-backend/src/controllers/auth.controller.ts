import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { PERMISSIONS } from '../domain/roles.js';
import { sessionExpiresAt } from '../middlewares/auth.js';
import { input } from '../middlewares/validate.js';
import { appendAudit } from '../services/audit.service.js';
import {
  changeOwnPassword,
  completeLogin,
  recordSecondFactorFailure,
  verifyFirstFactor,
} from '../services/auth.service.js';
import { sendOtp, verifyOtp } from '../services/otp.service.js';
import { allowedStepUpMethods, grantStepUp } from '../services/stepUp.service.js';
import {
  buildAuthenticationOptions,
  CHALLENGE_TTL_MS,
  hasActiveCredential,
  verifyAssertion,
} from '../services/webauthn.service.js';
import type { SecondFactorMethod } from '../types/express.js';
import { Errors } from '../utils/httpError.js';
import { auditContext, destroySession, regenerateSession } from '../utils/requestContext.js';
import type {
  ChangePasswordInput,
  CodeInput,
  LoginInput,
  StepUpTargetInput,
  WebAuthnVerifyInput,
} from '../validation/auth.schemas.js';

function currentUser(req: Request) {
  if (!req.user) throw Errors.unauthenticated();
  return req.user;
}

async function describeSession(req: Request) {
  const user = currentUser(req);
  return {
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      hasWebAuthn: await hasActiveCredential(user.id),
    },
    permissions: PERMISSIONS[user.role],
    stepUpMethods: allowedStepUpMethods(),
    sessionExpiresAt: sessionExpiresAt(),
  };
}

/** Second factor succeeded: new session id, authenticated stage (control 8.5). */
async function finishLogin(req: Request, res: Response, method: SecondFactorMethod): Promise<void> {
  const user = currentUser(req);
  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.authStage = 'authenticated';
  req.session.authenticatedAt = Date.now();
  req.session.mfaMethod = method;
  await completeLogin(user.id, method, auditContext(req));
  res.json(await describeSession(req));
}

/** A failed second factor may lock the account; then the half-open session is closed. */
async function failSecondFactor(
  req: Request,
  action: 'auth.mfa.webauthn.failure' | 'auth.mfa.email.failure' | 'auth.stepup.failed',
  details: Record<string, unknown>,
): Promise<never> {
  const user = currentUser(req);
  const { locked } = await recordSecondFactorFailure(user.id, action, details, auditContext(req));
  if (locked) {
    await destroySession(req);
    throw Errors.unauthenticated();
  }
  throw Errors.invalidSecondFactor();
}

// ------------------------------------------------------------------------------------ login

export async function login(req: Request, res: Response): Promise<void> {
  const { body } = input<unknown, unknown, LoginInput>(req);
  const user = await verifyFirstFactor(body.username, body.password, auditContext(req));
  await regenerateSession(req);
  req.session.userId = String(user._id);
  req.session.authStage = 'password';
  req.session.passwordVerifiedAt = Date.now();
  const methods = (await hasActiveCredential(String(user._id))) ? ['webauthn', 'email'] : ['email'];
  res.json({ next: 'mfa', methods });
}

export async function webauthnLoginOptions(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const options = await buildAuthenticationOptions(user.id);
  if (!options.allowCredentials || options.allowCredentials.length === 0) {
    throw Errors.conflict('No tienes huellas registradas. Usa el código por correo.');
  }
  req.session.webauthnChallenge = {
    value: options.challenge,
    purpose: 'login',
    action: null,
    targetId: null,
    nickname: null,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  };
  res.json(options);
}

export async function webauthnLoginVerify(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const { body } = input<unknown, unknown, WebAuthnVerifyInput>(req);
  const challenge = req.session.webauthnChallenge;
  delete req.session.webauthnChallenge; // single use
  const outcome =
    challenge?.purpose === 'login'
      ? await verifyAssertion(user.id, challenge, body.response as AuthenticationResponseJSON)
      : ({ ok: false, reason: 'challenge' } as const);
  if (!outcome.ok) {
    if (outcome.reason === 'counter') {
      await appendAudit(auditContext(req), {
        action: 'webauthn.counter.anomaly',
        result: 'failure',
        entity: 'webauthn_credential',
        entityId: outcome.credentialId ?? null,
      });
    }
    await failSecondFactor(req, 'auth.mfa.webauthn.failure', { reason: outcome.reason });
  }
  await finishLogin(req, res, 'webauthn');
}

export async function emailOtpSend(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const result = await sendOtp(user, { purpose: 'login', action: null, targetId: null }, auditContext(req));
  res.json(result);
}

export async function emailOtpVerify(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const { body } = input<unknown, unknown, CodeInput>(req);
  const ok = await verifyOtp(user, { purpose: 'login', action: null, targetId: null }, body.code, auditContext(req));
  if (!ok) {
    await failSecondFactor(req, 'auth.mfa.email.failure', { purpose: 'login' });
  }
  await finishLogin(req, res, 'email_otp');
}

// ---------------------------------------------------------------------------------- session

export async function logout(req: Request, res: Response): Promise<void> {
  if (req.user) {
    await appendAudit(auditContext(req), {
      action: 'auth.logout',
      result: 'success',
      entity: 'user',
      entityId: req.user.id,
    });
  }
  await destroySession(req);
  res.clearCookie('fc.sid', { path: '/' });
  res.status(204).end();
}

export async function me(req: Request, res: Response): Promise<void> {
  res.json(await describeSession(req));
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const { body } = input<unknown, unknown, ChangePasswordInput>(req);
  await changeOwnPassword(user.id, body.currentPassword, body.newPassword, auditContext(req));
  // New session id after a credential change; the authenticated state is preserved.
  const { authenticatedAt, mfaMethod } = req.session;
  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.authStage = 'authenticated';
  req.session.authenticatedAt = authenticatedAt ?? Date.now();
  if (mfaMethod) req.session.mfaMethod = mfaMethod;
  res.status(204).end();
}

// ---------------------------------------------------------------------------------- step-up

export async function stepUpWebauthnOptions(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const { body } = input<unknown, unknown, StepUpTargetInput>(req);
  const options = await buildAuthenticationOptions(user.id);
  if (!options.allowCredentials || options.allowCredentials.length === 0) {
    throw Errors.conflict('No tienes huellas registradas.');
  }
  req.session.webauthnChallenge = {
    value: options.challenge,
    purpose: 'step_up',
    action: body.action,
    targetId: body.targetId,
    nickname: null,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  };
  res.json(options);
}

export async function stepUpWebauthnVerify(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const { body } = input<unknown, unknown, WebAuthnVerifyInput>(req);
  const challenge = req.session.webauthnChallenge;
  delete req.session.webauthnChallenge;
  if (!challenge || challenge.purpose !== 'step_up' || !challenge.action) {
    await failSecondFactor(req, 'auth.stepup.failed', { method: 'webauthn', reason: 'challenge' });
  }
  const { action, targetId } = challenge!;
  const outcome = await verifyAssertion(user.id, challenge, body.response as AuthenticationResponseJSON);
  if (!outcome.ok) {
    await failSecondFactor(req, 'auth.stepup.failed', {
      method: 'webauthn',
      reason: outcome.reason,
      stepUpAction: action,
      targetId,
    });
  }
  const grant = grantStepUp(req, action!, targetId, 'webauthn');
  await appendAudit(auditContext(req), {
    action: 'auth.stepup.granted',
    result: 'success',
    entity: 'user',
    entityId: user.id,
    details: { stepUpAction: action, targetId, method: 'webauthn' },
  });
  res.json({ action, targetId, grantExpiresAt: new Date(grant.expiresAt).toISOString() });
}

export async function stepUpEmailSend(req: Request, res: Response): Promise<void> {
  if (!env.STEP_UP_ALLOW_EMAIL) {
    throw Errors.forbidden();
  }
  const user = currentUser(req);
  const { body } = input<unknown, unknown, StepUpTargetInput>(req);
  const result = await sendOtp(
    user,
    { purpose: 'step_up', action: body.action, targetId: body.targetId },
    auditContext(req),
  );
  res.json(result);
}

export async function stepUpEmailVerify(req: Request, res: Response): Promise<void> {
  if (!env.STEP_UP_ALLOW_EMAIL) {
    throw Errors.forbidden();
  }
  const user = currentUser(req);
  const { body } = input<unknown, unknown, StepUpTargetInput & CodeInput>(req);
  const binding = { purpose: 'step_up' as const, action: body.action, targetId: body.targetId };
  const ok = await verifyOtp(user, binding, body.code, auditContext(req));
  if (!ok) {
    await failSecondFactor(req, 'auth.stepup.failed', {
      method: 'email_otp',
      stepUpAction: body.action,
      targetId: body.targetId,
    });
  }
  const grant = grantStepUp(req, body.action, body.targetId, 'email_otp');
  await appendAudit(auditContext(req), {
    action: 'auth.stepup.granted',
    result: 'success',
    entity: 'user',
    entityId: user.id,
    details: { stepUpAction: body.action, targetId: body.targetId, method: 'email_otp' },
  });
  res.json({ action: body.action, targetId: body.targetId, grantExpiresAt: new Date(grant.expiresAt).toISOString() });
}
