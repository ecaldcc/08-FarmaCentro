export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'MFA_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'FORBIDDEN'
  | 'STEP_UP_REQUIRED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface FieldIssue {
  path: string;
  message: string;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const Errors = {
  unauthenticated: () => new HttpError(401, 'UNAUTHENTICATED', 'Tu sesión terminó. Inicia sesión de nuevo.'),
  mfaRequired: () => new HttpError(401, 'MFA_REQUIRED', 'Completa el segundo factor de autenticación.'),
  invalidCredentials: () =>
    new HttpError(401, 'INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos, o cuenta bloqueada temporalmente.'),
  invalidSecondFactor: () => new HttpError(401, 'INVALID_CREDENTIALS', 'No se pudo verificar el segundo factor.'),
  passwordChangeRequired: () =>
    new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Debes cambiar tu contraseña antes de continuar.'),
  forbidden: () => new HttpError(403, 'FORBIDDEN', 'No tienes permiso para esta acción.'),
  notFound: () => new HttpError(404, 'NOT_FOUND', 'No se encontró el recurso solicitado.'),
  conflict: (message: string) => new HttpError(409, 'CONFLICT', message),
  validation: (fields: FieldIssue[]) =>
    new HttpError(400, 'VALIDATION_ERROR', 'Hay datos inválidos en la solicitud.', { fields }),
  badRequest: (message: string) => new HttpError(400, 'VALIDATION_ERROR', message),
  rateLimited: () => new HttpError(429, 'RATE_LIMITED', 'Demasiados intentos. Espera un momento.'),
};
