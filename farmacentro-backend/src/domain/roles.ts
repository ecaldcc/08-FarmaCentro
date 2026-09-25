export const ROLES = ['admin', 'regente', 'cajero', 'bodeguero', 'auditor'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  regente: 'Regente',
  cajero: 'Cajero',
  bodeguero: 'Bodeguero',
  auditor: 'Auditor',
};

/**
 * UI permissions per role (docs/roles-permisos.md). The client only uses them to hide options;
 * every route enforces its own requireRole() in the backend.
 */
export const PERMISSIONS: Record<Role, readonly string[]> = {
  admin: ['users.manage', 'reports.usersRoles'],
  regente: [
    'pos.sell',
    'sales.viewAll',
    'sales.void',
    'customers.manage',
    'customers.withdrawConsent',
    'prescriptions.manage',
    'inventory.view',
    'inventory.receive',
    'inventory.adjust',
    'inventory.adjustControlled',
    'products.setControlled',
    'reports.voids',
    'reports.adjustments',
    'reports.controlled',
  ],
  cajero: ['pos.sell', 'sales.viewOwn', 'customers.manage'],
  bodeguero: [
    'inventory.view',
    'inventory.receive',
    'inventory.adjust',
    'products.manage',
    'reports.adjustments',
  ],
  auditor: [
    'audit.view',
    'audit.export',
    'reports.failedLogins',
    'reports.usersRoles',
    'reports.voids',
    'reports.adjustments',
    'reports.controlled',
    'reports.export',
  ],
};
