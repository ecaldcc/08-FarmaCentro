import { Types } from 'mongoose';
import { AuditLog, type IAuditLog } from '../models/AuditLog.js';
import { Dispensation } from '../models/Dispensation.js';
import { InventoryLot } from '../models/InventoryLot.js';
import { InventoryMovement } from '../models/InventoryMovement.js';
import { Prescription } from '../models/Prescription.js';
import { Product } from '../models/Product.js';
import { Sale } from '../models/Sale.js';
import { User } from '../models/User.js';
import { WebAuthnCredential } from '../models/WebAuthnCredential.js';
import { gtDayEnd, gtDayStart } from '../utils/dates.js';
import { Errors } from '../utils/httpError.js';
import { maskEmail } from '../utils/mask.js';
import { op } from '../utils/trusted.js';
import type { AuditExportInput, AuditLogsInput } from '../validation/audit.schemas.js';

export const MAX_EXPORT_ROWS = 50_000;

export interface Column {
  key: string;
  header: string;
}

export interface Report {
  name: string;
  columns: Column[];
  rows: Record<string, unknown>[];
}

function dateRange(from?: string, to?: string): Record<string, Date> | null {
  if (!from && !to) return null;
  const range: Record<string, Date> = {};
  if (from) range.$gte = gtDayStart(from);
  if (to) range.$lt = gtDayEnd(to);
  return range;
}

// ------------------------------------------------------------------------------ audit logs

function auditFilter(query: AuditExportInput): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  const range = dateRange(query.from, query.to);
  if (range) filter.timestamp = op(range);
  if (query.action) filter.action = query.action;
  if (query.userId) filter['actor.userId'] = new Types.ObjectId(query.userId);
  if (query.username) filter['actor.username'] = query.username;
  if (query.result) filter.result = query.result;
  if (query.entity) filter.entity = query.entity;
  if (query.entityId) filter.entityId = query.entityId;
  return filter;
}

export function auditDto(entry: IAuditLog) {
  return {
    seq: entry.seq,
    timestamp: entry.timestamp,
    userId: entry.actor.userId ? String(entry.actor.userId) : null,
    username: entry.actor.username,
    role: entry.actor.role,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    result: entry.result,
    details: entry.details,
    ip: entry.ip,
    userAgent: entry.userAgent,
    requestId: entry.requestId,
    prevHash: entry.prevHash,
    hash: entry.hash,
  };
}

export async function listAuditLogs(query: AuditLogsInput) {
  const filter = auditFilter(query);
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ seq: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { items: items.map(auditDto), page: query.page, pageSize: query.pageSize, total };
}

export const AUDIT_COLUMNS: Column[] = [
  { key: 'seq', header: 'seq' },
  { key: 'timestamp', header: 'fecha_utc' },
  { key: 'username', header: 'usuario' },
  { key: 'userId', header: 'id_usuario' },
  { key: 'role', header: 'rol' },
  { key: 'action', header: 'accion' },
  { key: 'entity', header: 'entidad' },
  { key: 'entityId', header: 'id_entidad' },
  { key: 'result', header: 'resultado' },
  { key: 'details', header: 'detalles' },
  { key: 'ip', header: 'ip' },
  { key: 'userAgent', header: 'user_agent' },
  { key: 'requestId', header: 'id_solicitud' },
  { key: 'prevHash', header: 'hash_anterior' },
  { key: 'hash', header: 'hash' },
];

export async function exportAuditLogs(query: AuditExportInput): Promise<Report> {
  const filter = auditFilter(query);
  const total = await AuditLog.countDocuments(filter);
  if (total > MAX_EXPORT_ROWS) {
    throw Errors.badRequest(`La exportación supera ${MAX_EXPORT_ROWS} filas; acota el rango de fechas.`);
  }
  const items = await AuditLog.find(filter).sort({ seq: 1 }).lean();
  return { name: 'bitacora', columns: AUDIT_COLUMNS, rows: items.map(auditDto) };
}

// --------------------------------------------------------------------------------- reports

async function usernames(ids: (Types.ObjectId | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))].map((id) => new Types.ObjectId(id));
  const users = await User.find({ _id: op({ $in: unique }) }, { username: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), u.username]));
}

const FAILED_LOGIN_ACTIONS = [
  'auth.login.failure',
  'auth.mfa.webauthn.failure',
  'auth.mfa.email.failure',
  'auth.mfa.email.exhausted',
  'auth.stepup.failed',
  'auth.account.locked',
];

export async function failedLoginsReport(from: string, to: string): Promise<Report> {
  const filter: Record<string, unknown> = {
    action: op({ $in: FAILED_LOGIN_ACTIONS }),
    timestamp: op(dateRange(from, to) ?? {}),
  };
  const entries = await AuditLog.find(filter)
    .sort({ timestamp: -1 })
    .limit(MAX_EXPORT_ROWS)
    .lean();
  return {
    name: 'intentos_fallidos',
    columns: [
      { key: 'timestamp', header: 'fecha_utc' },
      { key: 'username', header: 'usuario' },
      { key: 'action', header: 'evento' },
      { key: 'reason', header: 'motivo' },
      { key: 'ip', header: 'ip' },
      { key: 'userAgent', header: 'user_agent' },
    ],
    rows: entries.map((e) => ({
      timestamp: e.timestamp,
      username: e.actor.username,
      action: e.action,
      reason: (e.details as { reason?: string }).reason ?? (e.action === 'auth.account.locked' ? 'bloqueo' : ''),
      ip: e.ip,
      userAgent: e.userAgent,
    })),
  };
}

export async function usersRolesReport(): Promise<Report> {
  const users = await User.find({}).sort({ role: 1, username: 1 }).lean();
  const credentials = await WebAuthnCredential.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { revokedAt: null } },
    { $group: { _id: '$userId', count: { $sum: 1 } } },
  ]);
  const credentialCount = new Map(credentials.map((c) => [String(c._id), c.count]));
  const roleChanges = await AuditLog.aggregate<{ _id: string; timestamp: Date; by: string | null }>([
    { $match: { action: 'user.role.changed', result: 'success' } },
    { $sort: { seq: -1 } },
    { $group: { _id: '$entityId', timestamp: { $first: '$timestamp' }, by: { $first: '$actor.username' } } },
  ]);
  const lastChange = new Map(roleChanges.map((r) => [r._id, r]));
  const now = Date.now();
  return {
    name: 'usuarios_roles',
    columns: [
      { key: 'username', header: 'usuario' },
      { key: 'fullName', header: 'nombre' },
      { key: 'email', header: 'correo' },
      { key: 'role', header: 'rol' },
      { key: 'status', header: 'estado' },
      { key: 'locked', header: 'bloqueado' },
      { key: 'webauthnCount', header: 'huellas_activas' },
      { key: 'lastLoginAt', header: 'ultimo_acceso_utc' },
      { key: 'lastRoleChangeAt', header: 'ultimo_cambio_rol_utc' },
      { key: 'lastRoleChangeBy', header: 'cambio_rol_por' },
    ],
    rows: users.map((u) => {
      const change = lastChange.get(String(u._id));
      return {
        username: u.username,
        fullName: u.fullName,
        email: maskEmail(u.email),
        role: u.role,
        status: u.status,
        locked: u.lockedUntil ? u.lockedUntil.getTime() > now : false,
        webauthnCount: credentialCount.get(String(u._id)) ?? 0,
        lastLoginAt: u.lastLoginAt,
        lastRoleChangeAt: change?.timestamp ?? null,
        lastRoleChangeBy: change?.by ?? null,
      };
    }),
  };
}

export async function voidsReport(from: string, to: string): Promise<Report> {
  const sales = await Sale.find({ status: 'voided', 'void.voidedAt': op(dateRange(from, to) ?? {}) })
    .sort({ 'void.voidedAt': -1 })
    .limit(MAX_EXPORT_ROWS)
    .lean();
  const names = await usernames(sales.flatMap((s) => [s.cashierId, s.void?.voidedBy]));
  return {
    name: 'anulaciones',
    columns: [
      { key: 'saleNumber', header: 'venta' },
      { key: 'createdAt', header: 'fecha_venta_utc' },
      { key: 'totalQ', header: 'total_q' },
      { key: 'cashier', header: 'cajero' },
      { key: 'voidedBy', header: 'anulada_por' },
      { key: 'voidedAt', header: 'fecha_anulacion_utc' },
      { key: 'reason', header: 'motivo' },
      { key: 'stepUpMethod', header: 'segundo_factor' },
    ],
    rows: sales.map((s) => ({
      saleNumber: s.saleNumber,
      createdAt: s.createdAt,
      totalQ: (s.totalCents / 100).toFixed(2),
      cashier: names.get(String(s.cashierId)) ?? '',
      voidedBy: s.void ? (names.get(String(s.void.voidedBy)) ?? '') : '',
      voidedAt: s.void?.voidedAt ?? null,
      reason: s.void?.reason ?? '',
      stepUpMethod: s.void?.stepUpMethod ?? '',
    })),
  };
}

async function productInfo(ids: Types.ObjectId[]) {
  const products = await Product.find({ _id: op({ $in: ids }) }, { sku: 1, name: 1, isControlled: 1 }).lean();
  return new Map(products.map((p) => [String(p._id), p]));
}

async function lotNumbers(ids: Types.ObjectId[]) {
  const lots = await InventoryLot.find({ _id: op({ $in: ids }) }, { lotNumber: 1 }).lean();
  return new Map(lots.map((l) => [String(l._id), l.lotNumber]));
}

export async function adjustmentsReport(from: string, to: string): Promise<Report> {
  const movements = await InventoryMovement.find({ type: 'adjustment', createdAt: op(dateRange(from, to) ?? {}) })
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORT_ROWS)
    .lean();
  const [products, lots, names] = await Promise.all([
    productInfo(movements.map((m) => m.productId)),
    lotNumbers(movements.map((m) => m.lotId)),
    usernames(movements.map((m) => m.userId)),
  ]);
  return {
    name: 'ajustes_inventario',
    columns: [
      { key: 'createdAt', header: 'fecha_utc' },
      { key: 'sku', header: 'sku' },
      { key: 'product', header: 'producto' },
      { key: 'lot', header: 'lote' },
      { key: 'isControlled', header: 'controlado' },
      { key: 'quantityDelta', header: 'cantidad' },
      { key: 'reasonCode', header: 'codigo_motivo' },
      { key: 'reason', header: 'motivo' },
      { key: 'user', header: 'usuario' },
      { key: 'stepUpMethod', header: 'segundo_factor' },
    ],
    rows: movements.map((m) => {
      const product = products.get(String(m.productId));
      return {
        createdAt: m.createdAt,
        sku: product?.sku ?? '',
        product: product?.name ?? '',
        lot: lots.get(String(m.lotId)) ?? '',
        isControlled: product?.isControlled ?? false,
        quantityDelta: m.quantityDelta,
        reasonCode: m.reasonCode,
        reason: m.reason,
        user: names.get(String(m.userId)) ?? '',
        stepUpMethod: m.stepUpMethod,
      };
    }),
  };
}

/** Pseudonymised: folio, product and pharmacist only — no patient or doctor data (D-17). */
export async function controlledDispensationsReport(from: string, to: string): Promise<Report> {
  const dispensations = await Dispensation.find({
    'items.isControlled': true,
    createdAt: op(dateRange(from, to) ?? {}),
  })
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORT_ROWS)
    .lean();
  const items = dispensations.flatMap((d) => d.items.filter((i) => i.isControlled).map((i) => ({ d, i })));
  const [products, lots, names, prescriptions] = await Promise.all([
    productInfo(items.map(({ i }) => i.productId)),
    lotNumbers(items.map(({ i }) => i.lotId)),
    usernames(dispensations.map((d) => d.pharmacistId)),
    Prescription.find({ _id: op({ $in: dispensations.map((d) => d.prescriptionId) }) }, { folio: 1 }).lean(),
  ]);
  const folios = new Map(prescriptions.map((p) => [String(p._id), p.folio]));
  return {
    name: 'despachos_controlados',
    columns: [
      { key: 'createdAt', header: 'fecha_utc' },
      { key: 'folio', header: 'folio_receta' },
      { key: 'sku', header: 'sku' },
      { key: 'product', header: 'producto' },
      { key: 'lot', header: 'lote' },
      { key: 'quantity', header: 'cantidad' },
      { key: 'pharmacist', header: 'regente' },
      { key: 'stepUpMethod', header: 'segundo_factor' },
    ],
    rows: items.map(({ d, i }) => ({
      createdAt: d.createdAt,
      folio: folios.get(String(d.prescriptionId)) ?? '',
      sku: products.get(String(i.productId))?.sku ?? '',
      product: products.get(String(i.productId))?.name ?? '',
      lot: lots.get(String(i.lotId)) ?? '',
      quantity: i.quantity,
      pharmacist: names.get(String(d.pharmacistId)) ?? '',
      stepUpMethod: d.stepUpMethod,
    })),
  };
}
