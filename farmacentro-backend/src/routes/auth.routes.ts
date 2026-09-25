import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import * as me from '../controllers/me.controller.js';
import { requireAuth, requirePasswordStage } from '../middlewares/auth.js';
import { loginLimiter, mfaLimiter, otpSendLimiter } from '../middlewares/rateLimits.js';
import { paramId, requireStepUp } from '../middlewares/stepUp.js';
import { validate } from '../middlewares/validate.js';
import {
  ChangePasswordBody,
  CodeBody,
  LoginBody,
  RegisterOptionsBody,
  StepUpCodeBody,
  StepUpTargetBody,
  WebAuthnRegisterVerifyBody,
  WebAuthnVerifyBody,
} from '../validation/auth.schemas.js';
import { IdParams } from '../validation/common.js';

export const authRouter = Router();

// Login: first factor, then fingerprint (WebAuthn) or e-mailed code.
authRouter.post('/login', loginLimiter, validate({ body: LoginBody }), auth.login);
authRouter.post('/webauthn/login/options', requirePasswordStage, validate({}), auth.webauthnLoginOptions);
authRouter.post(
  '/webauthn/login/verify',
  mfaLimiter,
  requirePasswordStage,
  validate({ body: WebAuthnVerifyBody }),
  auth.webauthnLoginVerify,
);
authRouter.post('/email-otp/send', otpSendLimiter, requirePasswordStage, validate({}), auth.emailOtpSend);
authRouter.post('/email-otp/verify', mfaLimiter, requirePasswordStage, validate({ body: CodeBody }), auth.emailOtpVerify);

// Session.
authRouter.post('/logout', validate({}), auth.logout);
authRouter.get('/me', requireAuth({ allowPasswordChange: true }), validate({}), auth.me);
authRouter.post(
  '/password/change',
  requireAuth({ allowPasswordChange: true }),
  validate({ body: ChangePasswordBody }),
  auth.changePassword,
);

// Re-authentication for sensitive operations.
authRouter.post('/step-up/webauthn/options', requireAuth(), validate({ body: StepUpTargetBody }), auth.stepUpWebauthnOptions);
authRouter.post(
  '/step-up/webauthn/verify',
  mfaLimiter,
  requireAuth(),
  validate({ body: WebAuthnVerifyBody }),
  auth.stepUpWebauthnVerify,
);
authRouter.post(
  '/step-up/email-otp/send',
  otpSendLimiter,
  requireAuth(),
  validate({ body: StepUpTargetBody }),
  auth.stepUpEmailSend,
);
authRouter.post(
  '/step-up/email-otp/verify',
  mfaLimiter,
  requireAuth(),
  validate({ body: StepUpCodeBody }),
  auth.stepUpEmailVerify,
);

export const meRouter = Router();
meRouter.use(requireAuth());
meRouter.get('/webauthn/credentials', validate({}), me.listCredentials);
meRouter.post(
  '/webauthn/register/options',
  validate({ body: RegisterOptionsBody }),
  requireStepUp('webauthn.register'),
  me.registerOptions,
);
meRouter.post('/webauthn/register/verify', validate({ body: WebAuthnRegisterVerifyBody }), me.registerVerify);
meRouter.delete(
  '/webauthn/credentials/:id',
  validate({ params: IdParams }),
  requireStepUp('webauthn.revoke', paramId),
  me.revokeCredential,
);
