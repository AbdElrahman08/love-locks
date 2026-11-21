// Thin client for the Love Locks API. Every visitor gets a guest session on first use (guest-first),
// so invitation recipients can solve a puzzle without registering or installing anything.
import type { ApiError } from '../../shared/types.ts';

const TOKEN_KEY = 'll.session';
let memoryToken: string | null = null;

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) ?? memoryToken; } catch { return memoryToken; }
}
export function setToken(t: string | null) {
  memoryToken = t;
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

export class ApiRequestError extends Error {
  status: number;
  details?: Record<string, string>;
  retryAfterSeconds?: number;
  constructor(status: number, body: ApiError) {
    super(body.error || 'Request failed');
    this.status = status;
    this.details = body.details;
    this.retryAfterSeconds = body.retryAfterSeconds;
  }
}

let guestPromise: Promise<string> | null = null;
async function ensureSession(): Promise<string> {
  const t = getToken();
  if (t) return t;
  guestPromise ??= fetch('/api/auth/guest', { method: 'POST' })
    .then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new ApiRequestError(r.status, body);
      setToken(body.token);
      return body.token as string;
    })
    .finally(() => { guestPromise = null; });
  return guestPromise;
}

export async function api<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const token = await ensureSession();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, { error: 'You appear to be offline. Check your connection and try again.' });
  }
  const data = await res.json().catch(() => ({ error: 'Unexpected server response.' }));
  if (res.status === 401 && retry) {
    setToken(null); // expired or deleted session: start a fresh guest session once
    return api<T>(method, path, body, false);
  }
  if (!res.ok) throw new ApiRequestError(res.status, data);
  return data as T;
}

export const get = <T>(p: string) => api<T>('GET', p);
export const post = <T>(p: string, b?: unknown) => api<T>('POST', p, b ?? {});
export const patch = <T>(p: string, b: unknown) => api<T>('PATCH', p, b);
export const del = <T>(p: string) => api<T>('DELETE', p);

export function inviteUrl(path: string): string {
  const base = (import.meta.env.VITE_PUBLIC_URL as string | undefined) || window.location.origin;
  return base.replace(/\/$/, '') + path;
}
