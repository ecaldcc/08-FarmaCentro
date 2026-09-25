export const STEP_UP_ACTIONS = [
  'webauthn.register',
  'webauthn.revoke',
  'user.create',
  'user.update',
  'user.role.change',
  'user.status.change',
  'user.unlock',
  'user.password.reset',
  'user.webauthn.revoke',
  'product.controlled.change',
  'inventory.adjust',
  'sale.void',
  'prescription.dispense',
] as const;

export type StepUpAction = (typeof STEP_UP_ACTIONS)[number];

export const STEP_UP_LABELS: Record<StepUpAction, string> = {
  'webauthn.register': 'Registrar una huella',
  'webauthn.revoke': 'Revocar una huella',
  'user.create': 'Crear usuario',
  'user.update': 'Editar usuario',
  'user.role.change': 'Cambiar rol',
  'user.status.change': 'Deshabilitar o habilitar usuario',
  'user.unlock': 'Desbloquear cuenta',
  'user.password.reset': 'Restablecer contraseña',
  'user.webauthn.revoke': 'Revocar huella de un usuario',
  'product.controlled.change': 'Cambiar marca de medicamento controlado',
  'inventory.adjust': 'Ajustar inventario',
  'sale.void': 'Anular venta',
  'prescription.dispense': 'Despachar medicamento controlado',
};
