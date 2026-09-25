import { z } from 'zod';
import { IsoDate, ObjectId, Page, Username, withDateRange } from './common.js';

const AuditFilters = {
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  action: z
    .string()
    .regex(/^[a-z_.]{3,60}$/, 'Acción inválida')
    .optional(),
  userId: ObjectId.optional(),
  username: Username.optional(),
  result: z.enum(['success', 'failure', 'denied']).optional(),
  entity: z
    .string()
    .regex(/^[a-z_]{2,30}$/, 'Entidad inválida')
    .optional(),
  entityId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Identificador inválido')
    .optional(),
};

export const AuditLogsQuery = Page.extend(AuditFilters);
export const AuditExportQuery = z.strictObject(AuditFilters);

export const ReportRangeQuery = withDateRange({ format: z.enum(['json', 'csv']).default('json') });
export const ReportFormatQuery = z.strictObject({ format: z.enum(['json', 'csv']).default('json') });

export type AuditLogsInput = z.infer<typeof AuditLogsQuery>;
export type AuditExportInput = z.infer<typeof AuditExportQuery>;
export type ReportRangeInput = { from: string; to: string; format: 'json' | 'csv' };
export type ReportFormatInput = z.infer<typeof ReportFormatQuery>;
