import { Schema, model, type Types } from 'mongoose';
import { AUDIT_ACTIONS, type AuditAction, type AuditResult } from '../domain/auditActions.js';

export interface IAuditActor {
  userId: Types.ObjectId | null;
  username: string | null;
  role: string | null;
}

export interface IAuditLog {
  _id: Types.ObjectId;
  seq: number;
  timestamp: Date;
  actor: IAuditActor;
  action: AuditAction;
  entity: string | null;
  entityId: string | null;
  result: AuditResult;
  details: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  prevHash: string;
  hash: string;
}

const ActorSchema = new Schema<IAuditActor>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    username: { type: String, default: null },
    role: { type: String, default: null },
  },
  { _id: false, strict: 'throw' },
);

// Insert-only collection: the API database role has only insert/find on audit_logs.
const AuditLogSchema = new Schema<IAuditLog>(
  {
    seq: { type: Number, required: true },
    timestamp: { type: Date, required: true },
    actor: { type: ActorSchema, required: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entity: { type: String, default: null },
    entityId: { type: String, default: null },
    result: { type: String, enum: ['success', 'failure', 'denied'], required: true },
    details: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    requestId: { type: String, default: null },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
  },
  { collection: 'audit_logs', strict: 'throw', versionKey: false, minimize: false },
);

AuditLogSchema.index({ seq: 1 }, { unique: true });
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ 'actor.userId': 1, timestamp: -1 });
AuditLogSchema.index({ result: 1, timestamp: -1 });
AuditLogSchema.index({ entity: 1, entityId: 1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
