import { z } from 'zod';
import { Code6, ObjectId, Password, StepUpAction, Username, WebAuthnAuthResponse, WebAuthnRegResponse } from './common.js';

export const LoginBody = z.strictObject({
  username: Username,
  password: z.string().min(1).max(128),
});

export const WebAuthnVerifyBody = z.strictObject({ response: WebAuthnAuthResponse });
export const WebAuthnRegisterVerifyBody = z.strictObject({ response: WebAuthnRegResponse });
export const RegisterOptionsBody = z.strictObject({ nickname: z.string().trim().min(1).max(50) });

export const CodeBody = z.strictObject({ code: Code6 });

export const StepUpTargetBody = z.strictObject({
  action: StepUpAction,
  targetId: ObjectId.nullable(),
});

export const StepUpCodeBody = z.strictObject({
  action: StepUpAction,
  targetId: ObjectId.nullable(),
  code: Code6,
});

export const ChangePasswordBody = z
  .strictObject({ currentPassword: z.string().min(1).max(128), newPassword: Password })
  .refine((body) => body.newPassword !== body.currentPassword, {
    message: 'La nueva contraseña debe ser distinta de la actual',
    path: ['newPassword'],
  });

export type LoginInput = z.infer<typeof LoginBody>;
export type WebAuthnVerifyInput = z.infer<typeof WebAuthnVerifyBody>;
export type WebAuthnRegisterVerifyInput = z.infer<typeof WebAuthnRegisterVerifyBody>;
export type RegisterOptionsInput = z.infer<typeof RegisterOptionsBody>;
export type CodeInput = z.infer<typeof CodeBody>;
export type StepUpTargetInput = z.infer<typeof StepUpTargetBody>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordBody>;
