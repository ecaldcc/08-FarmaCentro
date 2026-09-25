import { createHash } from 'node:crypto';
import mongoose, { Types, type ClientSession } from 'mongoose';
import type { AuditAction, AuditResult } from '../domain/auditActions.js';
import { AuditLog, type IAuditActor, type IAuditLog } from '../models/AuditLog.js';
import { canonicalJson } from '../utils/canonicalJson.js';

export const GENESIS_PREV_HASH = '0'.repeat(64);

export interface AuditActorInput {
  userId: string | Types.ObjectId | null;
  username: string | null;
  role: string | null;
}

/** Request-level context: who is acting and from where. */
export interface AuditContext {
  actor: AuditActorInput | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface AuditEventInput {
  action: AuditAction;
  result: AuditResult;
  entity?: string | null;
  entityId?: string | Types.ObjectId | null;
  /** Small, non-sensitive details only: never passwords, codes, health or contact data. */
  details?: Record<string, unknown>;
  /** Overrides the context actor (e.g. the attempted username on a failed login). */
  actor?: AuditActorInput | null;
}

export const SYSTEM_CONTEXT: AuditContext = { actor: null, ip: null, userAgent: null, requestId: null };

// ---------------------------------------------------------------------------------------------
// Chain lock: appends are serialised inside this process (single API instance, decision D-09).
// The unique index on `seq` detects a fork if a second writer ever appears.
// ---------------------------------------------------------------------------------------------
let chainTail: Promise<unknown> = Promise.resolve();

function withChainLock<T>(work: () => Promise<T>): Promise<T> {
  const run = chainTail.then(work, work);
  chainTail = run.catch(() => undefined);
  return run;
}

interface HashInput {
  seq: number;
  timestamp: Date;
  actor: IAuditActor;
  action: string;
  entity: string | null;
  entityId: string | null;
  result: string;
  details: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  prevHash: string;
}

/** Hash algorithm documented in docs/modelo-datos.md §4.14. */
export function computeAuditHash(entry: HashInput): string {
  const canonical = JSON.stringify([
    entry.seq,
    entry.timestamp.toISOString(),
    entry.actor.userId ? String(entry.actor.userId) : null,
    entry.actor.username ?? null,
    entry.actor.role ?? null,
    entry.action,
    entry.entity ?? null,
    entry.entityId ?? null,
    entry.result,
    canonicalJson(entry.details ?? {}),
    entry.ip ?? null,
    entry.userAgent ?? null,
    entry.requestId ?? null,
    entry.prevHash,
  ]);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Converts detail values to plain JSON (ObjectIds and Dates become strings). */
function toPlainJson(details: Record<string, unknown> | undefined): Record<string, unknown> {
  return JSON.parse(JSON.stringify(details ?? {})) as Record<string, unknown>;
}

function buildActor(input: AuditActorInput | null | undefined): IAuditActor {
  return {
    userId: input?.userId ? new Types.ObjectId(String(input.userId)) : null,
    username: input?.username ? input.username.slice(0, 32) : null,
    role: input?.role ?? null,
  };
}

async function insertChained(ctx: AuditContext, events: AuditEventInput[], session?: ClientSession): Promise<void> {
  if (events.length === 0) {
    return;
  }
  const last = await AuditLog.findOne({}, { seq: 1, hash: 1 }, { session }).sort({ seq: -1 }).lean();
  let seq = last ? last.seq + 1 : 0;
  let prevHash = last ? last.hash : GENESIS_PREV_HASH;
  const docs: Omit<IAuditLog, '_id'>[] = [];

  for (const event of events) {
    const entry: HashInput = {
      seq,
      timestamp: new Date(),
      actor: buildActor(event.actor !== undefined ? event.actor : ctx.actor),
      action: event.action,
      entity: event.entity ?? null,
      entityId: event.entityId ? String(event.entityId) : null,
      result: event.result,
      details: toPlainJson(event.details),
      ip: ctx.ip,
      userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 256) : null,
      requestId: ctx.requestId,
      prevHash,
    };
    const hash = computeAuditHash(entry);
    docs.push({ ...entry, action: event.action, result: event.result, hash });
    prevHash = hash;
    seq += 1;
  }
  await AuditLog.create(docs, { session, ordered: true });
}

/** Appends events outside of any business transaction (e.g. failures, reads, logins). */
export function appendAudit(ctx: AuditContext, ...events: AuditEventInput[]): Promise<void> {
  return withChainLock(() => insertChained(ctx, events));
}

export interface AuditedTx {
  session: ClientSession;
  audit: (event: AuditEventInput) => void;
}

/**
 * Runs a MongoDB transaction whose success events are written to audit_logs inside the same
 * transaction: the operation cannot exist without its audit record (docs/arquitectura.md §10).
 */
export function runAuditedTransaction<T>(ctx: AuditContext, work: (tx: AuditedTx) => Promise<T>): Promise<T> {
  return withChainLock(async () => {
    const session = await mongoose.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(
        async () => {
          const events: AuditEventInput[] = [];
          result = await work({ session, audit: (event) => events.push(event) });
          await insertChained(ctx, events, session);
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
      );
      return result as T;
    } finally {
      await session.endSession();
    }
  });
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  lastSeq: number | null;
  lastHash: string | null;
  brokenAtSeq?: number;
  reason?: 'hash' | 'prevHash' | 'gap';
}

/** Walks the whole chain in ascending order and recomputes every hash. */
export async function verifyAuditChain(): Promise<ChainVerification> {
  let expectedSeq = 0;
  let prevHash = GENESIS_PREV_HASH;
  let checked = 0;
  let lastHash: string | null = null;

  const cursor = AuditLog.find({}).sort({ seq: 1 }).lean().cursor();
  for await (const entry of cursor) {
    const lastSeq = checked > 0 ? expectedSeq - 1 : null;
    if (entry.seq !== expectedSeq) {
      return { ok: false, checked, lastSeq, lastHash, brokenAtSeq: expectedSeq, reason: 'gap' };
    }
    if (entry.prevHash !== prevHash) {
      return { ok: false, checked, lastSeq, lastHash, brokenAtSeq: entry.seq, reason: 'prevHash' };
    }
    const recomputed = computeAuditHash({
      seq: entry.seq,
      timestamp: new Date(entry.timestamp),
      actor: entry.actor,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      result: entry.result,
      details: entry.details ?? {},
      ip: entry.ip,
      userAgent: entry.userAgent,
      requestId: entry.requestId,
      prevHash: entry.prevHash,
    });
    if (recomputed !== entry.hash) {
      return { ok: false, checked, lastSeq, lastHash, brokenAtSeq: entry.seq, reason: 'hash' };
    }
    prevHash = entry.hash;
    lastHash = entry.hash;
    checked += 1;
    expectedSeq += 1;
  }
  return { ok: true, checked, lastSeq: checked > 0 ? expectedSeq - 1 : null, lastHash };
}
