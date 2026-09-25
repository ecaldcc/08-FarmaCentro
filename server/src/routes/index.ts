import { Router } from 'express';
import { authRouter, meRouter } from './auth.routes.js';
import { inventoryRouter, productsRouter } from './inventory.routes.js';
import { auditRouter, reportsRouter } from './audit.routes.js';
import { customersRouter, prescriptionsRouter, privacyRouter, salesRouter } from './sales.routes.js';
import { usersRouter } from './users.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
apiRouter.use('/auth', authRouter);
apiRouter.use('/me', meRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/sales', salesRouter);
apiRouter.use('/privacy-notice', privacyRouter);
apiRouter.use('/customers', customersRouter);
apiRouter.use('/prescriptions', prescriptionsRouter);
apiRouter.use('/audit', auditRouter);
apiRouter.use('/reports', reportsRouter);
