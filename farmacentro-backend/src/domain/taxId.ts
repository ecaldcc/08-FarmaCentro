/**
 * Guatemalan tax identifiers used on receipts: NIT (tax number, check digit 0-9 or K) and
 * CUI/DPI (13-digit personal identification code).
 */
export type TaxIdType = 'NIT' | 'CUI';

/** From Q2,500.00 a receipt must identify the buyer with NIT or DPI (SAT). */
export const BILLING_ID_THRESHOLD_CENTS = 250_000;

export function normalizeTaxId(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

/** NIT: body digits + check digit; check = (11 − Σ digit·weight mod 11) mod 11, 10 → "K". */
export function isValidNit(nit: string): boolean {
  if (!/^\d{1,12}[\dK]$/.test(nit)) return false;
  const body = nit.slice(0, -1);
  const check = nit.slice(-1);
  let weight = body.length + 1;
  let total = 0;
  for (const digit of body) {
    total += Number(digit) * weight;
    weight -= 1;
  }
  const mod = (11 - (total % 11)) % 11;
  return (mod === 10 ? 'K' : String(mod)) === check;
}

/**
 * CUI (DPI): 8 digits + check digit + department (01–22) + municipality (≥ 01).
 * Check digit = Σ digit[i]·(i + 2) mod 11 over the first 8 digits.
 */
export function isValidCui(cui: string): boolean {
  if (!/^\d{13}$/.test(cui)) return false;
  let total = 0;
  for (let i = 0; i < 8; i += 1) {
    total += Number(cui[i]) * (i + 2);
  }
  const department = Number(cui.slice(9, 11));
  const municipality = Number(cui.slice(11, 13));
  return total % 11 === Number(cui[8]) && department >= 1 && department <= 22 && municipality >= 1;
}

/** What is printed on the receipt: full NIT (as on an invoice), masked DPI. */
export function displayTaxId(type: TaxIdType, taxId: string): string {
  return type === 'NIT' ? `${taxId.slice(0, -1)}-${taxId.slice(-1)}` : `XXXX XXXXX ${taxId.slice(-4)}`;
}
