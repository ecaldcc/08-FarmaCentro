/**
 * Thin fetch wrapper. The session lives in an httpOnly cookie managed by the browser: nothing is
 * ever stored in localStorage/sessionStorage (CLAUDE.md "Autenticación y sesiones").
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get fields(): { path: string; message: string }[] {
    return (this.extra.fields as { path: string; message: string }[] | undefined) ?? [];
  }
}

type SessionListener = (expiresAt: string) => void;
type UnauthorizedListener = () => void;

let onSessionRenewed: SessionListener | null = null;
let onUnauthorized: UnauthorizedListener | null = null;

export function setSessionListeners(renewed: SessionListener | null, unauthorized: UnauthorizedListener | null): void {
  onSessionRenewed = renewed;
  onUnauthorized = unauthorized;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request(method: Method, path: string, body?: unknown): Promise<Response> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (method !== 'GET') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body ?? {});
  }
  const res = await fetch(`/api${path}`, init);
  const expiresAt = res.headers.get('X-Session-Expires-At');
  if (expiresAt) onSessionRenewed?.(expiresAt);
  if (!res.ok) {
    const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json().catch(() => ({})) : {};
    const error = (data as { error?: Record<string, unknown> }).error ?? {};
    const code = typeof error.code === 'string' ? error.code : 'INTERNAL';
    const message = typeof error.message === 'string' ? error.message : 'Ocurrió un error inesperado.';
    if (res.status === 401 && code === 'UNAUTHENTICATED') onUnauthorized?.();
    throw new ApiError(res.status, code, message, error);
  }
  return res;
}

export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await request(method, path, body);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const http = {
  get: <T>(path: string) => api<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => api<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => api<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown = {}) => api<T>('PATCH', path, body),
  delete: <T>(path: string, body: unknown = {}) => api<T>('DELETE', path, body),
};

/** Downloads a CSV export through the authenticated session. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await request('GET', path);
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
