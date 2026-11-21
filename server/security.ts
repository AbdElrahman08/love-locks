import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string | Buffer, salt: Buffer, len: number) => Promise<Buffer>;

/** Unpredictable URL-safe token (256 bits). */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Short random id for database rows (not used as an authorization secret). */
export function newId(): string {
  return randomBytes(12).toString('base64url');
}

export function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

/**
 * Hash a secret (password or puzzle answer). The pepper is an HMAC key kept outside the
 * database, so a leaked database alone cannot be used to brute-force short PINs offline.
 */
export async function hashSecret(secret: string, pepper: string): Promise<string> {
  const salt = randomBytes(16);
  const peppered = createHmac('sha256', pepper).update(secret).digest();
  const hash = await scrypt(peppered, salt, 32);
  return `s1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifySecret(secret: string, stored: string, pepper: string): Promise<boolean> {
  const [v, saltB64, hashB64] = stored.split('$');
  if (v !== 's1' || !saltB64 || !hashB64) return false;
  const peppered = createHmac('sha256', pepper).update(secret).digest();
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = await scrypt(peppered, Buffer.from(saltB64, 'base64url'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** In-memory fixed-window limiter for cheap, abuse-prone endpoints (guest creation, API burst). */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private limit: number;
  private windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Returns 0 when allowed, otherwise seconds until the window resets. */
  take(key: string, now = Date.now()): number {
    const e = this.hits.get(key);
    if (!e || e.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 50_000) this.sweep(now);
      return 0;
    }
    if (e.count >= this.limit) return Math.ceil((e.resetAt - now) / 1000);
    e.count++;
    return 0;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
