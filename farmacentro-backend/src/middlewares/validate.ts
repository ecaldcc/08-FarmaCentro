import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';
import { Errors, type FieldIssue } from '../utils/httpError.js';

const EmptyObject = z.strictObject({});

interface Schemas {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

function toIssues(location: string, error: z.ZodError): FieldIssue[] {
  // Only the path and the rule are returned, never the received value.
  return error.issues.map((issue) => ({
    path: [location, ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));
}

/**
 * Validates params, query and body with Zod (control 8.28). Anything not declared is rejected,
 * and controllers only read req.validated, never req.body or req.query directly.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: FieldIssue[] = [];
    const result: Request['validated'] = { params: {}, query: {}, body: {} };

    const params = (schemas.params ?? z.object({})).safeParse(req.params);
    if (params.success) result.params = params.data;
    else issues.push(...toIssues('params', params.error));

    const query = (schemas.query ?? EmptyObject).safeParse(req.query ?? {});
    if (query.success) result.query = query.data;
    else issues.push(...toIssues('query', query.error));

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const body = (schemas.body ?? EmptyObject).safeParse(req.body ?? {});
      if (body.success) result.body = body.data;
      else issues.push(...toIssues('body', body.error));
    }

    if (issues.length > 0) {
      next(Errors.validation(issues));
      return;
    }
    req.validated = result;
    next();
  };
}

/** Typed access to the validated input inside a controller. */
export function input<P = unknown, Q = unknown, B = unknown>(req: Request): { params: P; query: Q; body: B } {
  return req.validated as { params: P; query: Q; body: B };
}
