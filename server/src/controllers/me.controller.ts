import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { input } from '../middlewares/validate.js';
import { WebAuthnCredential } from '../models/WebAuthnCredential.js';
import { appendAudit } from '../services/audit.service.js';
import { notifyUser } from '../services/mail.service.js';
import {
  activeCredentials,
  buildRegistrationOptions,
  CHALLENGE_TTL_MS,
  MAX_CREDENTIALS_PER_USER,
  verifyRegistration,
} from '../services/webauthn.service.js';
import { Errors } from '../utils/httpError.js';
import { auditContext } from '../utils/requestContext.js';
import type { RegisterOptionsInput, WebAuthnRegisterVerifyInput } from '../validation/auth.schemas.js';

function currentUser(req: Request) {
  if (!req.user) throw Errors.unauthenticated();
  return req.user;
}

export async function listCredentials(req: Request, res: Response): Promise<void> {
  const credentials = await activeCredentials(currentUser(req).id);
  res.json(
    credentials.map((c) => ({
      id: String(c._id),
      nickname: c.nickname,
      deviceType: c.deviceType,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
    })),
  );
}

/** Route is protected by requireStepUp('webauthn.register'). */
export async function registerOptions(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const { body } = input<unknown, unknown, RegisterOptionsInput>(req);
  if ((await activeCredentials(user.id)).length >= MAX_CREDENTIALS_PER_USER) {
    throw Errors.conflict(`Solo se permiten ${MAX_CREDENTIALS_PER_USER} huellas activas por usuario.`);
  }
  const options = await buildRegistrationOptions(user);
  req.session.webauthnChallenge = {
    value: options.challenge,
    purpose: 'register',
    action: null,
    targetId: null,
    nickname: body.nickname,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  };
  res.json(options);
}

export async function registerVerify(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const { body } = input<unknown, unknown, WebAuthnRegisterVerifyInput>(req);
  const challenge = req.session.webauthnChallenge;
  delete req.session.webauthnChallenge;
  const info = await verifyRegistration(challenge, body.response as RegistrationResponseJSON);
  if (!info || !challenge) {
    await appendAudit(auditContext(req), {
      action: 'webauthn.credential.registered',
      result: 'failure',
      entity: 'user',
      entityId: user.id,
    });
    throw Errors.badRequest('No se pudo registrar la huella. Intenta de nuevo.');
  }
  const credential = await WebAuthnCredential.create({
    userId: new Types.ObjectId(user.id),
    credentialId: info.credential.id,
    publicKey: Buffer.from(info.credential.publicKey),
    counter: info.credential.counter,
    transports: info.credential.transports ?? [],
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    nickname: challenge.nickname ?? 'Huella',
  });
  await appendAudit(auditContext(req), {
    action: 'webauthn.credential.registered',
    result: 'success',
    entity: 'webauthn_credential',
    entityId: String(credential._id),
    details: { nickname: credential.nickname, deviceType: credential.deviceType },
  });
  await notifyUser(user.email, 'nueva huella registrada', `Se registró la huella "${credential.nickname}" en tu cuenta.`);
  res.status(201).json({ id: String(credential._id), nickname: credential.nickname, createdAt: credential.createdAt });
}

/** Route is protected by requireStepUp('webauthn.revoke', :id). */
export async function revokeCredential(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const { params } = input<{ id: string }>(req);
  const credentials = await activeCredentials(user.id);
  const target = credentials.find((c) => String(c._id) === params.id);
  if (!target) {
    throw Errors.notFound();
  }
  if (!env.STEP_UP_ALLOW_EMAIL && credentials.length === 1) {
    throw Errors.conflict('No puedes revocar tu única huella: las operaciones sensibles la requieren.');
  }
  await WebAuthnCredential.updateOne(
    { _id: target._id },
    { $set: { revokedAt: new Date(), revokedBy: new Types.ObjectId(user.id) } },
  );
  await appendAudit(auditContext(req), {
    action: 'webauthn.credential.revoked',
    result: 'success',
    entity: 'webauthn_credential',
    entityId: String(target._id),
    details: { nickname: target.nickname, by: 'owner' },
  });
  await notifyUser(user.email, 'huella revocada', `Se revocó la huella "${target.nickname}" de tu cuenta.`);
  res.status(204).end();
}
