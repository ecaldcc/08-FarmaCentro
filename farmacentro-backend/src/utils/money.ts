const quetzales = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });

/** 250000 → "Q2,500.00" */
export function formatQuetzales(cents: number): string {
  return quetzales.format(cents / 100);
}
