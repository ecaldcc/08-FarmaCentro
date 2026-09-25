import { Types } from 'mongoose';
import { BILLING_ID_THRESHOLD_CENTS, displayTaxId, type TaxIdType } from '../domain/taxId.js';
import { BillingParty } from '../models/BillingParty.js';
import type { ISaleBilling } from '../models/Sale.js';
import { Errors } from '../utils/httpError.js';
import { formatQuetzales } from '../utils/money.js';
import type { BillingInput } from '../validation/sales.schemas.js';
import { appendAudit, type AuditContext, type AuditedTx } from './audit.service.js';
import { blindIndex, encryptField } from './crypto.service.js';

const COLLECTION = 'billing_parties';
export const CONSUMIDOR_FINAL = 'Consumidor final';

/**
 * Finds a registered NIT/DPI to prefill the buyer's name at the counter. Every lookup is audited
 * because it reveals the name linked to an identification number.
 */
export async function lookupBillingParty(type: TaxIdType, taxId: string, ctx: AuditContext) {
  const party = await BillingParty.findOne({ type, taxIdHmac: blindIndex(type, taxId) }).lean();
  await appendAudit(ctx, {
    action: 'billing_party.viewed',
    result: party ? 'success' : 'failure',
    entity: 'billing_party',
    entityId: party?._id ?? null,
    details: { type, found: Boolean(party) },
  });
  if (!party) throw Errors.notFound();
  return { type, name: party.name, taxIdDisplay: displayTaxId(type, taxId) };
}

/**
 * Resolves who the receipt is issued to, inside the sale transaction:
 * - From Q2,500.00 the buyer must be identified with NIT or DPI (no CF).
 * - A NIT/DPI that is not registered yet needs the buyer's name; it is stored encrypted.
 */
export async function resolveBilling(
  billing: BillingInput,
  totalCents: number,
  actorId: string,
  tx: AuditedTx,
): Promise<ISaleBilling> {
  if (billing.type === 'CF') {
    if (totalCents >= BILLING_ID_THRESHOLD_CENTS) {
      throw Errors.validation([
        {
          path: 'body.billing.type',
          message: `Desde ${formatQuetzales(BILLING_ID_THRESHOLD_CENTS)} la venta requiere NIT o DPI del comprador.`,
        },
      ]);
    }
    return { type: 'CF', partyId: null, name: CONSUMIDOR_FINAL, taxIdDisplay: null };
  }

  const hmac = blindIndex(billing.type, billing.taxId);
  const existing = await BillingParty.findOne({ type: billing.type, taxIdHmac: hmac }).session(tx.session).lean();
  if (existing) {
    return {
      type: billing.type,
      partyId: existing._id,
      name: existing.name,
      taxIdDisplay: displayTaxId(billing.type, billing.taxId),
    };
  }
  if (!billing.name) {
    throw Errors.validation([
      {
        path: 'body.billing.name',
        message: `El ${billing.type === 'NIT' ? 'NIT' : 'DPI'} no está registrado: ingresa el nombre del comprador.`,
      },
    ]);
  }

  const id = new Types.ObjectId(); // part of the encryption AAD
  await BillingParty.create(
    [
      {
        _id: id,
        type: billing.type,
        taxId: encryptField(COLLECTION, id, 'taxId', billing.taxId),
        taxIdHmac: hmac,
        name: billing.name,
        createdBy: new Types.ObjectId(actorId),
      },
    ],
    { session: tx.session },
  );
  tx.audit({ action: 'billing_party.created', result: 'success', entity: 'billing_party', entityId: id, details: { type: billing.type } });
  return { type: billing.type, partyId: id, name: billing.name, taxIdDisplay: displayTaxId(billing.type, billing.taxId) };
}
