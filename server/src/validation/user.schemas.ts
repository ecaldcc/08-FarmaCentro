import { z } from 'zod';
import { Email, ObjectId, Page, PersonName, Reason, Role, SearchText, Username } from './common.js';

export const ListUsersQuery = Page.extend({
  role: Role.optional(),
  status: z.enum(['active', 'disabled']).optional(),
  q: SearchText.optional(),
});

export const CreateUserBody = z.strictObject({
  username: Username,
  fullName: PersonName,
  email: Email,
  role: Role,
});

export const UpdateUserBody = z
  .strictObject({ fullName: PersonName.optional(), email: Email.optional() })
  .refine((body) => body.fullName !== undefined || body.email !== undefined, {
    message: 'Indica al menos un campo',
  });

export const ChangeRoleBody = z.strictObject({ role: Role, reason: Reason });
export const ChangeStatusBody = z.strictObject({ status: z.enum(['active', 'disabled']), reason: Reason });
export const ReasonBody = z.strictObject({ reason: Reason });
export const UserCredentialParams = z.strictObject({ id: ObjectId, credId: ObjectId });

export type ListUsersInput = z.infer<typeof ListUsersQuery>;
export type CreateUserInput = z.infer<typeof CreateUserBody>;
export type UpdateUserInput = z.infer<typeof UpdateUserBody>;
export type ChangeRoleInput = z.infer<typeof ChangeRoleBody>;
export type ChangeStatusInput = z.infer<typeof ChangeStatusBody>;
export type ReasonInput = z.infer<typeof ReasonBody>;
