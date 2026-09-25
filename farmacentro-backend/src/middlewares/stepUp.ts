import type { NextFunction, Request, Response } from 'express';
import type { StepUpAction } from '../domain/stepUpActions.js';
import { consumeStepUp } from '../services/stepUp.service.js';

declare module 'express-serve-static-core' {
  interface Locals {
    stepUpMethod?: string;
  }
}

/**
 * Requires a fresh, single-use re-authentication for (action, targetId) right before a sensitive
 * operation (CLAUDE.md "Segundo factor"). Runs after validate(), so targetId comes from validated input.
 */
export function requireStepUp(action: StepUpAction, targetId: (req: Request) => string | null = () => null) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      res.locals.stepUpMethod = consumeStepUp(req, action, targetId(req));
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function paramId(req: Request): string {
  return (req.validated.params as { id: string }).id;
}
