import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { WebAuthnCredential, type IWebAuthnCredential } from '../models/WebAuthnCredential.js';
import type { WebAuthnChallenge } from '../types/express.js';

export const CHALLENGE_TTL_MS = 2 * 60 * 1000;
export const MAX_CREDENTIALS_PER_USER = 5;

export async function activeCredentials(userId: string) {
  return WebAuthnCredential.find({ userId: new Types.ObjectId(userId), revokedAt: null }).lean();
}

export async function hasActiveCredential(userId: string): Promise<boolean> {
  return (await WebAuthnCredential.countDocuments({ userId: new Types.ObjectId(userId), revokedAt: null })) > 0;
}

/** Options for navigator.credentials.get(): user verification is always required (fingerprint). */
export async function buildAuthenticationOptions(userId: string) {
  const credentials = await activeCredentials(userId);
  return generateAuthenticationOptions({
    rpID: env.RP_ID,
    allowCredentials: credentials.map((c) => ({ id: c.credentialId, transports: c.transports })),
    userVerification: 'required',
    timeout: 60_000,
  });
}

export type AssertionOutcome =
  | { ok: true; credential: IWebAuthnCredential }
  | { ok: false; reason: 'challenge' | 'unknown_credential' | 'verification' | 'counter'; credentialId?: string };

/** Verifies an assertion against the challenge stored in the session (single use). */
export async function verifyAssertion(
  userId: string,
  challenge: WebAuthnChallenge | undefined,
  response: AuthenticationResponseJSON,
): Promise<AssertionOutcome> {
  if (!challenge || challenge.expiresAt < Date.now()) {
    return { ok: false, reason: 'challenge' };
  }
  const credential = await WebAuthnCredential.findOne({
    credentialId: response.id,
    userId: new Types.ObjectId(userId),
    revokedAt: null,
  }).lean();
  if (!credential) {
    return { ok: false, reason: 'unknown_credential' };
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.value,
      expectedOrigin: env.CLIENT_ORIGIN,
      expectedRPID: env.RP_ID,
      requireUserVerification: true,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports,
      },
    });
  } catch (error) {
    const isCounter = error instanceof Error && error.message.includes('counter');
    return { ok: false, reason: isCounter ? 'counter' : 'verification', credentialId: String(credential._id) };
  }
  if (!verification.verified || !verification.authenticationInfo.userVerified) {
    return { ok: false, reason: 'verification', credentialId: String(credential._id) };
  }

  await WebAuthnCredential.updateOne(
    { _id: credential._id },
    { $set: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() } },
  );
  return { ok: true, credential };
}

export async function buildRegistrationOptions(user: { id: string; username: string; fullName: string }) {
  const credentials = await activeCredentials(user.id);
  return generateRegistrationOptions({
    rpName: env.RP_NAME,
    rpID: env.RP_ID,
    userName: user.username,
    userDisplayName: user.fullName,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    timeout: 60_000,
    excludeCredentials: credentials.map((c) => ({ id: c.credentialId, transports: c.transports })),
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'discouraged',
      userVerification: 'required',
    },
  });
}

export async function verifyRegistration(
  challenge: WebAuthnChallenge | undefined,
  response: RegistrationResponseJSON,
) {
  if (!challenge || challenge.purpose !== 'register' || challenge.expiresAt < Date.now()) {
    return null;
  }
  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.value,
      expectedOrigin: env.CLIENT_ORIGIN,
      expectedRPID: env.RP_ID,
      requireUserVerification: true,
    });
    return verification.verified ? verification.registrationInfo : null;
  } catch {
    return null;
  }
}
