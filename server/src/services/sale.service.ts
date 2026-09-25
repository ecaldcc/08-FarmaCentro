import { randomBytes } from 'node:crypto';
import { Types, type ClientSession } from 'mongoose';
import type { Role } from '../domain/roles.js';
import { nextNumber } from '../models/Counter.js';
import { Customer } from '../models/Customer.js';
import { InventoryLot } from '../models/InventoryLot.js';
import { InventoryMovement } from '../models/InventoryMovement.js';
import { LoyaltyTransaction } from '../models/LoyaltyTransaction.js';
import { Product, type IProduct } from '../models/Product.js';
import { Sale, type ISale, type ISaleItem, type ISalePayment } from '../models/Sale.js';
import { User } from '../models/User.js';
import { gtDayEnd, gtDayStart, gtToday } from '../utils/dates.js';
import { Errors, HttpError } from '../utils/httpError.js';
import { op } from '../utils/trusted.js';
import type { ListSalesInput, PaymentInput, SaleItemsInput } from '../validation/sales.schemas.js';
import { appendAudit, runAuditedTransaction, type AuditContext, type AuditedTx } from './audit.service.js';
import { applyLotDelta } from './inventory.service.js';

/** Loyalty rule (decision D-14): 1 point per Q10 of the total. */
export const CENTS_PER_POINT = 1000;

const AUTH_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Fictitious authorization reference; no card data is ever requested or stored. */
function simulatedAuthorizationRef(): string {
  const bytes = randomBytes(10);
  let ref = 'SIM-';
  for (const byte of bytes) ref += AUTH_ALPHABET[byte % AUTH_ALPHABET.length];
  return ref;
}

export function saleDto(sale: ISale, names: Map<string, string> = new Map()) {
  return {
    id: String(sale._id),
    saleNumber: sale.saleNumber,
    cashierId: String(sale.cashierId),
    cashierUsername: names.get(String(sale.cashierId)) ?? null,
    customerId: sale.customerId ? String(sale.customerId) : null,
    items: sale.items.map((i) => ({
      productId: String(i.productId),
      lotId: String(i.lotId),
      sku: i.sku,
      name: i.name,
      isControlled: i.isControlled,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      lineTotalCents: i.lineTotalCents,
    })),
    totalCents: sale.totalCents,
    payment: sale.payment,
    pointsEarned: sale.pointsEarned,
    fromPrescription: sale.dispensationId !== null,
    status: sale.status,
    void: sale.void
      ? {
          voidedAt: sale.void.voidedAt,
          voidedBy: String(sale.void.voidedBy),
          voidedByUsername: names.get(String(sale.void.voidedBy)) ?? null,
          reason: sale.void.reason,
          stepUpMethod: sale.void.stepUpMethod,
        }
      : null,
    createdAt: sale.createdAt,
  };
}

async function usernames(ids: Types.ObjectId[]): Promise<Map<string, string>> {
  const users = await User.find({ _id: op({ $in: ids }) }, { username: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), u.username]));
}

export async function loadProducts(items: SaleItemsInput): Promise<Map<string, IProduct>> {
  const ids = items.map((i) => new Types.ObjectId(i.productId));
  const products = await Product.find({ _id: op({ $in: ids }), status: 'active' }).lean();
  if (products.length !== ids.length) {
    throw Errors.conflict('Alguno de los productos no existe o está inactivo.');
  }
  return new Map(products.map((p) => [String(p._id), p]));
}

export interface AllocatedLine {
  item: ISaleItem;
  balanceAfter: number;
}

/**
 * Takes stock using FEFO (first expired, first out), skipping expired lots, inside the
 * caller's transaction. Prices come from the database, never from the client.
 */
export async function allocateStock(
  items: SaleItemsInput,
  products: Map<string, IProduct>,
  session: ClientSession,
): Promise<AllocatedLine[]> {
  const lines: AllocatedLine[] = [];
  for (const requested of items) {
    const product = products.get(requested.productId);
    if (!product) throw Errors.conflict('Producto no disponible.');
    const lots = await InventoryLot.find({
      productId: product._id,
      quantity: op({ $gt: 0 }),
      expiresAt: op({ $gt: new Date() }),
    })
      .sort({ expiresAt: 1 })
      .session(session)
      .lean();
    let pending = requested.quantity;
    for (const lot of lots) {
      if (pending === 0) break;
      const take = Math.min(pending, lot.quantity);
      const updated = await applyLotDelta(lot._id, -take, session);
      lines.push({
        item: {
          productId: product._id,
          lotId: lot._id,
          sku: product.sku,
          name: product.name,
          isControlled: product.isControlled,
          quantity: take,
          unitPriceCents: product.unitPriceCents,
          lineTotalCents: take * product.unitPriceCents,
        },
        balanceAfter: updated.quantity,
      });
      pending -= take;
    }
    if (pending > 0) {
      throw Errors.conflict(`Existencia insuficiente de ${product.name}.`);
    }
  }
  return lines;
}

export function buildPayment(payment: PaymentInput, totalCents: number): ISalePayment {
  if (payment.method === 'cash') {
    if (payment.amountReceivedCents < totalCents) {
      throw Errors.conflict('El efectivo recibido es menor que el total.');
    }
    return {
      method: 'cash',
      amountReceivedCents: payment.amountReceivedCents,
      changeCents: payment.amountReceivedCents - totalCents,
      authorizationRef: null,
    };
  }
  return { method: 'card_simulated', amountReceivedCents: null, changeCents: null, authorizationRef: simulatedAuthorizationRef() };
}

interface PersistSaleArgs {
  tx: AuditedTx;
  cashierId: string;
  customerId: string | undefined;
  lines: AllocatedLine[];
  payment: PaymentInput;
  movementType: 'sale' | 'dispensation';
  dispensationId?: Types.ObjectId;
}

/** Writes the sale, its inventory movements and loyalty points inside the transaction. */
export async function persistSale(args: PersistSaleArgs): Promise<ISale> {
  const { tx, lines } = args;
  const { session } = tx;
  const totalCents = lines.reduce((sum, l) => sum + l.item.lineTotalCents, 0);
  const payment = buildPayment(args.payment, totalCents);

  let customerId: Types.ObjectId | null = null;
  let pointsEarned = 0;
  if (args.customerId) {
    const customer = await Customer.findOne({ _id: new Types.ObjectId(args.customerId), status: 'active' })
      .session(session)
      .lean();
    if (!customer) throw Errors.conflict('El cliente no existe o retiró su consentimiento.');
    customerId = customer._id;
    pointsEarned = Math.floor(totalCents / CENTS_PER_POINT);
  }

  const saleId = new Types.ObjectId();
  const saleNumber = await nextNumber('sale', 'V', session);
  const userId = new Types.ObjectId(args.cashierId);
  const [sale] = await Sale.create(
    [
      {
        _id: saleId,
        saleNumber,
        cashierId: userId,
        customerId,
        items: lines.map((l) => l.item),
        totalCents,
        payment,
        pointsEarned,
        dispensationId: args.dispensationId ?? null,
      },
    ],
    { session },
  );
  if (!sale) throw new Error('sale not created');

  await InventoryMovement.create(
    lines.map((l) => ({
      productId: l.item.productId,
      lotId: l.item.lotId,
      type: args.movementType,
      quantityDelta: -l.item.quantity,
      balanceAfter: l.balanceAfter,
      refType: 'sale',
      refId: saleId,
      userId,
    })),
    { session, ordered: true },
  );

  if (customerId && pointsEarned > 0) {
    await Customer.updateOne({ _id: customerId }, { $inc: { pointsBalance: pointsEarned } }, { session });
    await LoyaltyTransaction.create(
      [{ customerId, type: 'earn', points: pointsEarned, saleId, userId }],
      { session },
    );
  }
  return sale.toObject();
}

export async function createSale(
  data: { customerId?: string | undefined; items: SaleItemsInput; payment: PaymentInput },
  actorId: string,
  ctx: AuditContext,
) {
  const products = await loadProducts(data.items);
  const controlled = [...products.values()].filter((p) => p.isControlled);
  if (controlled.length > 0) {
    // Controlled medicines only leave through a prescription dispensation by the Regente (D-08).
    await appendAudit(ctx, {
      action: 'authz.denied',
      result: 'denied',
      entity: 'sale',
      details: { reason: 'controlled_product_in_counter_sale', skus: controlled.map((p) => p.sku) },
    });
    throw new HttpError(403, 'FORBIDDEN', 'Los medicamentos controlados solo se despachan con receta por el Regente.');
  }

  const sale = await runAuditedTransaction(ctx, async (tx) => {
    const lines = await allocateStock(data.items, products, tx.session);
    const created = await persistSale({
      tx,
      cashierId: actorId,
      customerId: data.customerId,
      lines,
      payment: data.payment,
      movementType: 'sale',
    });
    tx.audit({
      action: 'sale.created',
      result: 'success',
      entity: 'sale',
      entityId: created._id,
      details: {
        saleNumber: created.saleNumber,
        totalCents: created.totalCents,
        method: created.payment.method,
        items: created.items.length,
        withCustomer: created.customerId !== null,
      },
    });
    return created;
  });
  return saleDto(sale);
}

export async function listSales(query: ListSalesInput, actor: { id: string; role: Role }) {
  const filter: Record<string, unknown> = {};
  let from = query.from;
  let to = query.to;
  if (actor.role === 'cajero') {
    // A cashier only sees their own sales of the current day.
    filter.cashierId = new Types.ObjectId(actor.id);
    from = gtToday();
    to = gtToday();
  }
  if (query.status) filter.status = query.status;
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = gtDayStart(from);
    if (to) range.$lt = gtDayEnd(to);
    filter.createdAt = op(range);
  }
  const [items, total] = await Promise.all([
    Sale.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    Sale.countDocuments(filter),
  ]);
  const names = await usernames(items.flatMap((s) => [s.cashierId, ...(s.void ? [s.void.voidedBy] : [])]));
  return { items: items.map((s) => saleDto(s, names)), page: query.page, pageSize: query.pageSize, total };
}

export async function getSale(id: string, actor: { id: string; role: Role }) {
  const sale = await Sale.findById(id).lean();
  // 404 (not 403) so a cashier cannot probe for other people's sales.
  if (!sale || (actor.role === 'cajero' && String(sale.cashierId) !== actor.id)) {
    throw Errors.notFound();
  }
  const names = await usernames([sale.cashierId, ...(sale.void ? [sale.void.voidedBy] : [])]);
  return saleDto(sale, names);
}

/**
 * Voids a sale of the same day (decision D-07): restores stock to the original lots, reverses
 * loyalty points and records who, why and with which second factor — all in one transaction.
 */
export async function voidSale(id: string, reason: string, actorId: string, ctx: AuditContext, stepUpMethod: string) {
  const sale = await Sale.findById(id).lean();
  if (!sale) throw Errors.notFound();
  const fail = async (message: string) => {
    await appendAudit(ctx, {
      action: 'sale.voided',
      result: 'failure',
      entity: 'sale',
      entityId: sale._id,
      details: { saleNumber: sale.saleNumber, reason: message, stepUpMethod },
    });
    return Errors.conflict(message);
  };
  if (sale.status === 'voided') throw await fail('La venta ya está anulada.');
  if (sale.createdAt < gtDayStart(gtToday())) throw await fail('Solo se pueden anular ventas del mismo día.');
  if (sale.dispensationId) throw await fail('Las ventas de recetas no se anulan desde aquí.');

  const updated = await runAuditedTransaction(ctx, async ({ session, audit }) => {
    const userId = new Types.ObjectId(actorId);
    const voided = await Sale.findOneAndUpdate(
      { _id: sale._id, status: 'completed' },
      { $set: { status: 'voided', void: { voidedAt: new Date(), voidedBy: userId, reason, stepUpMethod } } },
      { returnDocument: 'after', session },
    ).lean();
    if (!voided) throw Errors.conflict('La venta ya está anulada.');

    for (const item of sale.items) {
      const lot = await applyLotDelta(item.lotId, item.quantity, session);
      await InventoryMovement.create(
        [
          {
            productId: item.productId,
            lotId: item.lotId,
            type: 'sale_void',
            quantityDelta: item.quantity,
            balanceAfter: lot.quantity,
            reason,
            refType: 'sale',
            refId: sale._id,
            userId,
            stepUpMethod,
          },
        ],
        { session },
      );
    }

    if (sale.customerId && sale.pointsEarned > 0) {
      await Customer.updateOne(
        { _id: sale.customerId, pointsBalance: op({ $gte: sale.pointsEarned }) },
        { $inc: { pointsBalance: -sale.pointsEarned } },
        { session },
      );
      await LoyaltyTransaction.create(
        [{ customerId: sale.customerId, type: 'void_reversal', points: -sale.pointsEarned, saleId: sale._id, userId }],
        { session },
      );
    }

    audit({
      action: 'sale.voided',
      result: 'success',
      entity: 'sale',
      entityId: sale._id,
      details: {
        saleNumber: sale.saleNumber,
        totalCents: sale.totalCents,
        cashierId: String(sale.cashierId),
        reason,
        stepUpMethod,
      },
    });
    return voided;
  });
  const names = await usernames([updated.cashierId, new Types.ObjectId(actorId)]);
  return saleDto(updated, names);
}
