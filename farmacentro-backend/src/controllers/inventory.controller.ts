import type { Request, Response } from 'express';
import { input } from '../middlewares/validate.js';
import * as inventory from '../services/inventory.service.js';
import * as products from '../services/product.service.js';
import { Errors } from '../utils/httpError.js';
import { auditContext } from '../utils/requestContext.js';
import type {
  AdjustmentInput,
  CreateProductInput,
  ExpiringInput,
  ListLotsInput,
  ListMovementsInput,
  ListProductsInput,
  ReceiptInput,
  SetControlledInput,
  UpdateProductInput,
} from '../validation/inventory.schemas.js';

type IdParams = { id: string };

function actor(req: Request) {
  if (!req.user) throw Errors.unauthenticated();
  return req.user;
}

export async function listProducts(req: Request, res: Response): Promise<void> {
  res.json(await products.listProducts(input<unknown, ListProductsInput>(req).query));
}

export async function getProduct(req: Request, res: Response): Promise<void> {
  res.json(await products.getProduct(input<IdParams>(req).params.id));
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  const { body } = input<unknown, unknown, CreateProductInput>(req);
  res.status(201).json(await products.createProduct(body, actor(req).id, auditContext(req)));
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  const { params, body } = input<IdParams, unknown, UpdateProductInput>(req);
  res.json(await products.updateProduct(params.id, body, actor(req).id, auditContext(req)));
}

export async function setControlled(req: Request, res: Response): Promise<void> {
  const { params, body } = input<IdParams, unknown, SetControlledInput>(req);
  res.json(
    await products.setControlled(
      params.id,
      body.isControlled,
      body.reason,
      actor(req).id,
      auditContext(req),
      res.locals.stepUpMethod ?? 'unknown',
    ),
  );
}

export async function listLots(req: Request, res: Response): Promise<void> {
  res.json(await inventory.listLots(input<unknown, ListLotsInput>(req).query));
}

export async function listExpiring(req: Request, res: Response): Promise<void> {
  res.json(await inventory.listExpiring(input<unknown, ExpiringInput>(req).query));
}

export async function listMovements(req: Request, res: Response): Promise<void> {
  res.json(await inventory.listMovements(input<unknown, ListMovementsInput>(req).query));
}

export async function receive(req: Request, res: Response): Promise<void> {
  const { body } = input<unknown, unknown, ReceiptInput>(req);
  res.status(201).json(await inventory.receiveStock(body, actor(req).id, auditContext(req)));
}

export async function adjust(req: Request, res: Response): Promise<void> {
  const { body } = input<unknown, unknown, AdjustmentInput>(req);
  res
    .status(201)
    .json(await inventory.adjustStock(body, actor(req), auditContext(req), res.locals.stepUpMethod ?? 'unknown'));
}
