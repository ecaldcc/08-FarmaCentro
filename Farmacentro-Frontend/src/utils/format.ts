const money = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });
const dateTime = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Guatemala',
});
const dateOnly = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: 'America/Guatemala' });

export function formatMoney(cents: number): string {
  return money.format(cents / 100);
}

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateOnly.format(new Date(iso));
}

/** Today's civil date in Guatemala as YYYY-MM-DD. */
export function todayGt(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000 - 6 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

/** Parses "12.50" (quetzales) into cents; returns null when invalid. */
export function parseQuetzales(text: string): number | null {
  const [whole = '', decimals = '', extra] = text.trim().replace(',', '.').split('.');
  if (extra !== undefined || !/^\d{1,9}$/.test(whole) || !/^\d{0,2}$/.test(decimals)) return null;
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
}

export const MOVEMENT_LABELS: Record<string, string> = {
  receipt: 'Entrada',
  sale: 'Venta',
  sale_void: 'Anulación',
  adjustment: 'Ajuste',
  dispensation: 'Despacho con receta',
};

export const ADJUSTMENT_LABELS: Record<string, string> = {
  damaged: 'Producto dañado',
  expired: 'Vencido',
  count_correction: 'Corrección de conteo',
  loss: 'Pérdida o faltante',
  other: 'Otro',
};

export const PRESCRIPTION_STATUS_LABELS: Record<string, string> = {
  registered: 'Registrada',
  partially_dispensed: 'Despacho parcial',
  dispensed: 'Despachada',
  cancelled: 'Anulada',
};

export const METHOD_LABELS: Record<string, string> = {
  webauthn: 'Huella',
  email_otp: 'Código por correo',
  seed: 'Datos de prueba',
};
