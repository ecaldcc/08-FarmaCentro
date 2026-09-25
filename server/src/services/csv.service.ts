import { stringify } from 'csv-stringify/sync';

const BOM = String.fromCharCode(0xfeff);
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Neutralises spreadsheet formula injection: a cell that starts with = + - @ tab or CR is
 * prefixed with an apostrophe so Excel/LibreOffice treat it as text.
 */
export function safeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/** CSV with UTF-8 BOM (so Excel shows accents correctly). */
export function toCsv(columns: { key: string; header: string }[], rows: Record<string, unknown>[]): string {
  const data = rows.map((row) => columns.map((c) => safeCell(row[c.key])));
  return `${BOM}${stringify([columns.map((c) => c.header), ...data])}`;
}
