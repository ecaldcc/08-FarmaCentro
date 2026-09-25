/** Client-side checks for immediate feedback; the API validates again (it is the authority). */

export type BillingType = 'CF' | 'NIT' | 'CUI';

/** From Q2,500.00 the receipt must identify the buyer with NIT or DPI (SAT). */
export const BILLING_ID_THRESHOLD_CENTS = 250_000;

export function normalizeTaxId(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidNit(nit: string): boolean {
  if (!/^\d{1,12}[\dK]$/.test(nit)) return false;
  const body = nit.slice(0, -1);
  let weight = body.length + 1;
  let total = 0;
  for (const digit of body) {
    total += Number(digit) * weight;
    weight -= 1;
  }
  const mod = (11 - (total % 11)) % 11;
  return (mod === 10 ? 'K' : String(mod)) === nit.slice(-1);
}

export function isValidCui(cui: string): boolean {
  if (!/^\d{13}$/.test(cui)) return false;
  let total = 0;
  for (let i = 0; i < 8; i += 1) total += Number(cui[i]) * (i + 2);
  const department = Number(cui.slice(9, 11));
  return total % 11 === Number(cui[8]) && department >= 1 && department <= 22 && Number(cui.slice(11, 13)) >= 1;
}

export function isValidTaxId(type: 'NIT' | 'CUI', value: string): boolean {
  const normalized = normalizeTaxId(value);
  return type === 'NIT' ? isValidNit(normalized) : isValidCui(normalized);
}

export const BILLING_LABELS: Record<BillingType, string> = {
  CF: 'Consumidor final (CF)',
  NIT: 'NIT',
  CUI: 'DPI',
};
