import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/models/AuditLog.js';
import { InventoryLot } from '../../src/models/InventoryLot.js';
import { InventoryMovement } from '../../src/models/InventoryMovement.js';
import { Sale } from '../../src/models/Sale.js';
import { verifyAuditChain } from '../../src/services/audit.service.js';
import {
  closeDatabase,
  createTestUser,
  getApp,
  loginWithEmail,
  resetDatabase,
  stepUpWithEmail,
} from '../helpers/app.js';
import { createLot, createProduct, isoDaysFromNow } from '../helpers/fixtures.js';

describe('inventory and counter sales', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });
  afterAll(closeDatabase);

  it('receives stock (bodeguero) and records the kardex movement', async () => {
    const bodeguero = await createTestUser('bodeguero');
    const client = await loginWithEmail(bodeguero);
    const created = await client.post('/api/products', {
      sku: 'ACET-500',
      name: 'Acetaminofén 500 mg',
      presentation: 'Caja 10 tabletas',
      category: 'medicamento',
      unitPriceCents: 1500,
      minStock: 10,
    });
    expect(created.status).toBe(201);
    expect(created.body.isControlled).toBe(false);

    const receipt = await client.post('/api/inventory/receipts', {
      productId: created.body.id,
      lotNumber: 'A-001',
      expiresAt: isoDaysFromNow(200),
      quantity: 40,
    });
    expect(receipt.status).toBe(201);
    expect(receipt.body.lot.quantity).toBe(40);
    expect(await InventoryMovement.countDocuments({ type: 'receipt' })).toBe(1);

    // The bodeguero cannot mark a product as controlled: the field is not even accepted.
    const patch = await client.patch(`/api/products/${created.body.id}`, { isControlled: true });
    expect(patch.status).toBe(400);
  });

  it('sells with FEFO, skips expired lots, and uses database prices', async () => {
    const cajero = await createTestUser('cajero');
    const product = await createProduct({ unitPriceCents: 1000 });
    await createLot(product._id, 5, -1, 'EXPIRED');
    const soon = await createLot(product._id, 3, 30, 'SOON');
    const later = await createLot(product._id, 10, 300, 'LATER');

    const client = await loginWithEmail(cajero);
    const res = await client.post('/api/sales', {
      items: [{ productId: String(product._id), quantity: 5 }],
      payment: { method: 'cash', amountReceivedCents: 10_000 },
    });
    expect(res.status).toBe(201);
    expect(res.body.totalCents).toBe(5000);
    expect(res.body.payment.changeCents).toBe(5000);
    expect(res.body.items.map((i: { quantity: number }) => i.quantity)).toEqual([3, 2]);
    expect((await InventoryLot.findById(soon._id).lean())?.quantity).toBe(0);
    expect((await InventoryLot.findById(later._id).lean())?.quantity).toBe(8);
    expect((await InventoryLot.findOne({ lotNumber: 'EXPIRED' }).lean())?.quantity).toBe(5);
  });

  it('never stores card data: simulated payments only get a fictitious reference', async () => {
    const cajero = await createTestUser('cajero');
    const product = await createProduct();
    await createLot(product._id, 5, 100);
    const client = await loginWithEmail(cajero);

    const withCard = await client.post('/api/sales', {
      items: [{ productId: String(product._id), quantity: 1 }],
      payment: { method: 'card_simulated', cardNumber: '4111111111111111' },
    });
    expect(withCard.status).toBe(400);

    const ok = await client.post('/api/sales', {
      items: [{ productId: String(product._id), quantity: 1 }],
      payment: { method: 'card_simulated' },
    });
    expect(ok.status).toBe(201);
    expect(ok.body.payment.authorizationRef).toMatch(/^SIM-[A-Z0-9]{10}$/);
    const stored = await Sale.findById(ok.body.id).lean();
    expect(Object.keys(stored?.payment ?? {}).sort()).toEqual(
      ['amountReceivedCents', 'authorizationRef', 'changeCents', 'method'].sort(),
    );
  });

  it('refuses controlled medicines at the counter and audits the attempt', async () => {
    const cajero = await createTestUser('cajero');
    const product = await createProduct({ isControlled: true });
    await createLot(product._id, 5, 100);
    const client = await loginWithEmail(cajero);
    const res = await client.post('/api/sales', {
      items: [{ productId: String(product._id), quantity: 1 }],
      payment: { method: 'card_simulated' },
    });
    expect(res.status).toBe(403);
    expect(await AuditLog.exists({ action: 'authz.denied', 'details.reason': 'controlled_product_in_counter_sale' })).toBeTruthy();
  });

  it('rejects a sale without enough stock and leaves inventory untouched (transaction)', async () => {
    const cajero = await createTestUser('cajero');
    const a = await createProduct();
    const b = await createProduct();
    const lotA = await createLot(a._id, 5, 100);
    await createLot(b._id, 1, 100);
    const client = await loginWithEmail(cajero);
    const res = await client.post('/api/sales', {
      items: [
        { productId: String(a._id), quantity: 2 },
        { productId: String(b._id), quantity: 3 },
      ],
      payment: { method: 'card_simulated' },
    });
    expect(res.status).toBe(409);
    expect((await InventoryLot.findById(lotA._id).lean())?.quantity).toBe(5);
    expect(await Sale.countDocuments()).toBe(0);
    expect(await AuditLog.exists({ action: 'sale.created' })).toBeNull();
  });

  it('voids a sale only with Regente step-up and restores stock', async () => {
    const cajero = await createTestUser('cajero');
    const regente = await createTestUser('regente');
    const product = await createProduct();
    const lot = await createLot(product._id, 10, 100);
    const cashierClient = await loginWithEmail(cajero);
    const sale = await cashierClient.post('/api/sales', {
      items: [{ productId: String(product._id), quantity: 4 }],
      payment: { method: 'card_simulated' },
    });

    // The cashier cannot void.
    const denied = await cashierClient.post(`/api/sales/${sale.body.id}/void`, { reason: 'Cliente devolvió el producto' });
    expect(denied.status).toBe(403);

    const client = await loginWithEmail(regente);
    const noStepUp = await client.post(`/api/sales/${sale.body.id}/void`, { reason: 'Cliente devolvió el producto' });
    expect(noStepUp.status).toBe(403);
    expect(noStepUp.body.error.code).toBe('STEP_UP_REQUIRED');

    await stepUpWithEmail(client, regente, 'sale.void', sale.body.id);
    const voided = await client.post(`/api/sales/${sale.body.id}/void`, { reason: 'Cliente devolvió el producto' });
    expect(voided.status).toBe(200);
    expect(voided.body.status).toBe('voided');
    expect(voided.body.void.stepUpMethod).toBe('email_otp');
    expect((await InventoryLot.findById(lot._id).lean())?.quantity).toBe(10);
    expect(await InventoryMovement.countDocuments({ type: 'sale_void' })).toBe(1);
    expect((await verifyAuditChain()).ok).toBe(true);
  });

  it('adjusts inventory with step-up and reason; controlled lots only by the Regente', async () => {
    const bodeguero = await createTestUser('bodeguero');
    const normal = await createProduct();
    const controlled = await createProduct({ isControlled: true });
    const lot = await createLot(normal._id, 10, 100);
    const controlledLot = await createLot(controlled._id, 10, 100);
    const client = await loginWithEmail(bodeguero);

    const body = { lotId: String(lot._id), quantityDelta: -2, reasonCode: 'damaged', reason: 'Cajas dañadas por humedad' };
    expect((await client.post('/api/inventory/adjustments', body)).body.error.code).toBe('STEP_UP_REQUIRED');
    await stepUpWithEmail(client, bodeguero, 'inventory.adjust', String(lot._id));
    const ok = await client.post('/api/inventory/adjustments', body);
    expect(ok.status).toBe(201);
    expect(ok.body.lot.quantity).toBe(8);

    const controlledBody = { ...body, lotId: String(controlledLot._id) };
    await stepUpWithEmail(client, bodeguero, 'inventory.adjust', String(controlledLot._id));
    expect((await client.post('/api/inventory/adjustments', controlledBody)).status).toBe(403);
    expect((await InventoryLot.findById(controlledLot._id).lean())?.quantity).toBe(10);
  });
});
