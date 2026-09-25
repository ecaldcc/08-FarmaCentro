import mongoose from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { Counter } from '../models/Counter.js';
import { Customer } from '../models/Customer.js';
import { Dispensation } from '../models/Dispensation.js';
import { EmailOtp } from '../models/EmailOtp.js';
import { InventoryLot } from '../models/InventoryLot.js';
import { InventoryMovement } from '../models/InventoryMovement.js';
import { LoyaltyTransaction } from '../models/LoyaltyTransaction.js';
import { Prescription } from '../models/Prescription.js';
import { Product } from '../models/Product.js';
import { Sale } from '../models/Sale.js';
import { User } from '../models/User.js';
import { WebAuthnCredential } from '../models/WebAuthnCredential.js';

export const MODELS = [
  User,
  WebAuthnCredential,
  EmailOtp,
  Product,
  InventoryLot,
  InventoryMovement,
  Sale,
  Customer,
  LoyaltyTransaction,
  Prescription,
  Dispensation,
  Counter,
  AuditLog,
] as const;

export const SESSIONS_COLLECTION = 'sessions';

/**
 * Privileges of the custom MongoDB role used by the API (docs/modelo-datos.md §6).
 * Single source of truth for scripts/setup-db.ts, scripts/check-db-privileges.ts and the tests.
 * No collection gets createIndex, dropCollection or collMod; only sessions gets remove.
 */
export const API_ROLE_PRIVILEGES: Readonly<Record<string, readonly string[]>> = {
  users: ['find', 'insert', 'update'],
  webauthn_credentials: ['find', 'insert', 'update'],
  email_otps: ['find', 'insert', 'update'],
  sessions: ['find', 'insert', 'update', 'remove'],
  products: ['find', 'insert', 'update'],
  inventory_lots: ['find', 'insert', 'update'],
  inventory_movements: ['find', 'insert'],
  sales: ['find', 'insert', 'update'],
  customers: ['find', 'insert', 'update'],
  loyalty_transactions: ['find', 'insert'],
  prescriptions: ['find', 'insert', 'update'],
  dispensations: ['find', 'insert'],
  counters: ['find', 'insert', 'update'],
  audit_logs: ['find', 'insert'],
};

/** Read-only role for the independent auditor group (decision D-11). */
export const AUDIT_READER_PRIVILEGES: Readonly<Record<string, readonly string[]>> = {
  audit_logs: ['find'],
};

/**
 * Creates every collection and index. Must run with a privileged user (farmacentro_migrator),
 * never with the API user, which lacks createIndex.
 */
export async function ensureSchema(connection: mongoose.Connection = mongoose.connection): Promise<void> {
  const db = connection.db;
  if (!db) {
    throw new Error('Database connection is not ready');
  }
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));

  for (const model of MODELS) {
    if (!existing.has(model.collection.collectionName)) {
      await db.createCollection(model.collection.collectionName);
    }
    await model.createIndexes();
  }

  if (!existing.has(SESSIONS_COLLECTION)) {
    await db.createCollection(SESSIONS_COLLECTION);
  }
  // connect-mongo runs with autoRemove 'disabled': the TTL index is created here instead.
  await db.collection(SESSIONS_COLLECTION).createIndex({ expires: 1 }, { expireAfterSeconds: 0, name: 'expires_ttl' });
}
