import { Types } from 'mongoose';
import type { Role } from '../domain/roles.js';
import { User, type IUser } from '../models/User.js';
import { WebAuthnCredential } from '../models/WebAuthnCredential.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { Errors } from '../utils/httpError.js';
import { op } from '../utils/trusted.js';
import type { CreateUserInput, ListUsersInput, UpdateUserInput } from '../validation/user.schemas.js';
import { appendAudit, runAuditedTransaction, type AuditContext } from './audit.service.js';
import { isLocked } from './lockout.service.js';
import { notifyUser } from './mail.service.js';
import { generateTemporaryPassword, hashPassword } from './password.service.js';

type LeanUser = Omit<IUser, 'passwordHash'>;

function toDto(user: LeanUser, credentialCount: number) {
  return {
    id: String(user._id),
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    locked: isLocked(user.lockedUntil),
    lockedUntil: user.lockedUntil,
    hasWebAuthn: credentialCount > 0,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

async function credentialCounts(userIds: Types.ObjectId[]): Promise<Map<string, number>> {
  const rows = await WebAuthnCredential.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { userId: { $in: userIds }, revokedAt: null } },
    { $group: { _id: '$userId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

export async function listUsers(query: ListUsersInput) {
  const filter: Record<string, unknown> = {};
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  if (query.q) {
    const pattern = op({ $regex: escapeRegex(query.q), $options: 'i' });
    filter.$or = [{ username: pattern }, { fullName: pattern }];
  }
  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ username: 1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    User.countDocuments(filter),
  ]);
  const counts = await credentialCounts(items.map((u) => u._id));
  return {
    items: items.map((u) => toDto(u, counts.get(String(u._id)) ?? 0)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

async function findUserOr404(id: string): Promise<LeanUser> {
  const user = await User.findById(id).lean();
  if (!user) throw Errors.notFound();
  return user;
}

export async function getUser(id: string) {
  const user = await findUserOr404(id);
  const credentials = await WebAuthnCredential.find({ userId: user._id, revokedAt: null }).lean();
  return {
    ...toDto(user, credentials.length),
    credentials: credentials.map((c) => ({
      id: String(c._id),
      nickname: c.nickname,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
    })),
  };
}

export async function createUser(data: CreateUserInput, actorId: string, ctx: AuditContext) {
  const exists = await User.exists({ $or: [{ username: data.username }, { email: data.email }] });
  if (exists) {
    throw Errors.conflict('Ya existe un usuario con ese nombre de usuario o correo.');
  }
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const user = await runAuditedTransaction(ctx, async ({ session, audit }) => {
    const [created] = await User.create(
      [
        {
          ...data,
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: true,
          createdBy: new Types.ObjectId(actorId),
        },
      ],
      { session },
    );
    if (!created) throw new Error('user not created');
    audit({
      action: 'user.created',
      result: 'success',
      entity: 'user',
      entityId: created._id,
      details: { username: created.username, role: created.role },
    });
    return created;
  });
  const dto = await getUser(String(user._id));
  // The temporary password is returned once and never logged or audited.
  return { user: dto, temporaryPassword };
}

export async function updateUser(id: string, data: UpdateUserInput, actorId: string, ctx: AuditContext) {
  const before = await findUserOr404(id);
  if (data.email && data.email !== before.email && (await User.exists({ email: data.email }))) {
    throw Errors.conflict('Ya existe un usuario con ese correo.');
  }
  await runAuditedTransaction(ctx, async ({ session, audit }) => {
    await User.updateOne(
      { _id: before._id },
      { $set: { ...data, updatedBy: new Types.ObjectId(actorId) } },
      { session },
    );
    audit({
      action: 'user.updated',
      result: 'success',
      entity: 'user',
      entityId: before._id,
      details: { fields: Object.keys(data), emailChanged: Boolean(data.email && data.email !== before.email) },
    });
  });
  if (data.email && data.email !== before.email) {
    const body = 'El correo de tu cuenta de FarmaCentro fue cambiado por el Administrador.';
    await notifyUser(before.email, 'correo de la cuenta cambiado', body);
    await notifyUser(data.email, 'correo de la cuenta cambiado', body);
  }
  return getUser(id);
}

/** Segregation of duties: nobody changes or disables their own account, and at least one admin remains. */
async function guardAdminChange(target: LeanUser, actorId: string, removesAdmin: boolean): Promise<void> {
  if (String(target._id) === actorId) {
    throw Errors.conflict('No puedes cambiar tu propio rol ni deshabilitar tu propia cuenta.');
  }
  if (removesAdmin && target.role === 'admin' && target.status === 'active') {
    const admins = await User.countDocuments({ role: 'admin', status: 'active' });
    if (admins <= 1) {
      throw Errors.conflict('Debe quedar al menos un Administrador activo.');
    }
  }
}

export async function changeRole(id: string, role: Role, reason: string, actorId: string, ctx: AuditContext, stepUpMethod: string) {
  const target = await findUserOr404(id);
  await guardAdminChange(target, actorId, role !== 'admin');
  if (target.role === role) {
    throw Errors.conflict('El usuario ya tiene ese rol.');
  }
  await runAuditedTransaction(ctx, async ({ session, audit }) => {
    await User.updateOne({ _id: target._id }, { $set: { role, updatedBy: new Types.ObjectId(actorId) } }, { session });
    audit({
      action: 'user.role.changed',
      result: 'success',
      entity: 'user',
      entityId: target._id,
      details: { fromRole: target.role, toRole: role, reason, stepUpMethod },
    });
  });
  await notifyUser(target.email, 'rol actualizado', `Tu rol en el sistema cambió de ${target.role} a ${role}.`);
  return getUser(id);
}

export async function changeStatus(
  id: string,
  status: 'active' | 'disabled',
  reason: string,
  actorId: string,
  ctx: AuditContext,
  stepUpMethod: string,
) {
  const target = await findUserOr404(id);
  await guardAdminChange(target, actorId, status === 'disabled');
  if (target.status === status) {
    throw Errors.conflict('El usuario ya tiene ese estado.');
  }
  await runAuditedTransaction(ctx, async ({ session, audit }) => {
    await User.updateOne({ _id: target._id }, { $set: { status, updatedBy: new Types.ObjectId(actorId) } }, { session });
    audit({
      action: status === 'disabled' ? 'user.disabled' : 'user.enabled',
      result: 'success',
      entity: 'user',
      entityId: target._id,
      details: { reason, stepUpMethod },
    });
  });
  return getUser(id);
}

export async function unlockUser(id: string, reason: string, ctx: AuditContext, stepUpMethod: string) {
  const target = await findUserOr404(id);
  await User.updateOne({ _id: target._id }, { $set: { lockedUntil: null, failedLoginCount: 0 } });
  await appendAudit(ctx, {
    action: 'auth.account.unlocked',
    result: 'success',
    entity: 'user',
    entityId: target._id,
    details: { reason, stepUpMethod },
  });
}

export async function resetPassword(id: string, reason: string, actorId: string, ctx: AuditContext, stepUpMethod: string) {
  const target = await findUserOr404(id);
  if (String(target._id) === actorId) {
    throw Errors.conflict('Usa "Cambiar contraseña" en Mi cuenta para tu propia contraseña.');
  }
  const temporaryPassword = generateTemporaryPassword();
  await User.updateOne(
    { _id: target._id },
    {
      $set: {
        passwordHash: await hashPassword(temporaryPassword),
        passwordChangedAt: new Date(),
        mustChangePassword: true,
        lockedUntil: null,
        failedLoginCount: 0,
        updatedBy: new Types.ObjectId(actorId),
      },
    },
  );
  await appendAudit(ctx, {
    action: 'auth.password.reset',
    result: 'success',
    entity: 'user',
    entityId: target._id,
    details: { reason, stepUpMethod },
  });
  await notifyUser(
    target.email,
    'contraseña restablecida',
    'El Administrador restableció tu contraseña. Deberás cambiarla al iniciar sesión.',
  );
  return { temporaryPassword };
}

export async function revokeUserCredential(
  userId: string,
  credentialId: string,
  reason: string,
  actorId: string,
  ctx: AuditContext,
  stepUpMethod: string,
) {
  const target = await findUserOr404(userId);
  const result = await WebAuthnCredential.findOneAndUpdate(
    { _id: new Types.ObjectId(credentialId), userId: target._id, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedBy: new Types.ObjectId(actorId) } },
  ).lean();
  if (!result) throw Errors.notFound();
  await appendAudit(ctx, {
    action: 'webauthn.credential.revoked',
    result: 'success',
    entity: 'webauthn_credential',
    entityId: result._id,
    details: { userId, nickname: result.nickname, reason, stepUpMethod, by: 'admin' },
  });
  await notifyUser(target.email, 'huella revocada', `El Administrador revocó la huella "${result.nickname}" de tu cuenta.`);
}
