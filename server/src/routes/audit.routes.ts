import { Router } from 'express';
import * as audit from '../controllers/audit.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { AuditExportQuery, AuditLogsQuery, ReportFormatQuery, ReportRangeQuery } from '../validation/audit.schemas.js';

// The audit log is read-only for everybody: there is no route that modifies or deletes it.
export const auditRouter = Router();
auditRouter.use(requireAuth(), requireRole('auditor'));
auditRouter.get('/logs', validate({ query: AuditLogsQuery }), audit.listLogs);
auditRouter.get('/logs/export', validate({ query: AuditExportQuery }), audit.exportLogs);
auditRouter.get('/verify', validate({}), audit.verify);

export const reportsRouter = Router();
reportsRouter.use(requireAuth());
reportsRouter.get('/failed-logins', requireRole('auditor'), validate({ query: ReportRangeQuery }), audit.failedLogins);
reportsRouter.get('/users-roles', requireRole('admin', 'auditor'), validate({ query: ReportFormatQuery }), audit.usersRoles);
reportsRouter.get('/voids', requireRole('regente', 'auditor'), validate({ query: ReportRangeQuery }), audit.voids);
reportsRouter.get(
  '/adjustments',
  requireRole('regente', 'bodeguero', 'auditor'),
  validate({ query: ReportRangeQuery }),
  audit.adjustments,
);
reportsRouter.get(
  '/controlled-dispensations',
  requireRole('regente', 'auditor'),
  validate({ query: ReportRangeQuery }),
  audit.controlledDispensations,
);
