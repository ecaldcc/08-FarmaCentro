import { Router, type Request } from 'express';
import * as inventory from '../controllers/inventory.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { paramId, requireStepUp } from '../middlewares/stepUp.js';
import { validate } from '../middlewares/validate.js';
import { IdParams } from '../validation/common.js';
import {
  AdjustmentBody,
  CreateProductBody,
  ExpiringQuery,
  ListLotsQuery,
  ListMovementsQuery,
  ListProductsQuery,
  ReceiptBody,
  SetControlledBody,
  UpdateProductBody,
} from '../validation/inventory.schemas.js';

export const productsRouter = Router();
productsRouter.use(requireAuth());

productsRouter.get(
  '/',
  requireRole('regente', 'cajero', 'bodeguero'),
  validate({ query: ListProductsQuery }),
  inventory.listProducts,
);
productsRouter.get('/:id', requireRole('regente', 'cajero', 'bodeguero'), validate({ params: IdParams }), inventory.getProduct);
productsRouter.post('/', requireRole('bodeguero'), validate({ body: CreateProductBody }), inventory.createProduct);
productsRouter.patch(
  '/:id',
  requireRole('bodeguero'),
  validate({ params: IdParams, body: UpdateProductBody }),
  inventory.updateProduct,
);
productsRouter.put(
  '/:id/controlled',
  requireRole('regente'),
  validate({ params: IdParams, body: SetControlledBody }),
  requireStepUp('product.controlled.change', paramId),
  inventory.setControlled,
);

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth(), requireRole('regente', 'bodeguero'));

inventoryRouter.get('/lots', validate({ query: ListLotsQuery }), inventory.listLots);
inventoryRouter.get('/expiring', validate({ query: ExpiringQuery }), inventory.listExpiring);
inventoryRouter.get('/movements', validate({ query: ListMovementsQuery }), inventory.listMovements);
inventoryRouter.post('/receipts', validate({ body: ReceiptBody }), inventory.receive);
inventoryRouter.post(
  '/adjustments',
  validate({ body: AdjustmentBody }),
  requireStepUp('inventory.adjust', (req: Request) => (req.validated.body as { lotId: string }).lotId),
  inventory.adjust,
);
