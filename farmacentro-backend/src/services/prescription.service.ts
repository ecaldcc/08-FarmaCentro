import { Types } from 'mongoose';
import { nextNumber } from '../models/Counter.js';
import { Customer } from '../models/Customer.js';
import { Dispensation } from '../models/Dispensation.js';
import { Prescription, type IPrescription, type PrescriptionItem } from '../models/Prescription.js';
import { Product } from '../models/Product.js';
import { addDays, gtDayEnd, gtDayStart, gtToday } from '../utils/dates.js';
import { Errors } from '../utils/httpError.js';
import { op } from '../utils/trusted.js';
import type {
  CreatePrescriptionInput,
  DispenseInput,
  ListPrescriptionsInput,
} from '../validation/prescription.schemas.js';
import { appendAudit, runAuditedTransaction, type AuditContext } from './audit.service.js';
import { decryptField, decryptJson, encryptField, encryptJson } from './crypto.service.js';
import { allocateStock, loadProducts, persistSale, presentSales } from './sale.service.js';

const COLLECTION = 'prescriptions';
/** Prescription validity for dispensing (decision D-16). */
export const PRESCRIPTION_VALID_DAYS = 30;

function listDto(p: IPrescription) {
  return {
    id: String(p._id),
    folio: p.folio,
    issuedAt: p.issuedAt,
    status: p.status,
    hasControlled: p.hasControlled,
    expired: isExpired(p),
    createdAt: p.createdAt,
  };
}

function isExpired(p: IPrescription): boolean {
  return addDays(p.issuedAt, PRESCRIPTION_VALID_DAYS).getTime() < Date.now();
}

function decryptItems(p: IPrescription): PrescriptionItem[] {
  return decryptJson<PrescriptionItem[]>(COLLECTION, p._id, 'items', p.items);
}

/** Quantity already dispensed per product for a prescription. */
async function dispensedByProduct(prescriptionId: Types.ObjectId): Promise<Map<string, number>> {
  const dispensations = await Dispensation.find({ prescriptionId }).lean();
  const totals = new Map<string, number>();
  for (const d of dispensations) {
    for (const item of d.items) {
      const key = String(item.productId);
      totals.set(key, (totals.get(key) ?? 0) + item.quantity);
    }
  }
  return totals;
}

/** Listing never decrypts clinical fields. */
export async function listPrescriptions(query: ListPrescriptionsInput) {
  const filter: Record<string, unknown> = {};
  if (query.folio) filter.folio = query.folio;
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) range.$gte = gtDayStart(query.from);
    if (query.to) range.$lt = gtDayEnd(query.to);
    filter.createdAt = op(range);
  }
  const [items, total] = await Promise.all([
    Prescription.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    Prescription.countDocuments(filter),
  ]);
  return { items: items.map(listDto), page: query.page, pageSize: query.pageSize, total };
}

/** Decrypted detail; every access is written to the audit log (CLAUDE.md "Bitácora"). */
export async function getPrescription(id: string, ctx: AuditContext) {
  const p = await Prescription.findById(id).lean();
  if (!p) throw Errors.notFound();
  const dispensed = await dispensedByProduct(p._id);
  const items = decryptItems(p).map((item) => ({
    ...item,
    quantityDispensed: dispensed.get(item.productId) ?? 0,
    quantityRemaining: item.quantityPrescribed - (dispensed.get(item.productId) ?? 0),
  }));
  const productFlags = await Product.find(
    { _id: op({ $in: items.map((i) => new Types.ObjectId(i.productId)) }) },
    { isControlled: 1 },
  ).lean();
  const controlled = new Set(productFlags.filter((f) => f.isControlled).map((f) => String(f._id)));

  await appendAudit(ctx, {
    action: 'prescription.viewed',
    result: 'success',
    entity: 'prescription',
    entityId: p._id,
    details: { folio: p.folio },
  });
  return {
    ...listDto(p),
    customerId: p.customerId ? String(p.customerId) : null,
    patientName: decryptField(COLLECTION, p._id, 'patientName', p.patientName),
    doctorName: decryptField(COLLECTION, p._id, 'doctorName', p.doctorName),
    doctorLicense: decryptField(COLLECTION, p._id, 'doctorLicense', p.doctorLicense),
    notes: p.notes ? decryptField(COLLECTION, p._id, 'notes', p.notes) : null,
    items: items.map((i) => ({ ...i, isControlled: controlled.has(i.productId) })),
    validUntil: addDays(p.issuedAt, PRESCRIPTION_VALID_DAYS),
    cancel: p.cancel ? { cancelledAt: p.cancel.cancelledAt, reason: p.cancel.reason } : null,
  };
}

export async function createPrescription(data: CreatePrescriptionInput, actorId: string, ctx: AuditContext) {
  const issuedAt = gtDayStart(data.issuedAt);
  if (data.issuedAt > gtToday()) {
    throw Errors.validation([{ path: 'body.issuedAt', message: 'La fecha de emisión no puede ser futura' }]);
  }
  if (data.customerId && !(await Customer.exists({ _id: new Types.ObjectId(data.customerId), status: 'active' }))) {
    throw Errors.conflict('El cliente no existe o retiró su consentimiento.');
  }
  const products = await Product.find({
    _id: op({ $in: data.items.map((i) => new Types.ObjectId(i.productId)) }),
  }).lean();
  if (products.length !== data.items.length) throw Errors.conflict('Alguno de los medicamentos no existe.');
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items: PrescriptionItem[] = data.items.map((i) => ({
    productId: i.productId,
    productName: byId.get(i.productId)?.name ?? '',
    dosage: i.dosage,
    quantityPrescribed: i.quantityPrescribed,
  }));
  const id = new Types.ObjectId(); // part of the AAD of every encrypted field
  const hasControlled = products.some((p) => p.isControlled);

  const created = await runAuditedTransaction(ctx, async ({ session, audit }) => {
    const folio = await nextNumber('prescription', 'R', session);
    await Prescription.create(
      [
        {
          _id: id,
          folio,
          customerId: data.customerId ? new Types.ObjectId(data.customerId) : null,
          patientName: encryptField(COLLECTION, id, 'patientName', data.patientName),
          doctorName: encryptField(COLLECTION, id, 'doctorName', data.doctorName),
          doctorLicense: encryptField(COLLECTION, id, 'doctorLicense', data.doctorLicense),
          issuedAt,
          items: encryptJson(COLLECTION, id, 'items', items),
          notes: data.notes ? encryptField(COLLECTION, id, 'notes', data.notes) : null,
          hasControlled,
          registeredBy: new Types.ObjectId(actorId),
        },
      ],
      { session },
    );
    audit({
      action: 'prescription.created',
      result: 'success',
      entity: 'prescription',
      entityId: id,
      details: { folio, items: items.length, hasControlled },
    });
    return { id: String(id), folio };
  });
  return created;
}

export async function cancelPrescription(id: string, reason: string, actorId: string, ctx: AuditContext) {
  const p = await Prescription.findById(id).lean();
  if (!p) throw Errors.notFound();
  if (p.status !== 'registered') {
    throw Errors.conflict('Solo se pueden anular recetas que no se han despachado.');
  }
  await runAuditedTransaction(ctx, async ({ session, audit }) => {
    const res = await Prescription.updateOne(
      { _id: p._id, status: 'registered' },
      { $set: { status: 'cancelled', cancel: { cancelledAt: new Date(), cancelledBy: new Types.ObjectId(actorId), reason } } },
      { session },
    );
    if (res.modifiedCount !== 1) throw Errors.conflict('La receta cambió de estado.');
    audit({
      action: 'prescription.cancelled',
      result: 'success',
      entity: 'prescription',
      entityId: p._id,
      details: { folio: p.folio, reason },
    });
  });
}

/** Loads what the controller needs to decide whether the dispensation requires step-up. */
export async function dispensationRequiresStepUp(data: DispenseInput): Promise<boolean> {
  const products = await loadProducts(data.items);
  return [...products.values()].some((p) => p.isControlled);
}

/**
 * Dispenses a prescription: validates remaining quantities, then creates the sale, the
 * dispensation record, the inventory movements and the audit entry in one transaction.
 */
export async function dispensePrescription(
  id: string,
  data: DispenseInput,
  actorId: string,
  ctx: AuditContext,
  stepUpMethod: string | null,
) {
  const p = await Prescription.findById(id).lean();
  if (!p) throw Errors.notFound();
  const fail = async (message: string) => {
    await appendAudit(ctx, {
      action: 'prescription.dispensed',
      result: 'failure',
      entity: 'prescription',
      entityId: p._id,
      details: { folio: p.folio, reason: message },
    });
    return Errors.conflict(message);
  };
  if (p.status === 'cancelled' || p.status === 'dispensed') throw await fail('La receta no admite más despachos.');
  if (isExpired(p)) throw await fail(`La receta venció (vigencia de ${PRESCRIPTION_VALID_DAYS} días).`);

  const prescribed = new Map(decryptItems(p).map((i) => [i.productId, i.quantityPrescribed]));
  const dispensed = await dispensedByProduct(p._id);
  for (const item of data.items) {
    const allowed = prescribed.get(item.productId);
    if (allowed === undefined) throw await fail('Uno de los productos no está en la receta.');
    if (item.quantity + (dispensed.get(item.productId) ?? 0) > allowed) {
      throw await fail('La cantidad supera lo prescrito.');
    }
  }
  const products = await loadProducts(data.items);
  const hasControlled = [...products.values()].some((pr) => pr.isControlled);

  const result = await runAuditedTransaction(ctx, async (tx) => {
    const { session } = tx;
    const dispensationId = new Types.ObjectId();
    const lines = await allocateStock(data.items, products, session);
    const sale = await persistSale({
      tx,
      cashierId: actorId,
      customerId: p.customerId ? String(p.customerId) : undefined,
      lines,
      payment: data.payment,
      movementType: 'dispensation',
      dispensationId,
    });
    await Dispensation.create(
      [
        {
          _id: dispensationId,
          prescriptionId: p._id,
          saleId: sale._id,
          items: lines.map((l) => ({
            productId: l.item.productId,
            lotId: l.item.lotId,
            quantity: l.item.quantity,
            isControlled: l.item.isControlled,
          })),
          pharmacistId: new Types.ObjectId(actorId),
          stepUpMethod,
        },
      ],
      { session },
    );

    for (const item of data.items) {
      dispensed.set(item.productId, (dispensed.get(item.productId) ?? 0) + item.quantity);
    }
    const complete = [...prescribed.entries()].every(([productId, qty]) => (dispensed.get(productId) ?? 0) >= qty);
    await Prescription.updateOne(
      { _id: p._id },
      { $set: { status: complete ? 'dispensed' : 'partially_dispensed' } },
      { session },
    );

    tx.audit({
      action: 'prescription.dispensed',
      result: 'success',
      entity: 'prescription',
      entityId: p._id,
      details: {
        folio: p.folio,
        dispensationId: String(dispensationId),
        saleNumber: sale.saleNumber,
        hasControlled,
        complete,
        stepUpMethod,
      },
    });
    return { dispensationId: String(dispensationId), sale };
  });
  const [sale] = await presentSales([result.sale]);
  return { dispensationId: result.dispensationId, sale: sale! };
}
