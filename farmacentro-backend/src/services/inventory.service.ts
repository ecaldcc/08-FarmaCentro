import { Types, type ClientSession } from 'mongoose';
import type { Role } from '../domain/roles.js';
import { InventoryLot } from '../models/InventoryLot.js';
import { InventoryMovement, type IInventoryMovement } from '../models/InventoryMovement.js';
import { Product } from '../models/Product.js';
import { addDays, gtDayEnd, gtDayStart } from '../utils/dates.js';
import { Errors } from '../utils/httpError.js';
import { op } from '../utils/trusted.js';
import type {
  AdjustmentInput,
  ExpiringInput,
  ListLotsInput,
  ListMovementsInput,
  ReceiptInput,
} from '../validation/inventory.schemas.js';
import { appendAudit, runAuditedTransaction, type AuditContext } from './audit.service.js';

/** Lot expiry dates are stored as the end of that civil day in Guatemala. */
export function lotExpiry(isoDate: string): Date {
  return new Date(gtDayEnd(isoDate).getTime() - 1);
}

function lotDto(lot: { _id: Types.ObjectId; productId: Types.ObjectId; lotNumber: string; expiresAt: Date; quantity: number; supplier: string | null; receivedAt: Date }) {
  return {
    id: String(lot._id),
    productId: String(lot.productId),
    lotNumber: lot.lotNumber,
    expiresAt: lot.expiresAt,
    quantity: lot.quantity,
    supplier: lot.supplier,
    receivedAt: lot.receivedAt,
    expired: lot.expiresAt.getTime() <= Date.now(),
  };
}

async function attachProducts<T extends { productId: string }>(rows: T[]) {
  const ids = [...new Set(rows.map((r) => r.productId))].map((id) => new Types.ObjectId(id));
  const products = await Product.find({ _id: op({ $in: ids }) }, { sku: 1, name: 1, isControlled: 1 }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return rows.map((row) => {
    const product = byId.get(row.productId);
    return { ...row, sku: product?.sku ?? '', productName: product?.name ?? '', isControlled: product?.isControlled ?? false };
  });
}

export async function listLots(query: ListLotsInput) {
  const filter: Record<string, unknown> = {};
  if (query.productId) filter.productId = new Types.ObjectId(query.productId);
  if (!query.includeExpired) filter.expiresAt = op({ $gt: new Date() });
  const [items, total] = await Promise.all([
    InventoryLot.find(filter)
      .sort({ expiresAt: 1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    InventoryLot.countDocuments(filter),
  ]);
  return { items: await attachProducts(items.map(lotDto)), page: query.page, pageSize: query.pageSize, total };
}

export async function listExpiring(query: ExpiringInput) {
  const limit = addDays(new Date(), query.withinDays);
  const lots = await InventoryLot.find({ expiresAt: op({ $lte: limit }), quantity: op({ $gt: 0 }) })
    .sort({ expiresAt: 1 })
    .limit(500)
    .lean();
  return attachProducts(lots.map(lotDto));
}

function movementDto(m: IInventoryMovement) {
  return {
    id: String(m._id),
    productId: String(m.productId),
    lotId: String(m.lotId),
    type: m.type,
    quantityDelta: m.quantityDelta,
    balanceAfter: m.balanceAfter,
    reasonCode: m.reasonCode,
    reason: m.reason,
    refType: m.refType,
    refId: m.refId ? String(m.refId) : null,
    userId: String(m.userId),
    stepUpMethod: m.stepUpMethod,
    createdAt: m.createdAt,
  };
}

export async function listMovements(query: ListMovementsInput) {
  const filter: Record<string, unknown> = {};
  if (query.productId) filter.productId = new Types.ObjectId(query.productId);
  if (query.type) filter.type = query.type;
  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) range.$gte = gtDayStart(query.from);
    if (query.to) range.$lt = gtDayEnd(query.to);
    filter.createdAt = op(range);
  }
  const [items, total] = await Promise.all([
    InventoryMovement.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    InventoryMovement.countDocuments(filter),
  ]);
  return { items: await attachProducts(items.map(movementDto)), page: query.page, pageSize: query.pageSize, total };
}

export async function receiveStock(data: ReceiptInput, actorId: string, ctx: AuditContext) {
  const product = await Product.findById(data.productId).lean();
  if (!product || product.status !== 'active') throw Errors.notFound();
  const expiresAt = lotExpiry(data.expiresAt);
  if (expiresAt.getTime() <= Date.now()) {
    throw Errors.validation([{ path: 'body.expiresAt', message: 'La fecha de vencimiento debe ser futura' }]);
  }
  const userId = new Types.ObjectId(actorId);

  return runAuditedTransaction(ctx, async ({ session, audit }) => {
    let lot = await InventoryLot.findOne({ productId: product._id, lotNumber: data.lotNumber }).session(session);
    if (lot && lot.expiresAt.getTime() !== expiresAt.getTime()) {
      throw Errors.conflict('Ese lote ya existe con otra fecha de vencimiento.');
    }
    if (lot) {
      lot = await InventoryLot.findOneAndUpdate(
        { _id: lot._id },
        { $inc: { quantity: data.quantity } },
        { returnDocument: 'after', session },
      );
    } else {
      const [created] = await InventoryLot.create(
        [
          {
            productId: product._id,
            lotNumber: data.lotNumber,
            expiresAt,
            quantity: data.quantity,
            supplier: data.supplier ?? null,
            receivedAt: new Date(),
            receivedBy: userId,
          },
        ],
        { session },
      );
      lot = created ?? null;
    }
    if (!lot) throw new Error('lot not saved');
    const [movement] = await InventoryMovement.create(
      [
        {
          productId: product._id,
          lotId: lot._id,
          type: 'receipt',
          quantityDelta: data.quantity,
          balanceAfter: lot.quantity,
          reason: data.documentRef ? `Documento ${data.documentRef}` : null,
          userId,
        },
      ],
      { session },
    );
    audit({
      action: 'inventory.receipt',
      result: 'success',
      entity: 'inventory_lot',
      entityId: lot._id,
      details: {
        sku: product.sku,
        lotNumber: data.lotNumber,
        quantity: data.quantity,
        isControlled: product.isControlled,
        documentRef: data.documentRef ?? null,
      },
    });
    return { lot: lotDto(lot), movementId: String(movement?._id) };
  });
}

/**
 * Inventory adjustment with step-up and reason (CLAUDE.md "Inventario"). Controlled products can
 * only be adjusted by the Regente. Runs in a transaction together with its audit record.
 */
export async function adjustStock(
  data: AdjustmentInput,
  actor: { id: string; role: Role },
  ctx: AuditContext,
  stepUpMethod: string,
) {
  const lot = await InventoryLot.findById(data.lotId).lean();
  if (!lot) throw Errors.notFound();
  const product = await Product.findById(lot.productId).lean();
  if (!product) throw Errors.notFound();
  if (product.isControlled && actor.role !== 'regente') {
    await appendAudit(ctx, {
      action: 'authz.denied',
      result: 'denied',
      entity: 'inventory_lot',
      entityId: lot._id,
      details: { reason: 'controlled_requires_regente', sku: product.sku },
    });
    throw Errors.forbidden();
  }

  try {
    return await runAuditedTransaction(ctx, async ({ session, audit }) => {
      const updated = await applyLotDelta(lot._id, data.quantityDelta, session);
      const [movement] = await InventoryMovement.create(
        [
          {
            productId: product._id,
            lotId: lot._id,
            type: 'adjustment',
            quantityDelta: data.quantityDelta,
            balanceAfter: updated.quantity,
            reasonCode: data.reasonCode,
            reason: data.reason,
            userId: new Types.ObjectId(actor.id),
            stepUpMethod,
          },
        ],
        { session },
      );
      audit({
        action: 'inventory.adjustment',
        result: 'success',
        entity: 'inventory_lot',
        entityId: lot._id,
        details: {
          sku: product.sku,
          lotNumber: lot.lotNumber,
          isControlled: product.isControlled,
          quantityDelta: data.quantityDelta,
          balanceAfter: updated.quantity,
          reasonCode: data.reasonCode,
          reason: data.reason,
          stepUpMethod,
        },
      });
      return { lot: lotDto(updated), movementId: String(movement?._id) };
    });
  } catch (error) {
    await appendAudit(ctx, {
      action: 'inventory.adjustment',
      result: 'failure',
      entity: 'inventory_lot',
      entityId: lot._id,
      details: { sku: product.sku, quantityDelta: data.quantityDelta, stepUpMethod },
    });
    throw error;
  }
}

/** Applies a signed delta to a lot; never lets the quantity go below zero. */
export async function applyLotDelta(lotId: Types.ObjectId, delta: number, session: ClientSession) {
  const filter: Record<string, unknown> = { _id: lotId };
  if (delta < 0) filter.quantity = op({ $gte: -delta });
  const updated = await InventoryLot.findOneAndUpdate(
    filter,
    { $inc: { quantity: delta } },
    { returnDocument: 'after', session },
  ).lean();
  if (!updated) {
    throw Errors.conflict('La existencia del lote no alcanza para esta operación.');
  }
  return updated;
}
