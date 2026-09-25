import { Types } from 'mongoose';
import { InventoryLot } from '../models/InventoryLot.js';
import { Product, type IProduct } from '../models/Product.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { Errors } from '../utils/httpError.js';
import { op } from '../utils/trusted.js';
import type { CreateProductInput, ListProductsInput, UpdateProductInput } from '../validation/inventory.schemas.js';
import { runAuditedTransaction, type AuditContext } from './audit.service.js';

/** Sellable stock per product: sum of non-expired lots. */
export async function stockByProduct(productIds: Types.ObjectId[]): Promise<Map<string, number>> {
  const rows = await InventoryLot.aggregate<{ _id: Types.ObjectId; stock: number }>([
    { $match: { productId: { $in: productIds }, expiresAt: { $gt: new Date() }, quantity: { $gt: 0 } } },
    { $group: { _id: '$productId', stock: { $sum: '$quantity' } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.stock]));
}

export function productDto(product: IProduct, stock: number) {
  return {
    id: String(product._id),
    sku: product.sku,
    name: product.name,
    activeIngredient: product.activeIngredient,
    presentation: product.presentation,
    category: product.category,
    unitPriceCents: product.unitPriceCents,
    isControlled: product.isControlled,
    minStock: product.minStock,
    stock,
    lowStock: stock < product.minStock,
    status: product.status,
  };
}

export async function listProducts(query: ListProductsInput) {
  const filter: Record<string, unknown> = { status: query.status };
  if (query.isControlled !== undefined) filter.isControlled = query.isControlled;
  if (query.q) {
    const pattern = op({ $regex: escapeRegex(query.q), $options: 'i' });
    filter.$or = [{ name: pattern }, { sku: pattern }, { activeIngredient: pattern }];
  }

  if (query.lowStock) {
    // Low stock needs the computed stock, so it is filtered in memory over the matching products.
    const all = await Product.find(filter).sort({ name: 1 }).lean();
    const stock = await stockByProduct(all.map((p) => p._id));
    const low = all.filter((p) => (stock.get(String(p._id)) ?? 0) < p.minStock);
    const start = (query.page - 1) * query.pageSize;
    return {
      items: low.slice(start, start + query.pageSize).map((p) => productDto(p, stock.get(String(p._id)) ?? 0)),
      page: query.page,
      pageSize: query.pageSize,
      total: low.length,
    };
  }

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ name: 1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    Product.countDocuments(filter),
  ]);
  const stock = await stockByProduct(items.map((p) => p._id));
  return {
    items: items.map((p) => productDto(p, stock.get(String(p._id)) ?? 0)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getProduct(id: string) {
  const product = await Product.findById(id).lean();
  if (!product) throw Errors.notFound();
  const lots = await InventoryLot.find({ productId: product._id, quantity: op({ $gt: 0 }) })
    .sort({ expiresAt: 1 })
    .lean();
  const now = Date.now();
  const stock = lots.filter((l) => l.expiresAt.getTime() > now).reduce((sum, l) => sum + l.quantity, 0);
  return {
    ...productDto(product, stock),
    lots: lots.map((l) => ({
      id: String(l._id),
      lotNumber: l.lotNumber,
      expiresAt: l.expiresAt,
      quantity: l.quantity,
      expired: l.expiresAt.getTime() <= now,
    })),
  };
}

export async function createProduct(data: CreateProductInput, actorId: string, ctx: AuditContext) {
  if (await Product.exists({ sku: data.sku })) {
    throw Errors.conflict('Ya existe un producto con ese SKU.');
  }
  const product = await runAuditedTransaction(ctx, async ({ session, audit }) => {
    const [created] = await Product.create(
      [
        {
          ...data,
          activeIngredient: data.activeIngredient ?? null,
          isControlled: false, // new products are never controlled; only the Regente marks them, with step-up
          createdBy: new Types.ObjectId(actorId),
        },
      ],
      { session },
    );
    if (!created) throw new Error('product not created');
    audit({
      action: 'product.created',
      result: 'success',
      entity: 'product',
      entityId: created._id,
      details: { sku: created.sku, unitPriceCents: created.unitPriceCents },
    });
    return created;
  });
  return getProduct(String(product._id));
}

export async function updateProduct(id: string, data: UpdateProductInput, actorId: string, ctx: AuditContext) {
  const before = await Product.findById(id).lean();
  if (!before) throw Errors.notFound();
  await runAuditedTransaction(ctx, async ({ session, audit }) => {
    await Product.updateOne(
      { _id: before._id },
      { $set: { ...data, updatedBy: new Types.ObjectId(actorId) } },
      { session },
    );
    const details: Record<string, unknown> = { fields: Object.keys(data) };
    if (data.unitPriceCents !== undefined && data.unitPriceCents !== before.unitPriceCents) {
      details.priceBefore = before.unitPriceCents;
      details.priceAfter = data.unitPriceCents;
    }
    audit({ action: 'product.updated', result: 'success', entity: 'product', entityId: before._id, details });
  });
  return getProduct(id);
}

export async function setControlled(
  id: string,
  isControlled: boolean,
  reason: string,
  actorId: string,
  ctx: AuditContext,
  stepUpMethod: string,
) {
  const before = await Product.findById(id).lean();
  if (!before) throw Errors.notFound();
  if (before.isControlled === isControlled) {
    throw Errors.conflict('El producto ya tiene esa marca.');
  }
  await runAuditedTransaction(ctx, async ({ session, audit }) => {
    await Product.updateOne(
      { _id: before._id },
      { $set: { isControlled, updatedBy: new Types.ObjectId(actorId) } },
      { session },
    );
    audit({
      action: 'product.controlled.changed',
      result: 'success',
      entity: 'product',
      entityId: before._id,
      details: { sku: before.sku, from: before.isControlled, to: isControlled, reason, stepUpMethod },
    });
  });
  return getProduct(id);
}
