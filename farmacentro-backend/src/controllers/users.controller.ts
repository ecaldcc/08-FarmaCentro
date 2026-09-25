import type { Request, Response } from 'express';
import { input } from '../middlewares/validate.js';
import * as users from '../services/user.service.js';
import { Errors } from '../utils/httpError.js';
import { auditContext } from '../utils/requestContext.js';
import type {
  ChangeRoleInput,
  ChangeStatusInput,
  CreateUserInput,
  ListUsersInput,
  ReasonInput,
  UpdateUserInput,
} from '../validation/user.schemas.js';

type IdParams = { id: string };

function actorId(req: Request): string {
  if (!req.user) throw Errors.unauthenticated();
  return req.user.id;
}

function stepUpMethod(res: Response): string {
  return res.locals.stepUpMethod ?? 'unknown';
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await users.listUsers(input<unknown, ListUsersInput>(req).query));
}

export async function get(req: Request, res: Response): Promise<void> {
  res.json(await users.getUser(input<IdParams>(req).params.id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const { body } = input<unknown, unknown, CreateUserInput>(req);
  res.status(201).json(await users.createUser(body, actorId(req), auditContext(req)));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { params, body } = input<IdParams, unknown, UpdateUserInput>(req);
  res.json(await users.updateUser(params.id, body, actorId(req), auditContext(req)));
}

export async function changeRole(req: Request, res: Response): Promise<void> {
  const { params, body } = input<IdParams, unknown, ChangeRoleInput>(req);
  res.json(await users.changeRole(params.id, body.role, body.reason, actorId(req), auditContext(req), stepUpMethod(res)));
}

export async function changeStatus(req: Request, res: Response): Promise<void> {
  const { params, body } = input<IdParams, unknown, ChangeStatusInput>(req);
  res.json(
    await users.changeStatus(params.id, body.status, body.reason, actorId(req), auditContext(req), stepUpMethod(res)),
  );
}

export async function unlock(req: Request, res: Response): Promise<void> {
  const { params, body } = input<IdParams, unknown, ReasonInput>(req);
  await users.unlockUser(params.id, body.reason, auditContext(req), stepUpMethod(res));
  res.status(204).end();
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { params, body } = input<IdParams, unknown, ReasonInput>(req);
  res.json(await users.resetPassword(params.id, body.reason, actorId(req), auditContext(req), stepUpMethod(res)));
}

export async function revokeCredential(req: Request, res: Response): Promise<void> {
  const { params, body } = input<{ id: string; credId: string }, unknown, ReasonInput>(req);
  await users.revokeUserCredential(params.id, params.credId, body.reason, actorId(req), auditContext(req), stepUpMethod(res));
  res.status(204).end();
}
