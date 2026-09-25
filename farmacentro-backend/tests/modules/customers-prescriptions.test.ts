import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PRIVACY_NOTICE } from '../../src/data/privacyNotice.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { Customer } from '../../src/models/Customer.js';
import { Dispensation } from '../../src/models/Dispensation.js';
import { Prescription } from '../../src/models/Prescription.js';
import {
  closeDatabase,
  createTestUser,
  getApp,
  loginWithEmail,
  resetDatabase,
  stepUpWithEmail,
} from '../helpers/app.js';
import { createLot, createProduct, isoDaysFromNow } from '../helpers/fixtures.js';

const consent = { accepted: true, noticeVersion: PRIVACY_NOTICE.version };

afterAll(closeDatabase);

describe('loyalty customers', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });

  it('requires explicit consent to register a customer', async () => {
    const client = await loginWithEmail(await createTestUser('cajero'));
    const base = { fullName: 'María López', phone: '55512345' };
    expect((await client.post('/api/customers', base)).status).toBe(400);
    expect((await client.post('/api/customers', { ...base, consent: { ...consent, accepted: false } })).status).toBe(400);
    expect(
      (await client.post('/api/customers', { ...base, consent: { accepted: true, noticeVersion: 'viejo' } })).status,
    ).toBe(400);
    const ok = await client.post('/api/customers', { ...base, email: 'maria@example.com', consent });
    expect(ok.status).toBe(201);
    expect(ok.body.phoneMasked).toBe('****-2345');
  });

  it('stores contact data encrypted and finds it through the blind index', async () => {
    const client = await loginWithEmail(await createTestUser('cajero'));
    const created = await client.post('/api/customers', { fullName: 'Juan Pérez', phone: '44440000', consent });
    const raw = await Customer.collection.findOne({});
    expect(JSON.stringify(raw)).not.toContain('44440000');
    expect(raw?.phone).toHaveProperty('iv');

    const found = await client.get('/api/customers/lookup?phone=44440000');
    expect(found.status).toBe(200);
    expect(found.body.id).toBe(created.body.id);
    const detail = await client.get(`/api/customers/${created.body.id}`);
    expect(detail.body.phone).toBe('44440000');
    expect(await AuditLog.exists({ action: 'customer.viewed' })).toBeTruthy();
  });

  it('earns points on sales and anonymises data when consent is withdrawn', async () => {
    const cajero = await createTestUser('cajero');
    const regente = await createTestUser('regente');
    const product = await createProduct({ unitPriceCents: 5000 });
    await createLot(product._id, 10, 100);
    const client = await loginWithEmail(cajero);
    const customer = await client.post('/api/customers', { fullName: 'Ana Gómez', phone: '33332222', consent });
    const sale = await client.post('/api/sales', {
      customerId: customer.body.id,
      items: [{ productId: String(product._id), quantity: 3 }],
      payment: { method: 'card_simulated' },
    });
    expect((await Customer.findById(customer.body.id).lean())?.pointsBalance).toBe(15);
    // The receipt shows the customer's name (and never the encrypted contact data).
    expect(sale.body.customerName).toBe('Ana Gómez');
    const receipt = await client.get(`/api/sales/${sale.body.id}`);
    expect(receipt.body.customerName).toBe('Ana Gómez');
    expect(JSON.stringify(receipt.body)).not.toContain('33332222');

    const regenteClient = await loginWithEmail(regente);
    const withdrawn = await regenteClient.post(`/api/customers/${customer.body.id}/consent-withdrawal`, {
      reason: 'La clienta pidió retirar su consentimiento',
    });
    expect(withdrawn.status).toBe(204);
    const stored = await Customer.findById(customer.body.id).lean();
    expect(stored?.fullName).toBe('Cliente anonimizado');
    expect(stored?.phone).toBeUndefined();
    expect((await regenteClient.get('/api/customers/lookup?phone=33332222')).status).toBe(404);
  });
});

describe('prescriptions', () => {
  beforeEach(async () => {
    await getApp();
    await resetDatabase();
  });

  async function newPrescription(controlled: boolean) {
    const regente = await createTestUser('regente');
    const product = await createProduct({ isControlled: controlled, unitPriceCents: 3000 });
    await createLot(product._id, 20, 100);
    const client = await loginWithEmail(regente);
    const res = await client.post('/api/prescriptions', {
      patientName: 'Pedro Paciente',
      doctorName: 'Dra. Laura Médica',
      doctorLicense: 'COL-12345',
      issuedAt: isoDaysFromNow(0),
      items: [{ productId: String(product._id), dosage: '1 tableta cada 8 horas', quantityPrescribed: 4 }],
      notes: 'Tratamiento de 5 días',
    });
    expect(res.status).toBe(201);
    return { regente, client, product, id: res.body.id as string };
  }

  it('encrypts every clinical field and audits each read', async () => {
    const { client, id } = await newPrescription(false);
    const raw = JSON.stringify(await Prescription.collection.findOne({}));
    for (const secret of ['Pedro Paciente', 'Laura', 'COL-12345', 'tableta', 'Tratamiento']) {
      expect(raw).not.toContain(secret);
    }
    const list = await client.get('/api/prescriptions');
    expect(JSON.stringify(list.body)).not.toContain('Pedro');
    const detail = await client.get(`/api/prescriptions/${id}`);
    expect(detail.body.patientName).toBe('Pedro Paciente');
    expect(await AuditLog.countDocuments({ action: 'prescription.viewed' })).toBe(1);
  });

  it('is invisible to every role except the Regente', async () => {
    const { id } = await newPrescription(false);
    for (const role of ['admin', 'cajero', 'bodeguero', 'auditor'] as const) {
      const other = await loginWithEmail(await createTestUser(role));
      expect((await other.get(`/api/prescriptions/${id}`)).status).toBe(403);
      expect((await other.get('/api/prescriptions')).status).toBe(403);
    }
  });

  it('requires step-up to dispense controlled medicines and caps the prescribed quantity', async () => {
    const { client, regente, product, id } = await newPrescription(true);
    const body = { items: [{ productId: String(product._id), quantity: 3 }], payment: { method: 'card_simulated' } };
    const noStepUp = await client.post(`/api/prescriptions/${id}/dispense`, body);
    expect(noStepUp.body.error.code).toBe('STEP_UP_REQUIRED');

    await stepUpWithEmail(client, regente, 'prescription.dispense', id);
    const ok = await client.post(`/api/prescriptions/${id}/dispense`, body);
    expect(ok.status).toBe(201);
    expect(await Dispensation.countDocuments()).toBe(1);
    expect((await Prescription.findById(id).lean())?.status).toBe('partially_dispensed');

    await stepUpWithEmail(client, regente, 'prescription.dispense', id);
    const tooMuch = await client.post(`/api/prescriptions/${id}/dispense`, body);
    expect(tooMuch.status).toBe(409);
  });
});
