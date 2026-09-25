import type { Request, Response } from 'express';
import { input } from '../middlewares/validate.js';
import { appendAudit, verifyAuditChain } from '../services/audit.service.js';
import { toCsv } from '../services/csv.service.js';
import * as reports from '../services/report.service.js';
import { Errors } from '../utils/httpError.js';
import { auditContext } from '../utils/requestContext.js';
import type {
  AuditExportInput,
  AuditLogsInput,
  ReportFormatInput,
  ReportRangeInput,
} from '../validation/audit.schemas.js';

function sendCsv(res: Response, filename: string, report: reports.Report): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send(toCsv(report.columns, report.rows));
}

export async function listLogs(req: Request, res: Response): Promise<void> {
  const { query } = input<unknown, AuditLogsInput>(req);
  const result = await reports.listAuditLogs(query);
  const { page, pageSize, ...filters } = query;
  await appendAudit(auditContext(req), {
    action: 'audit.viewed',
    result: 'success',
    entity: 'audit_log',
    details: { filters, page, rows: result.items.length },
  });
  res.json(result);
}

export async function exportLogs(req: Request, res: Response): Promise<void> {
  const { query } = input<unknown, AuditExportInput>(req);
  const report = await reports.exportAuditLogs(query);
  await appendAudit(auditContext(req), {
    action: 'audit.exported',
    result: 'success',
    entity: 'audit_log',
    details: { filters: query, rows: report.rows.length, format: 'csv' },
  });
  sendCsv(res, `bitacora_${query.from ?? 'inicio'}_${query.to ?? 'hoy'}`, report);
}

export async function verify(req: Request, res: Response): Promise<void> {
  const result = await verifyAuditChain();
  await appendAudit(auditContext(req), {
    action: 'audit.verified',
    result: result.ok ? 'success' : 'failure',
    entity: 'audit_log',
    details: {
      ok: result.ok,
      checked: result.checked,
      lastSeq: result.lastSeq,
      brokenAtSeq: result.brokenAtSeq ?? null,
      reason: result.reason ?? null,
    },
  });
  res.json(result);
}

/** Only the Auditor exports reports to CSV (roles-permisos.md §3.7). */
async function respondReport(
  req: Request,
  res: Response,
  report: reports.Report,
  format: 'json' | 'csv',
  filters: { from?: string; to?: string },
) {
  if (format === 'csv' && req.user?.role !== 'auditor') {
    await appendAudit(auditContext(req), {
      action: 'authz.denied',
      result: 'denied',
      entity: 'report',
      details: { report: report.name, format },
    });
    throw Errors.forbidden();
  }
  await appendAudit(auditContext(req), {
    action: format === 'csv' ? 'report.exported' : 'report.viewed',
    result: 'success',
    entity: 'report',
    entityId: report.name,
    details: { filters, rows: report.rows.length, format },
  });
  if (format === 'csv') {
    const range = filters.from && filters.to ? `_${filters.from}_${filters.to}` : '';
    sendCsv(res, `${report.name}${range}`, report);
    return;
  }
  res.json({ name: report.name, columns: report.columns, rows: report.rows });
}

function rangeReport(build: (from: string, to: string) => Promise<reports.Report>) {
  return async (req: Request, res: Response): Promise<void> => {
    const { query } = input<unknown, ReportRangeInput>(req);
    await respondReport(req, res, await build(query.from, query.to), query.format, { from: query.from, to: query.to });
  };
}

export const failedLogins = rangeReport(reports.failedLoginsReport);
export const voids = rangeReport(reports.voidsReport);
export const adjustments = rangeReport(reports.adjustmentsReport);
export const controlledDispensations = rangeReport(reports.controlledDispensationsReport);

export async function usersRoles(req: Request, res: Response): Promise<void> {
  const { query } = input<unknown, ReportFormatInput>(req);
  await respondReport(req, res, await reports.usersRolesReport(), query.format, {});
}
