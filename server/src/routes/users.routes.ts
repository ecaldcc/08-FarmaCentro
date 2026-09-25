import { Router } from 'express';
import * as users from '../controllers/users.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { paramId, requireStepUp } from '../middlewares/stepUp.js';
import { validate } from '../middlewares/validate.js';
import { IdParams } from '../validation/common.js';
import {
  ChangeRoleBody,
  ChangeStatusBody,
  CreateUserBody,
  ListUsersQuery,
  ReasonBody,
  UpdateUserBody,
  UserCredentialParams,
} from '../validation/user.schemas.js';

export const usersRouter = Router();
usersRouter.use(requireAuth(), requireRole('admin'));

usersRouter.get('/', validate({ query: ListUsersQuery }), users.list);
usersRouter.get('/:id', validate({ params: IdParams }), users.get);
usersRouter.post('/', validate({ body: CreateUserBody }), requireStepUp('user.create'), users.create);
usersRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateUserBody }),
  requireStepUp('user.update', paramId),
  users.update,
);
usersRouter.put(
  '/:id/role',
  validate({ params: IdParams, body: ChangeRoleBody }),
  requireStepUp('user.role.change', paramId),
  users.changeRole,
);
usersRouter.put(
  '/:id/status',
  validate({ params: IdParams, body: ChangeStatusBody }),
  requireStepUp('user.status.change', paramId),
  users.changeStatus,
);
usersRouter.post(
  '/:id/unlock',
  validate({ params: IdParams, body: ReasonBody }),
  requireStepUp('user.unlock', paramId),
  users.unlock,
);
usersRouter.post(
  '/:id/password-reset',
  validate({ params: IdParams, body: ReasonBody }),
  requireStepUp('user.password.reset', paramId),
  users.resetPassword,
);
usersRouter.delete(
  '/:id/webauthn/:credId',
  validate({ params: UserCredentialParams, body: ReasonBody }),
  requireStepUp('user.webauthn.revoke', paramId),
  users.revokeCredential,
);
