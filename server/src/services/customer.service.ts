import { Types } from 'mongoose';
import { PRIVACY_NOTICE } from '../data/privacyNotice.js';
import { Customer, type ICustomer } from '../models/Customer.js';
import { LoyaltyTransaction } from '../models/LoyaltyTransaction.js';
import { Errors } from '../utils/httpError.js';
import { maskPhone } from '../utils/mask.js';
import type { CreateCustomerInput, LookupCustomerInput, UpdateCustomerInput } from '../validation/customer.schemas.js';
import { appendAudit, runAuditedTransaction, type AuditContext } from './audit.service.js';
import { blindIndex, decryptField, encryptField } from './crypto.service.js';

const COLLECTION = 'customers';

function decryptPhone(customer: ICustomer): string | null {
  return customer.phone ? decryptField(COLLECTION, customer._id, 'phone', customer.phone) : null;
}

function decryptEmail(customer: ICustomer): string | null {
  return customer.email ? decryptField(COLLECTION, customer._id, 'email', customer.email) : null;
}

function summaryDto(customer: ICustomer) {
  const phone = decryptPhone(customer);
  return {
    id: String(customer._id),
    fullName: customer.fullName,
    phoneMasked: phone ? maskPhone(phone) : null,
    pointsBalance: customer.pointsBalance,
    status: customer.status,
  };
}

function contactFields(id: Types.ObjectId, data: { phone?: string | undefined; email?: string | undefined }) {
  const set: Record<string, unknown> = {};
  if (data.phone !== undefined) {
    set.phone = encryptField(COLLECTION, id, 'phone', data.phone);
    set.phoneHmac = blindIndex('phone', data.phone);
  }
  if (data.email !== undefined) {
    set.email = encryptField(COLLECTION, id, 'email', data.email);
    set.emailHmac = blindIndex('email', data.email);
  }
  return set;
}

export function privacyNotice() {
  return PRIVACY_NOTICE;
}

/** Exact search through the blind index; the result is masked. */
export async function lookupCustomer(query: LookupCustomerInput) {
  const filter: Record<string, string> = query.phone
    ? { phoneHmac: blindIndex('phone', query.phone), status: 'active' }
    : { emailHmac: blindIndex('email', query.email ?? ''), status: 'active' };
  const customer = await Customer.findOne(filter).lean();
  if (!customer) throw Errors.notFound();
  return summaryDto(customer);
}

export async function createCustomer(data: CreateCustomerInput, actorId: string, ctx: AuditContext) {
  if (data.consent.noticeVersion !== PRIVACY_NOTICE.version) {
    throw Errors.validation([{ path: 'body.consent.noticeVersion', message: 'El aviso aceptado no es el vigente' }]);
  }
  if (await Customer.exists({ phoneHmac: blindIndex('phone', data.phone), status: 'active' })) {
    throw Errors.conflict('Ya existe un cliente con ese teléfono.');
  }
  if (data.email && (await Customer.exists({ emailHmac: blindIndex('email', data.email), status: 'active' }))) {
    throw Errors.conflict('Ya existe un cliente con ese correo.');
  }
  const id = new Types.ObjectId(); // generated first: it is part of the encryption AAD
  const userId = new Types.ObjectId(actorId);
  const customer = await runAuditedTransaction(ctx, async ({ session, audit }) => {
    const [created] = await Customer.create(
      [
        {
          _id: id,
          fullName: data.fullName,
          ...contactFields(id, data),
          consent: {
            accepted: true,
            noticeVersion: data.consent.noticeVersion,
            acceptedAt: new Date(),
            recordedBy: userId,
            channel: 'mostrador',
          },
          createdBy: userId,
        },
      ],
      { session },
    );
    if (!created) throw new Error('customer not created');
    audit({
      action: 'customer.created',
      result: 'success',
      entity: 'customer',
      entityId: id,
      details: { noticeVersion: data.consent.noticeVersion, withEmail: Boolean(data.email) },
    });
    return created.toObject();
  });
  return summaryDto(customer);
}

/** Full detail with decrypted contact data; every access is audited. */
export async function getCustomer(id: string, ctx: AuditContext) {
  const customer = await Customer.findById(id).lean();
  if (!customer) throw Errors.notFound();
  const movements = await LoyaltyTransaction.find({ customerId: customer._id }).sort({ createdAt: -1 }).limit(20).lean();
  await appendAudit(ctx, { action: 'customer.viewed', result: 'success', entity: 'customer', entityId: customer._id });
  return {
    ...summaryDto(customer),
    phone: decryptPhone(customer),
    email: decryptEmail(customer),
    consent: {
      noticeVersion: customer.consent.noticeVersion,
      acceptedAt: customer.consent.acceptedAt,
      withdrawnAt: customer.consentWithdrawnAt,
    },
    pointsHistory: movements.map((m) => ({
      id: String(m._id),
      type: m.type,
      points: m.points,
      saleId: String(m.saleId),
      createdAt: m.createdAt,
    })),
    createdAt: customer.createdAt,
  };
}

export async function updateCustomer(id: string, data: UpdateCustomerInput, ctx: AuditContext) {
  const customer = await Customer.findById(id).lean();
  if (!customer || customer.status !== 'active') throw Errors.notFound();
  if (data.phone) {
    const other = await Customer.findOne({ phoneHmac: blindIndex('phone', data.phone), status: 'active' }).lean();
    if (other && String(other._id) !== id) throw Errors.conflict('Ya existe un cliente con ese teléfono.');
  }
  if (data.email) {
    const other = await Customer.findOne({ emailHmac: blindIndex('email', data.email), status: 'active' }).lean();
    if (other && String(other._id) !== id) throw Errors.conflict('Ya existe un cliente con ese correo.');
  }
  await runAuditedTransaction(ctx, async ({ session, audit }) => {
    const set: Record<string, unknown> = { ...contactFields(customer._id, data) };
    if (data.fullName) set.fullName = data.fullName;
    await Customer.updateOne({ _id: customer._id }, { $set: set }, { session });
    audit({
      action: 'customer.updated',
      result: 'success',
      entity: 'customer',
      entityId: customer._id,
      details: { fields: Object.keys(data) },
    });
  });
  return getCustomer(id, ctx);
}

/** Consent withdrawal: personal data is anonymised; the points history stays without identity. */
export async function withdrawConsent(id: string, reason: string, ctx: AuditContext) {
  const customer = await Customer.findById(id).lean();
  if (!customer || customer.status !== 'active') throw Errors.notFound();
  await runAuditedTransaction(ctx, async ({ session, audit }) => {
    await Customer.updateOne(
      { _id: customer._id },
      {
        $set: { fullName: 'Cliente anonimizado', status: 'withdrawn', consentWithdrawnAt: new Date() },
        $unset: { phone: 1, phoneHmac: 1, email: 1, emailHmac: 1 },
      },
      { session },
    );
    audit({
      action: 'customer.consent.withdrawn',
      result: 'success',
      entity: 'customer',
      entityId: customer._id,
      details: { reason },
    });
  });
}
