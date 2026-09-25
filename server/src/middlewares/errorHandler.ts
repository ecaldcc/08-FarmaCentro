import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger.js';
import { Errors, HttpError } from '../utils/httpError.js';

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(Errors.notFound());
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
}

/**
 * Generic error responses: no stack traces, no internal messages (CLAUDE.md "Seguridad web").
 * The full error only goes to the technical log, correlated by requestId.
 */
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  let httpError: HttpError;
  if (error instanceof HttpError) {
    httpError = error;
  } else if (isDuplicateKey(error)) {
    httpError = Errors.conflict('Ya existe un registro con esos datos.');
  } else if (typeof error === 'object' && error !== null && 'type' in error) {
    const type = (error as { type?: string }).type;
    if (type === 'entity.too.large') {
      httpError = new HttpError(413, 'PAYLOAD_TOO_LARGE', 'La solicitud es demasiado grande.');
    } else if (type === 'entity.parse.failed') {
      httpError = Errors.badRequest('El cuerpo de la solicitud no es JSON válido.');
    } else {
      httpError = new HttpError(500, 'INTERNAL', 'Ocurrió un error.');
    }
  } else {
    httpError = new HttpError(500, 'INTERNAL', 'Ocurrió un error.');
  }

  if (httpError.status >= 500) {
    logger.error({ err: error, requestId: req.requestId }, 'unhandled error');
  }

  const message =
    httpError.status >= 500 ? `Ocurrió un error. Código de referencia: ${req.requestId}` : httpError.message;
  res.status(httpError.status).json({
    error: { code: httpError.code, message, requestId: req.requestId, ...httpError.extra },
  });
}
