import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openDb } from '../server/db.ts';
import { createApi } from '../server/app.ts';

let server: Server;
let base = '';
let clock = new Date('2026-11-21T12:00:00Z');
const advance = (ms: number) => { clock = new Date(clock.getTime() + ms); };

beforeAll(async () => {
  const db = openDb(':memory:');
  const api = createApi({ db, pepper: 'test-pepper', adminEmails: ['mod@example.com'], now: () => clock, guestsPerHour: 1000 });
  server = createServer(async (req, res) => { if (!(await api(req, res))) { res.statusCode = 404; res.end(); } });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}
async function guest() {
  const r = await call('POST', '/api/auth/guest');
  expect(r.status).toBe(200);
  return r.json.token as string;
}

const baseLock = {
  shape: 'heart', material: 'gold', color: '#d9607d', engraving: 'A + M', engravingStyle: 'serif',
  decoration: 'hearts', effect: 'glow', lockDate: '2026-02-14', title: 'Our first winter', category: 'love',
  story: 'We met on a rainy Tuesday under the lamps of the Pont des Arts. You laughed at my umbrella. I have kept that laugh ever since.',
  signature: 'Your A',
};

describe('Journey A — create a lock', () => {
  it('validates input and rejects bad locks', async () => {
    const t = await guest();
    const r = await call('POST', '/api/locks', t, { ...baseLock, engraving: '', puzzle: { type: 'pin', pin: '12' }, visibility: 'public' });
    expect(r.status).toBe(400);
    expect(r.json.details.engraving).toBeTruthy();
    expect(r.json.details['puzzle.pin']).toBeTruthy();
  });

  it('creates a public lock with a slot, share link and XP, and it appears on the bridge', async () => {
    const t = await guest();
    const r = await call('POST', '/api/locks', t, { ...baseLock, visibility: 'public', puzzle: { type: 'pin', pin: '1402' } });
    expect(r.status).toBe(200);
    expect(r.json.lock.slot).toBeGreaterThanOrEqual(0);
    expect(r.json.invitation.path).toMatch(/^\/i\/[A-Za-z0-9_-]{40,}$/);
    expect(r.json.xpAwarded).toBe(50);
    expect(r.json.newAchievements).toContain('first_lock');
    expect(JSON.stringify(r.json)).not.toContain('rainy Tuesday');
    const bridge = await call('GET', '/api/bridge', await guest());
    expect(bridge.json.find((l: any) => l.id === r.json.lock.id)?.slot).toBe(r.json.lock.slot);
  });

  it('gates high-level materials behind progression', async () => {
    const t = await guest();
    const r = await call('POST', '/api/locks', t, { ...baseLock, material: 'crystal', visibility: 'public', puzzle: { type: 'pin', pin: '1402' } });
    expect(r.status).toBe(403);
  });
});

describe('Journey B — unlock via invitation', () => {
  it('reveals the story only after the correct answer and records the unlock', async () => {
    const owner = await guest();
    const created = await call('POST', '/api/locks', owner, {
      ...baseLock, visibility: 'invite_only',
      puzzle: { type: 'riddle', question: 'Where did we first meet?', answers: ['Pont des Arts', 'the bridge'], hints: ['It is in Paris'] },
    });
    expect(created.status).toBe(200);
    const token = created.json.invitation.token;

    const visitor = await guest();
    const view = await call('GET', `/api/invitations/${token}`, visitor);
    expect(view.status).toBe(200);
    expect(view.json.puzzle.question).toBe('Where did we first meet?');
    expect(view.json.canAttempt).toBe(true);
    const raw = JSON.stringify(view.json);
    expect(raw).not.toContain('rainy Tuesday');
    expect(raw).not.toMatch(/pont des arts/i);
    expect(raw).not.toContain('hashes');

    const hint = await call('POST', '/api/hint', visitor, { token, index: 0 });
    expect(hint.json.hint).toBe('It is in Paris');

    // Case/accent/punctuation-insensitive riddle answer.
    const ok = await call('POST', '/api/unlock', visitor, { token, answer: '  PONT dès ARTS!! ' });
    expect(ok.status).toBe(200);
    expect(ok.json.success).toBe(true);
    expect(ok.json.story.body).toContain('rainy Tuesday');
    expect(ok.json.xpAwarded).toBe(30);

    const again = await call('GET', `/api/locks/${created.json.lock.id}/story`, visitor);
    expect(again.status).toBe(200);
    const mine = await call('GET', '/api/me/unlocked', visitor);
    expect(mine.json.map((l: any) => l.id)).toContain(created.json.lock.id);

    // Single-use invitation is now consumed for other people.
    const third = await guest();
    const used = await call('POST', '/api/unlock', third, { token, answer: 'pont des arts' });
    expect(used.status).toBe(410);

    // Owner sees use count on the invitation.
    const invs = await call('GET', `/api/locks/${created.json.lock.id}/invitations`, owner);
    expect(invs.json[0].useCount).toBe(1);
  });
});

describe('Journey C — invalid attempts', () => {
  it('keeps the story protected, tracks attempts and rate limits', async () => {
    const owner = await guest();
    const created = await call('POST', '/api/locks', owner, { ...baseLock, visibility: 'public', puzzle: { type: 'pin', pin: '7391', maxAttempts: 6 } });
    const id = created.json.lock.id;
    const v = await guest();

    const malformed = await call('POST', '/api/unlock', v, { lockId: id, answer: '12' });
    expect(malformed.status).toBe(400);

    for (let i = 0; i < 5; i++) {
      const r = await call('POST', '/api/unlock', v, { lockId: id, answer: String(1000 + i) });
      expect(r.status).toBe(200);
      expect(r.json.success).toBe(false);
      expect(r.json.story).toBeUndefined();
      expect(r.json.attemptsRemaining).toBe(6 - (i + 1));
    }
    // Burst limit: 5 failures in 10 minutes.
    const burst = await call('POST', '/api/unlock', v, { lockId: id, answer: '7391' });
    expect(burst.status).toBe(429);
    expect(burst.json.story).toBeUndefined();

    advance(11 * 60_000);
    await call('POST', '/api/unlock', v, { lockId: id, answer: '0000' }); // 6th failure => daily budget exhausted
    const exhausted = await call('POST', '/api/unlock', v, { lockId: id, answer: '7391' });
    expect(exhausted.status).toBe(429);
    expect(exhausted.json.retryAfterSeconds).toBeGreaterThan(0);

    const story = await call('GET', `/api/locks/${id}/story`, v);
    expect(story.status).toBe(403);

    const ownLocks = await call('GET', '/api/me/locks', owner);
    expect(ownLocks.json[0].attemptCount).toBe(6);

    advance(25 * 3600_000);
    const later = await call('POST', '/api/unlock', v, { lockId: id, answer: '7391' });
    expect(later.json.success).toBe(true);
  });
});

describe('Journey D — unauthorized access', () => {
  it('denies access to private, unlisted and other users’ content', async () => {
    const owner = await guest();
    const priv = await call('POST', '/api/locks', owner, { ...baseLock, visibility: 'private', puzzle: { type: 'pin', pin: '1111' } });
    const unlisted = await call('POST', '/api/locks', owner, { ...baseLock, visibility: 'unlisted', puzzle: { type: 'pin', pin: '2222' } });
    expect(priv.json.invitation).toBeNull();
    const attacker = await guest();

    expect((await call('GET', `/api/locks/${priv.json.lock.id}`, attacker)).status).toBe(404);
    expect((await call('GET', `/api/locks/${priv.json.lock.id}/story`, attacker)).status).toBe(403);
    expect((await call('POST', '/api/unlock', attacker, { lockId: priv.json.lock.id, answer: '1111' })).status).toBe(404);
    const bridge = await call('GET', '/api/bridge', attacker);
    expect(bridge.json.some((l: any) => l.id === priv.json.lock.id)).toBe(false);

    // Unlisted: on the bridge, but needs the link.
    expect(bridge.json.some((l: any) => l.id === unlisted.json.lock.id)).toBe(true);
    expect((await call('GET', `/api/locks/${unlisted.json.lock.id}`, attacker)).status).toBe(403);
    expect((await call('POST', '/api/unlock', attacker, { lockId: unlisted.json.lock.id, answer: '2222' })).status).toBe(403);

    // Cannot modify or delete someone else's lock.
    expect((await call('PATCH', `/api/locks/${unlisted.json.lock.id}`, attacker, { engraving: 'pwned' })).status).toBe(404);
    expect((await call('DELETE', `/api/locks/${unlisted.json.lock.id}`, attacker)).status).toBe(404);
    expect((await call('GET', `/api/locks/${unlisted.json.lock.id}/invitations`, attacker)).status).toBe(404);

    // Forged / guessed tokens fail.
    expect((await call('GET', `/api/invitations/${'A'.repeat(43)}`, attacker)).status).toBe(404);
    expect((await call('GET', `/api/invitations/${unlisted.json.lock.id}`, attacker)).status).toBe(404);

    // No session => no story, no unlock.
    expect((await call('POST', '/api/unlock', undefined, { lockId: unlisted.json.lock.id, answer: '2222' })).status).toBe(401);

    // Admin endpoints are closed to regular users.
    expect((await call('GET', '/api/admin/reports', attacker)).status).toBe(403);

    // Revoked invitations stop working.
    const invs = await call('GET', `/api/locks/${unlisted.json.lock.id}/invitations`, owner);
    await call('DELETE', `/api/invitations/${invs.json[0].id}`, owner);
    expect((await call('GET', `/api/invitations/${unlisted.json.invitation.token}`, attacker)).status).toBe(404);
  });

  it('never returns puzzle secrets from any listing', async () => {
    const owner = await guest();
    await call('POST', '/api/locks', owner, { ...baseLock, visibility: 'public', puzzle: { type: 'riddle', question: 'Color?', answers: ['vermilion'] } });
    const v = await guest();
    for (const path of ['/api/locks?sort=recent', '/api/locks?sort=featured', '/api/bridge']) {
      const body = JSON.stringify((await call('GET', path, v)).json);
      expect(body).not.toMatch(/vermilion|s1\$|secret|rainy Tuesday/);
    }
  });
});

describe('accounts, moderation and anti-farming', () => {
  it('upgrades a guest to an account keeping their locks', async () => {
    const t = await guest();
    await call('POST', '/api/locks', t, { ...baseLock, visibility: 'public', puzzle: { type: 'pin', pin: '1234' } });
    const reg = await call('POST', '/api/auth/register', t, { email: 'amer@example.com', password: 'correct horse', displayName: 'Amer' });
    expect(reg.status).toBe(200);
    expect(reg.json.upgradedGuest).toBe(true);
    const me = await call('GET', '/api/me', reg.json.token);
    expect(me.json.profile.isGuest).toBe(false);
    expect(me.json.stats.locksCreated).toBe(1);
    const bad = await call('POST', '/api/auth/login', undefined, { email: 'amer@example.com', password: 'nope-nope' });
    expect(bad.status).toBe(401);
    const good = await call('POST', '/api/auth/login', undefined, { email: 'amer@example.com', password: 'correct horse' });
    expect(good.status).toBe(200);
  });

  it('auto-hides a lock after 3 distinct reports and lets a moderator restore it', async () => {
    const owner = await guest();
    const c = await call('POST', '/api/locks', owner, { ...baseLock, visibility: 'public', puzzle: { type: 'pin', pin: '1234' } });
    const id = c.json.lock.id;
    for (let i = 0; i < 3; i++) await call('POST', `/api/locks/${id}/report`, await guest(), { reason: 'spam' });
    expect((await call('GET', `/api/locks/${id}`, await guest())).status).toBe(404);
    const mod = await call('POST', '/api/auth/register', undefined, { email: 'mod@example.com', password: 'moderator!', displayName: 'Mod' });
    const reports = await call('GET', '/api/admin/reports', mod.json.token);
    expect(reports.json.find((r: any) => r.lockId === id)?.reports).toBe(3);
    await call('POST', `/api/admin/locks/${id}/moderate`, mod.json.token, { action: 'restore' });
    expect((await call('GET', `/api/locks/${id}`, await guest())).status).toBe(200);
  });

  it('blocking hides a creator’s locks', async () => {
    const owner = await guest();
    const c = await call('POST', '/api/locks', owner, { ...baseLock, visibility: 'public', puzzle: { type: 'pin', pin: '1234' } });
    const me = await guest();
    await call('POST', `/api/locks/${c.json.lock.id}/block-owner`, me);
    const bridge = await call('GET', '/api/bridge', me);
    expect(bridge.json.some((l: any) => l.id === c.json.lock.id)).toBe(false);
  });

  it('does not award XP twice for the same lock inspection', async () => {
    const owner = await guest();
    const c = await call('POST', '/api/locks', owner, { ...baseLock, visibility: 'public', puzzle: { type: 'pin', pin: '1234' } });
    const v = await guest();
    expect((await call('POST', `/api/locks/${c.json.lock.id}/inspect`, v)).json.xpAwarded).toBe(5);
    expect((await call('POST', `/api/locks/${c.json.lock.id}/inspect`, v)).json.xpAwarded).toBe(0);
  });

  it('deletes an account and all its locks', async () => {
    const t = await guest();
    const c = await call('POST', '/api/locks', t, { ...baseLock, visibility: 'public', puzzle: { type: 'pin', pin: '1234' } });
    expect((await call('DELETE', '/api/me', t)).status).toBe(200);
    expect((await call('GET', `/api/locks/${c.json.lock.id}`, await guest())).status).toBe(404);
    expect((await call('GET', '/api/me', t)).status).toBe(401);
  });
});

describe('guest session abuse protection', () => {
  it('limits new guest sessions per network', async () => {
    const api = createApi({ db: openDb(':memory:'), pepper: 'p', guestsPerHour: 2 });
    const s = createServer(async (req, res) => { await api(req, res); });
    await new Promise<void>((r) => s.listen(0, r));
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/auth/guest`;
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await fetch(url, { method: 'POST' })).status);
    await new Promise<void>((r) => s.close(() => r()));
    expect(codes).toEqual([200, 200, 429]);
  });
});
