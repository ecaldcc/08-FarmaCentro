import { Router } from 'express';
import { authRouter, meRouter } from './auth.routes.js';
import { usersRouter } from './users.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
apiRouter.use('/auth', authRouter);
apiRouter.use('/me', meRouter);
apiRouter.use('/users', usersRouter);
