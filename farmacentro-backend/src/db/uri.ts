/**
 * Atlas "Connect → Drivers" strings usually have no database (…mongodb.net/?retryWrites=…).
 * Without one, the driver would use "test": this puts `farmacentro` in the path when it is missing.
 */
export function withDefaultDb(uri: string, db = 'farmacentro'): string {
  const value = uri.trim();
  const schemeEnd = value.indexOf('://');
  if (schemeEnd < 0) return value;
  const queryStart = value.indexOf('?', schemeEnd);
  const base = queryStart >= 0 ? value.slice(0, queryStart) : value;
  const query = queryStart >= 0 ? value.slice(queryStart) : '';
  const slash = base.indexOf('/', schemeEnd + 3);
  const hosts = slash >= 0 ? base.slice(0, slash) : base;
  const path = slash >= 0 ? base.slice(slash) : '';
  return `${hosts}${path && path !== '/' ? path : `/${db}`}${query}`;
}
