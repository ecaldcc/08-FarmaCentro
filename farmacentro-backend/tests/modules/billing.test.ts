import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { isValidCui, isValidNit, normalizeTaxId } from '../../src/domain/taxId.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { BillingParty } from '../../src/models/BillingParty.js';
import { InventoryLot } from '../../src/models/InventoryLot.js';
import { Sale } from '../../src/models/Sale.js';
import { closeDatabase, createTestUser, getApp, loginWithEmail, resetDatabase } from '../helpers/app.js';
import { createLot, createProduct } from '../helpers/fixtures.js';

// Fictitious identifiers with valid check digits.
const NIT = '1234567-9';
const CUI = '1234567890101';

describe('tax identifier validation', () => {
  it('validates the NIT check digit, including K', () => {
    expect(isValidNit(normalizeTaxId(NIT))).toBe(true);
    expect(isValidNit(normalizeTaxId('1234567-8'))).toBe(false);
    expect(isValidNit(normalizeTaxId('6-k'))).toBe(true);
    expect(isValidNit('ABC')).toBe(false);
  });

  it('validates the DPI (CUI) check digit and department', () => {
    expect(isValidCui(CUI)).toBe(true);
    expect(isValidCui('1234567800101')).toBe(false); // wrong check digit
    expect(isValidCui('1234567892301')).toBe(false); // department 23 does not exist
    expect(isValidCui('123456789010')).toBe(false); // 12 digits
  });
});

describe('receipt identification at checkout (CF / NIT / DPI)', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });
  afterAll(closeDatabase);

  async function setup(unitPriceCents = 1000) {
    const cajero = await createTestUser('cajero');
    const product = await createProduct({ unitPriceCents });
    const lot = await createLot(product._id, 100, 200);
    const client = await loginWithEmail(cajero);
    const sell = (quantity: number, billing?: unknown) =>
      client.post('/api/sales', {
        items: [{ productId: String(product._id), quantity }],
        payment: { method: 'card_simulated' },
        ...(billing ? { billing } : {}),
      });
    return { client, sell, lot };
  }

  it('defaults to Consumidor final below Q2,500', async () => {
    const { sell } = await setup();
    const res = await sell(2);
    expect(res.status).toBe(201);
    expect(res.body.billing).toEqual({ type: 'CF', name: 'Consumidor final', taxIdDisplay: null });
  });

  it('requires NIT or DPI from Q2,500.00 and leaves stock untouched', async () => {
    const { sell, lot } = await setup(125_000); // Q1,250 × 2 = Q2,500.00
    const res = await sell(2, { type: 'CF' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields[0].path).toBe('body.billing.type');
    expect((await InventoryLot.findById(lot._id).lean())?.quantity).toBe(100);
    expect(await Sale.countDocuments()).toBe(0);

    const ok = await sell(2, { type: 'NIT', taxId: NIT, name: 'Distribuidora Ejemplo, S.A.' });
    expect(ok.status).toBe(201);
  });

  it('asks for the name of an unregistered NIT, stores it encrypted and reuses it', async () => {
    const { sell } = await setup();
    const missingName = await sell(1, { type: 'NIT', taxId: NIT });
    expect(missingName.status).toBe(400);
    expect(missingName.body.error.fields[0].path).toBe('body.billing.name');

    const first = await sell(1, { type: 'NIT', taxId: NIT, name: 'Distribuidora Ejemplo, S.A.' });
    expect(first.status).toBe(201);
    expect(first.body.billing).toEqual({ type: 'NIT', name: 'Distribuidora Ejemplo, S.A.', taxIdDisplay: '1234567-9' });
    const raw = JSON.stringify(await BillingParty.collection.findOne({}));
    expect(raw).not.toContain('12345679');

    // Already registered: no name needed, the registered one is used.
    const second = await sell(1, { type: 'NIT', taxId: '12345679' });
    expect(second.status).toBe(201);
    expect(second.body.billing.name).toBe('Distribuidora Ejemplo, S.A.');
    expect(await BillingParty.countDocuments()).toBe(1);
  });

  it('masks the DPI on the receipt and never stores it in clear', async () => {
    const { sell } = await setup();
    const res = await sell(1, { type: 'CUI', taxId: CUI, name: 'Pedro Pérez' });
    expect(res.status).toBe(201);
    expect(res.body.billing.taxIdDisplay).toBe('XXXX XXXXX 0101');
    expect(JSON.stringify(await Sale.collection.findOne({}))).not.toContain(CUI);
    expect(JSON.stringify(await BillingParty.collection.findOne({}))).not.toContain(CUI);
  });

  it('rejects invalid identifiers', async () => {
    const { sell } = await setup();
    expect((await sell(1, { type: 'NIT', taxId: '1234567-8', name: 'Alguien' })).status).toBe(400);
    expect((await sell(1, { type: 'CUI', taxId: '123', name: 'Alguien' })).status).toBe(400);
  });

  it('lets cashiers look up a registered buyer (audited) and denies other roles', async () => {
    const { sell, client } = await setup();
    await sell(1, { type: 'NIT', taxId: NIT, name: 'Distribuidora Ejemplo, S.A.' });

    const found = await client.get('/api/billing-parties/lookup?type=NIT&taxId=1234567-9');
    expect(found.status).toBe(200);
    expect(found.body).toEqual({ type: 'NIT', name: 'Distribuidora Ejemplo, S.A.', taxIdDisplay: '1234567-9' });
    expect((await client.get('/api/billing-parties/lookup?type=CUI&taxId=1234567890101')).status).toBe(404);
    expect(await AuditLog.countDocuments({ action: 'billing_party.viewed' })).toBe(2);

    const bodeguero = await loginWithEmail(await createTestUser('bodeguero'));
    expect((await bodeguero.get('/api/billing-parties/lookup?type=NIT&taxId=1234567-9')).status).toBe(403);
  });
});
