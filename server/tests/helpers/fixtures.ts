import { gtToday } from '../../src/utils/dates.js';
import { Types } from 'mongoose';
import { InventoryLot } from '../../src/models/InventoryLot.js';
import { Product } from '../../src/models/Product.js';

let skuCounter = 0;

export async function createProduct(
  overrides: Partial<{ name: string; unitPriceCents: number; isControlled: boolean; minStock: number }> = {},
) {
  skuCounter += 1;
  const product = await Product.create({
    sku: `TEST-${String(skuCounter).padStart(4, '0')}`,
    name: overrides.name ?? `Producto ${skuCounter}`,
    presentation: 'Caja 10 tabletas',
    category: 'medicamento',
    unitPriceCents: overrides.unitPriceCents ?? 2500,
    isControlled: overrides.isControlled ?? false,
    minStock: overrides.minStock ?? 0,
  });
  return product;
}

export async function createLot(productId: Types.ObjectId, quantity: number, daysToExpire: number, lotNumber?: string) {
  return InventoryLot.create({
    productId,
    lotNumber: lotNumber ?? `L-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    expiresAt: new Date(Date.now() + daysToExpire * 86_400_000),
    quantity,
    receivedAt: new Date(),
    receivedBy: new Types.ObjectId(),
  });
}

/** Civil date in Guatemala (UTC-6) N days from now, as the API expects. */
export function isoDaysFromNow(days: number): string {
  return gtToday(new Date(Date.now() + days * 86_400_000));
}
