import 'express-session';
import type { Role } from '../domain/roles.js';
import type { StepUpAction } from '../domain/stepUpActions.js';

export type AuthStage = 'password' | 'authenticated';
export type SecondFactorMethod = 'webauthn' | 'email_otp';

export interface WebAuthnChallenge {
  value: string;
  purpose: 'login' | 'step_up' | 'register';
  action: StepUpAction | null;
  targetId: string | null;
  nickname: string | null;
  expiresAt: number;
}

export interface StepUpGrant {
  id: string;
  action: StepUpAction;
  targetId: string | null;
  method: SecondFactorMethod;
  expiresAt: number;
}

declare module 'express-session' {
  interface SessionData {
    userId: string;
    authStage: AuthStage;
    passwordVerifiedAt: number;
    authenticatedAt: number;
    mfaMethod: SecondFactorMethod;
    webauthnChallenge: WebAuthnChallenge;
    stepUpGrant: StepUpGrant;
  }
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthUser;
      validated: {
        params: unknown;
        query: unknown;
        body: unknown;
      };
    }
  }
}
