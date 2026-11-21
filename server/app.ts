// Love Locks API. All authorization, puzzle validation, rate limiting and reward logic lives here
// (or, in production on Supabase, in the equivalent SECURITY DEFINER functions). The client is untrusted.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DB } from './db.ts';
import { newId, newToken, sha256, hashSecret, verifySecret, RateLimiter } from './security.ts';
import { buildPuzzle, publicPuzzle, PUZZLE_HANDLERS, type StoredPuzzle } from './puzzles.ts';
import { validateCreateLock, validatePuzzle, cleanText, LIMITS } from '../shared/validation.ts';
import {
  BRIDGE, BRIDGE_SLOTS, CATEGORIES, ENGRAVING_STYLES, REACTIONS, REPORT_REASONS, materialById,
} from '../shared/catalog.ts';
import {
  ACHIEVEMENTS, XP_RULES, challengesForDate, levelFromXp, xpForLevel, type XpReason,
} from '../shared/progression.ts';
import type {
  BridgeLock, ChallengeProgress, LockDetail, LockSummary, MeResponse, OwnLock, Profile, ProfileStats, Story, UnlockResult,
} from '../shared/types.ts';

export interface AppOptions {
  db: DB;
  pepper: string;
  adminEmails?: string[];
  trustProxy?: boolean;
  now?: () => Date;
  /** New guest sessions allowed per IP per hour (abuse protection). */
  guestsPerHour?: number;
}

class HttpError extends Error {
  status: number;
  details?: Record<string, string>;
  retryAfterSeconds?: number;
  constructor(status: number, message: string, details?: Record<string, string>, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  body: any;
  ip: string;
  ipHash: string;
  actor: ActorRow | null;
}

interface ActorRow {
  id: string;
  display_name: string;
  avatar: string;
  is_guest: number;
  email: string | null;
  xp: number;
  show_name_on_locks: number;
  is_admin: number;
  created_at: string;
}

type Handler = (ctx: Ctx) => Promise<unknown> | unknown;

const ANALYTICS_EVENTS = new Set([
  'app_open', 'landing_cta', 'tutorial_start', 'tutorial_complete', 'workshop_open', 'workshop_step',
  'lock_published', 'invite_shared', 'invite_opened', 'puzzle_attempt', 'puzzle_solved', 'story_revealed',
  'register_start', 'register_complete', 'guest_converted', 'report_submitted', 'reaction_added', 'quality_changed',
]);

const SESSION_DAYS = 90;
const DAY = 86_400_000;

export function createApi(opts: AppOptions) {
  const { db, pepper } = opts;
  const now = opts.now ?? (() => new Date());
  const adminEmails = new Set((opts.adminEmails ?? []).map((e) => e.toLowerCase()));
  const nowIso = () => now().toISOString();
  const agoIso = (ms: number) => new Date(now().getTime() - ms).toISOString();
  const todayStart = () => now().toISOString().slice(0, 10) + 'T00:00:00.000Z';

  const guestLimiter = new RateLimiter(opts.guestsPerHour ?? 20, 60 * 60_000);
  const authLimiter = new RateLimiter(10, 15 * 60_000);
  const burstLimiter = new RateLimiter(240, 60_000);
  const unlockIpLimiter = new RateLimiter(40, 60_000);

  // ---------- helpers ----------
  const { one, all, run } = db;
  const count = async (sql: string, ...p: unknown[]) => Number((await one<{ c: number }>(sql, ...p))?.c ?? 0);

  function requireActor(ctx: Ctx): ActorRow {
    if (!ctx.actor) throw new HttpError(401, 'Please start a session first.');
    return ctx.actor;
  }

  function toProfile(a: ActorRow): Profile {
    return {
      id: a.id,
      displayName: a.display_name,
      avatar: a.avatar,
      isGuest: !!a.is_guest,
      email: a.email,
      xp: a.xp,
      level: levelFromXp(a.xp),
      showNameOnLocks: !!a.show_name_on_locks,
      isAdmin: !!a.is_admin,
      createdAt: a.created_at,
    };
  }

  async function createSession(profileId: string): Promise<string> {
    const token = newToken();
    await run('INSERT INTO sessions (token_hash, profile_id, expires_at) VALUES (?, ?, ?)',
      sha256(token), profileId, new Date(now().getTime() + SESSION_DAYS * DAY).toISOString());
    return token;
  }

  async function loadActor(req: IncomingMessage): Promise<ActorRow | null> {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return null;
    const token = h.slice(7).trim();
    if (!token || token.length > 200) return null;
    return await one<ActorRow>(
      `SELECT p.* FROM sessions s JOIN profiles p ON p.id = s.profile_id WHERE s.token_hash = ? AND s.expires_at > ?`,
      sha256(token), nowIso(),
    ) ?? null;
  }

  const LOCK_SELECT = `
    SELECT l.*, p.display_name AS owner_name, p.show_name_on_locks AS show_name,
      (SELECT count(*) FROM unlock_events u WHERE u.lock_id = l.id) AS unlock_count,
      (SELECT json_group_object(reaction, c) FROM (SELECT reaction, count(*) AS c FROM reactions r WHERE r.lock_id = l.id GROUP BY reaction) rc) AS reactions_json,
      EXISTS (SELECT 1 FROM unlock_events u2 WHERE u2.lock_id = l.id AND u2.actor_id = $actor) AS solved_by_me
    FROM locks l JOIN profiles p ON p.id = l.owner_id`;

  function toSummary(r: any, actorId: string | null): LockSummary {
    const expired = r.expires_at && r.expires_at <= nowIso();
    return {
      id: r.id,
      shape: r.shape,
      material: r.material,
      color: r.color,
      engraving: r.engraving,
      engravingStyle: r.engraving_style,
      decoration: r.decoration,
      effect: r.effect,
      lockDate: r.lock_date,
      title: r.title,
      category: r.category,
      visibility: r.visibility,
      slot: r.slot,
      creatorName: r.show_name ? r.owner_name : null,
      creatorId: null,
      createdAt: r.created_at,
      availableAt: r.available_at,
      status: expired ? 'expired' : r.status,
      unlockCount: Number(r.unlock_count ?? 0),
      reactions: !r.reactions_json ? {} : typeof r.reactions_json === 'string' ? JSON.parse(r.reactions_json) : r.reactions_json,
      isOwn: actorId === r.owner_id,
      isDemo: !!r.is_demo,
      solvedByMe: !!r.solved_by_me,
    };
  }

  async function getLockRow(lockId: string, actorId: string | null): Promise<any> {
    return await one(`${LOCK_SELECT} WHERE l.id = $id`, { actor: actorId ?? '', id: lockId });
  }

  async function loadPuzzle(lockId: string): Promise<StoredPuzzle> {
    const p = await one('SELECT * FROM puzzles WHERE lock_id = ?', lockId);
    if (!p) throw new HttpError(500, 'Puzzle missing.');
    return {
      type: p.type,
      publicConfig: JSON.parse(p.public_config),
      secretConfig: JSON.parse(p.secret_config),
      hints: JSON.parse(p.hints),
      maxAttempts: p.max_attempts,
    };
  }

  async function isBlockedBy(actorId: string | null, ownerId: string): Promise<boolean> {
    if (!actorId) return false;
    return !!await one('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?', actorId, ownerId);
  }

  function isLive(row: any): boolean {
    return row.status === 'active' && !(row.expires_at && row.expires_at <= nowIso());
  }

  /** Can this actor see the lock's public metadata (title, engraving, puzzle prompt) without an invitation? */
  function canViewDetails(row: any, actor: ActorRow | null): boolean {
    if (actor && row.owner_id === actor.id) return true;
    if (actor?.is_admin) return true;
    if (!isLive(row)) return false;
    if (row.solved_by_me) return true;
    return row.visibility === 'public' || row.visibility === 'scheduled';
  }

  function scheduledPending(row: any): boolean {
    return row.visibility === 'scheduled' && row.available_at && row.available_at > nowIso();
  }

  async function resolveInvitation(token: unknown) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw new HttpError(404, 'This invitation link is not valid.');
    const inv = await one('SELECT * FROM invitations WHERE token_hash = ?', sha256(token));
    if (!inv || inv.revoked) throw new HttpError(404, 'This invitation link is not valid or was revoked.');
    if (inv.expires_at && inv.expires_at <= nowIso()) throw new HttpError(410, 'This invitation has expired.');
    return inv;
  }

  async function attemptState(row: any, actorId: string, puzzle: StoredPuzzle) {
    const fails24h = (await one<{ c: number; oldest: string | null }>(
      `SELECT count(*) AS c, min(created_at) AS oldest FROM puzzle_attempts WHERE lock_id = ? AND actor_id = ? AND success = 0 AND created_at > ?`,
      row.id, actorId, agoIso(DAY),
    ))!;
    const remaining = Math.max(0, puzzle.maxAttempts - fails24h.c);
    let retryAfter = 0;
    if (remaining === 0 && fails24h.oldest) retryAfter = Math.ceil((new Date(fails24h.oldest).getTime() + DAY - now().getTime()) / 1000);
    return { remaining, retryAfter };
  }

  // ---------- XP, achievements, rewards ----------
  async function computeStats(profileId: string): Promise<ProfileStats> {
    const c = (sql: string) => count(sql, profileId);
    return {
      locksCreated: await c('SELECT count(*) AS c FROM locks WHERE owner_id = ? AND is_demo = 0'),
      locksSolved: await c('SELECT count(*) AS c FROM unlock_events WHERE actor_id = ?'),
      locksInspected: await c('SELECT count(*) AS c FROM lock_inspections WHERE profile_id = ?'),
      storiesWritten: await c('SELECT count(*) AS c FROM locks l JOIN lock_stories s ON s.lock_id = l.id WHERE l.owner_id = ? AND length(s.body) >= 100'),
      challengesCompleted: await c('SELECT count(*) AS c FROM daily_challenge_claims WHERE profile_id = ?'),
    };
  }

  async function checkAchievements(profileId: string): Promise<string[]> {
    const stats = await computeStats(profileId);
    const map: Record<string, number> = {
      locks_created: stats.locksCreated,
      locks_solved: stats.locksSolved,
      locks_inspected: stats.locksInspected,
      stories_written: stats.storiesWritten,
      challenges_completed: stats.challengesCompleted,
    };
    const unlocked: string[] = [];
    for (const a of ACHIEVEMENTS) {
      if (map[a.metric] >= a.threshold) {
        const r = await run('INSERT OR IGNORE INTO user_achievements (profile_id, achievement_id) VALUES (?, ?)', profileId, a.id);
        if (r.changes) unlocked.push(a.id);
      }
    }
    return unlocked;
  }

  async function award(profileId: string, reason: XpReason, refId: string): Promise<number> {
    const rule = XP_RULES[reason];
    const today = (await one<{ c: number }>(
      'SELECT count(*) AS c FROM xp_events WHERE profile_id = ? AND reason = ? AND created_at >= ?',
      profileId, reason, todayStart(),
    ))!;
    if (today.c >= rule.dailyCap) return 0;
    const r = await run('INSERT OR IGNORE INTO xp_events (profile_id, reason, ref_id, xp, created_at) VALUES (?, ?, ?, ?, ?)',
      profileId, reason, refId, rule.xp, nowIso());
    if (!r.changes) return 0;
    await run('UPDATE profiles SET xp = xp + ?, updated_at = ? WHERE id = ?', rule.xp, nowIso(), profileId);
    const xp = (await one<{ xp: number }>('SELECT xp FROM profiles WHERE id = ?', profileId))!.xp;
    const level = levelFromXp(xp);
    await run(`INSERT OR IGNORE INTO user_rewards (profile_id, reward_id) SELECT ?, id FROM rewards WHERE required_level <= ?`, profileId, level);
    return rule.xp;
  }

  async function assignSlot(preferredSpan: number | null): Promise<number> {
    const taken = new Set((await all<{ slot: number }>('SELECT slot FROM locks')).map((r) => r.slot));
    if (taken.size >= BRIDGE_SLOTS) throw new HttpError(503, 'The bridge is full. New bridges are coming soon!');
    const perSpan = BRIDGE.sides * BRIDGE.rows * BRIDGE.colsPerSpan;
    const tryRange = (start: number, end: number) => {
      const free: number[] = [];
      for (let s = start; s < end; s++) if (!taken.has(s)) free.push(s);
      return free.length ? free[Math.floor(Math.random() * free.length)] : -1;
    };
    if (preferredSpan !== null) {
      const s = tryRange(preferredSpan * perSpan, (preferredSpan + 1) * perSpan);
      if (s >= 0) return s;
    }
    return tryRange(0, BRIDGE_SLOTS);
  }

  function shareUrlPath(token: string) {
    return `/i/${token}`;
  }

  async function createInvitation(lockId: string, ownerId: string, maxUses: number | null, expiresInDays: number | null, label: string) {
    const token = newToken();
    const id = newId();
    const expiresAt = expiresInDays ? new Date(now().getTime() + expiresInDays * DAY).toISOString() : null;
    await run(`INSERT INTO invitations (id, lock_id, token_hash, created_by, label, max_uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, lockId, sha256(token), ownerId, label, maxUses, expiresAt, nowIso());
    return { id, token, path: shareUrlPath(token), maxUses, expiresAt };
  }

  async function storyFor(row: any): Promise<Story> {
    const s = await one('SELECT * FROM lock_stories WHERE lock_id = ?', row.id);
    return {
      title: row.title,
      body: s?.body ?? '',
      signature: s?.signature ?? '',
      creatorName: row.show_name ? row.owner_name : null,
      createdAt: row.created_at,
    };
  }

  async function lockDetail(row: any, actor: ActorRow | null, viaInvitation: boolean): Promise<LockDetail> {
    const puzzle = await loadPuzzle(row.id);
    const summary = toSummary(row, actor?.id ?? null);
    let canAttempt = true;
    let reason: string | null = null;
    let remaining: number | null = puzzle.maxAttempts;
    if (summary.isOwn) { canAttempt = false; reason = 'This is your lock — you can read its story any time.'; }
    else if (summary.solvedByMe) { canAttempt = false; reason = 'You already opened this lock.'; }
    else if (!isLive(row)) { canAttempt = false; reason = 'This lock is no longer available.'; }
    else if (scheduledPending(row)) { canAttempt = false; reason = `This lock opens on ${new Date(row.available_at).toDateString()}.`; }
    else if (row.visibility === 'private') { canAttempt = false; reason = 'This lock is private.'; }
    else if ((row.visibility === 'unlisted' || row.visibility === 'invite_only') && !viaInvitation) {
      canAttempt = false; reason = 'This lock can only be opened with its invitation link.';
    }
    if (canAttempt && actor) {
      const st = await attemptState(row, actor.id, puzzle);
      remaining = st.remaining;
      if (st.remaining === 0) { canAttempt = false; reason = `Too many attempts. Try again in ${Math.ceil(st.retryAfter / 3600)}h.`; }
    }
    return { ...summary, puzzle: publicPuzzle(puzzle), canAttempt, attemptBlockedReason: reason, attemptsRemaining: remaining };
  }

  // ---------- routes ----------
  const routes: { method: string; re: RegExp; keys: string[]; h: Handler }[] = [];
  const route = (method: string, path: string, h: Handler) => {
    const keys: string[] = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, h });
  };

  route('GET', '/api/health', () => ({ ok: true, time: nowIso() }));

  // --- auth ---
  route('POST', '/api/auth/guest', async (ctx) => {
    const wait = guestLimiter.take(ctx.ipHash);
    if (wait) throw new HttpError(429, 'Too many new sessions from your network. Try again later.', undefined, wait);
    const id = newId();
    const name = `Wanderer #${Math.floor(1000 + Math.random() * 9000)}`;
    await run('INSERT INTO profiles (id, display_name, is_guest, created_at, updated_at) VALUES (?, ?, 1, ?, ?)', id, name, nowIso(), nowIso());
    const token = await createSession(id);
    return { token, profile: toProfile((await one<ActorRow>('SELECT * FROM profiles WHERE id = ?', id))!) };
  });

  route('POST', '/api/auth/register', async (ctx) => {
    const wait = authLimiter.take('reg:' + ctx.ipHash);
    if (wait) throw new HttpError(429, 'Too many attempts. Please wait.', undefined, wait);
    const email = cleanText(ctx.body?.email, 200).toLowerCase();
    const password = typeof ctx.body?.password === 'string' ? ctx.body.password : '';
    const displayName = cleanText(ctx.body?.displayName, LIMITS.displayName);
    const errors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
    if (password.length < 8 || password.length > 200) errors.password = 'Use at least 8 characters.';
    if (displayName.length < 2) errors.displayName = 'Choose a display name (2+ characters).';
    if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', errors);
    if (await one('SELECT 1 FROM profiles WHERE email = ?', email)) throw new HttpError(409, 'An account with this email already exists.', { email: 'Already registered — sign in instead.' });
    const passwordHash = await hashSecret(password, pepper);
    const isAdmin = adminEmails.has(email) ? 1 : 0;
    let id: string;
    if (ctx.actor?.is_guest) {
      // Upgrade the guest in place so their locks, XP and unlocked stories carry over.
      id = ctx.actor.id;
      await run('UPDATE profiles SET email = ?, password_hash = ?, display_name = ?, is_guest = 0, is_admin = ?, updated_at = ? WHERE id = ?',
        email, passwordHash, displayName, isAdmin, nowIso(), id);
    } else {
      id = newId();
      await run('INSERT INTO profiles (id, display_name, is_guest, email, password_hash, is_admin, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?, ?)',
        id, displayName, email, passwordHash, isAdmin, nowIso(), nowIso());
    }
    const token = await createSession(id);
    return { token, profile: toProfile((await one<ActorRow>('SELECT * FROM profiles WHERE id = ?', id))!), upgradedGuest: !!ctx.actor?.is_guest };
  });

  route('POST', '/api/auth/login', async (ctx) => {
    const wait = authLimiter.take('login:' + ctx.ipHash);
    if (wait) throw new HttpError(429, 'Too many sign-in attempts. Please wait.', undefined, wait);
    const email = cleanText(ctx.body?.email, 200).toLowerCase();
    const password = typeof ctx.body?.password === 'string' ? ctx.body.password : '';
    const p = await one<ActorRow & { password_hash: string | null }>('SELECT * FROM profiles WHERE email = ?', email);
    const ok = p?.password_hash ? await verifySecret(password, p.password_hash, pepper) : false;
    if (!p || !ok) throw new HttpError(401, 'Email or password is incorrect.');
    return { token: await createSession(p.id), profile: toProfile(p) };
  });

  route('POST', '/api/auth/logout', async (ctx) => {
    const h = ctx.req.headers.authorization;
    if (h?.startsWith('Bearer ')) await run('DELETE FROM sessions WHERE token_hash = ?', sha256(h.slice(7).trim()));
    return { ok: true };
  });

  // --- profile ---
  route('GET', '/api/me', async (ctx): Promise<MeResponse> => {
    const a = requireActor(ctx);
    const level = levelFromXp(a.xp);
    return {
      profile: toProfile(a),
      stats: await computeStats(a.id),
      achievements: await all('SELECT achievement_id AS id, unlocked_at AS "unlockedAt" FROM user_achievements WHERE profile_id = ?', a.id),
      currentLevelXp: xpForLevel(level),
      nextLevelXp: xpForLevel(level + 1),
    };
  });

  route('PATCH', '/api/me', async (ctx) => {
    const a = requireActor(ctx);
    const b = ctx.body ?? {};
    const displayName = b.displayName !== undefined ? cleanText(b.displayName, LIMITS.displayName) : a.display_name;
    if (displayName.length < 2) throw new HttpError(400, 'Display name is too short.', { displayName: 'Use 2+ characters.' });
    const avatar = typeof b.avatar === 'string' && [...b.avatar].length <= 2 ? b.avatar : a.avatar;
    const showName = b.showNameOnLocks !== undefined ? (b.showNameOnLocks ? 1 : 0) : a.show_name_on_locks;
    await run('UPDATE profiles SET display_name = ?, avatar = ?, show_name_on_locks = ?, updated_at = ? WHERE id = ?', displayName, avatar, showName, nowIso(), a.id);
    return { profile: toProfile((await one<ActorRow>('SELECT * FROM profiles WHERE id = ?', a.id))!) };
  });

  route('DELETE', '/api/me', async (ctx) => {
    const a = requireActor(ctx);
    // Cascades remove locks, stories, puzzles, invitations, reactions, sessions and progress.
    await run('DELETE FROM profiles WHERE id = ?', a.id);
    return { ok: true };
  });

  route('GET', '/api/me/locks', async (ctx): Promise<OwnLock[]> => {
    const a = requireActor(ctx);
    const rows = await all(`${LOCK_SELECT} WHERE l.owner_id = $actor ORDER BY l.created_at DESC`, { actor: a.id });
    const out: OwnLock[] = [];
    for (const r of rows) {
      out.push({
        ...toSummary(r, a.id),
        invitationCount: await count('SELECT count(*) AS c FROM invitations WHERE lock_id = ? AND revoked = 0', r.id),
        attemptCount: await count('SELECT count(*) AS c FROM puzzle_attempts WHERE lock_id = ?', r.id),
      });
    }
    return out;
  });

  route('GET', '/api/me/unlocked', async (ctx) => {
    const a = requireActor(ctx);
    return (await all(`${LOCK_SELECT} JOIN unlock_events ue ON ue.lock_id = l.id AND ue.actor_id = $actor ORDER BY ue.created_at DESC`, { actor: a.id }))
      .map((r) => toSummary(r, a.id));
  });

  route('GET', '/api/me/blocks', async (ctx) => {
    const a = requireActor(ctx);
    return await all(`SELECT b.blocked_id AS id, CASE WHEN p.show_name_on_locks = 1 THEN p.display_name ELSE 'Anonymous creator' END AS "displayName", b.created_at AS "createdAt"
      FROM blocks b JOIN profiles p ON p.id = b.blocked_id WHERE b.blocker_id = ?`, a.id);
  });

  route('DELETE', '/api/me/blocks/:id', async (ctx) => {
    const a = requireActor(ctx);
    await run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', a.id, ctx.params.id);
    return { ok: true };
  });

  // --- bridge & explore ---
  route('GET', '/api/bridge', async (ctx): Promise<BridgeLock[]> => {
    const actorId = ctx.actor?.id ?? '';
    return (await all(`SELECT id, slot, shape, material, color, effect, visibility, owner_id FROM locks
      WHERE (owner_id = $actor) OR (status = 'active' AND visibility <> 'private' AND (expires_at IS NULL OR expires_at > $now)
        AND owner_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $actor))`, { actor: actorId, now: nowIso() }))
      .map((r) => ({ id: r.id, slot: r.slot, shape: r.shape, material: r.material, color: r.color, effect: r.effect, visibility: r.visibility, isOwn: r.owner_id === actorId }));
  });

  route('GET', '/api/locks', async (ctx): Promise<LockSummary[]> => {
    const actorId = ctx.actor?.id ?? '';
    const q = cleanText(ctx.url.searchParams.get('q'), 60).toLowerCase();
    const category = ctx.url.searchParams.get('category');
    const sort = ctx.url.searchParams.get('sort') ?? 'recent';
    const limit = Math.min(60, Math.max(1, Number(ctx.url.searchParams.get('limit') ?? 30) || 30));
    const where = [
      `l.status = 'active'`, `l.visibility IN ('public','scheduled')`, `(l.expires_at IS NULL OR l.expires_at > $now)`,
      `l.owner_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $actor)`,
    ];
    const params: Record<string, any> = { actor: actorId, now: nowIso(), limit };
    if (q) { where.push(`(lower(l.title) LIKE $q OR lower(l.engraving) LIKE $q)`); params.q = `%${q.replace(/[%_]/g, '')}%`; }
    if (category && (CATEGORIES as readonly string[]).includes(category)) { where.push('l.category = $category'); params.category = category; }
    // Wrapped in a subquery (x) so ORDER BY may use the computed unlock_count in both SQLite and Postgres.
    const order = sort === 'popular' ? 'x.unlock_count DESC, x.created_at DESC'
      : sort === 'featured' ? `(x.unlock_count * 3 + (SELECT count(*) FROM reactions r2 WHERE r2.lock_id = x.id) * 2 + CASE WHEN x.created_at > $week THEN 5 ELSE 0 END) DESC, x.created_at DESC`
      : 'x.created_at DESC';
    if (sort === 'featured') params.week = agoIso(7 * DAY);
    return (await all(`SELECT * FROM (${LOCK_SELECT} WHERE ${where.join(' AND ')}) x ORDER BY ${order} LIMIT $limit`, params)).map((r) => toSummary(r, actorId || null));
  });

  route('GET', '/api/locks/:id', async (ctx) => {
    const row = await getLockRow(ctx.params.id, ctx.actor?.id ?? null);
    if (!row || (row.visibility === 'private' && row.owner_id !== ctx.actor?.id && !ctx.actor?.is_admin)) throw new HttpError(404, 'Lock not found.');
    if (!canViewDetails(row, ctx.actor)) {
      if (isLive(row)) throw new HttpError(403, 'This lock can only be opened with its invitation link.', { code: 'invite_required' });
      throw new HttpError(404, 'Lock not found.');
    }
    return await lockDetail(row, ctx.actor, false);
  });

  route('POST', '/api/locks', async (ctx) => {
    const a = requireActor(ctx);
    const v = validateCreateLock(ctx.body, now());
    if (!v.ok) throw new HttpError(400, 'Please fix the highlighted fields.', v.errors);
    const input = v.value;
    const level = levelFromXp(a.xp);
    if (materialById(input.material).requiredLevel > level) throw new HttpError(403, `${materialById(input.material).label} unlocks at level ${materialById(input.material).requiredLevel}.`, { material: 'Locked' });
    const style = ENGRAVING_STYLES.find((s) => s.id === input.engravingStyle)!;
    if (style.requiredLevel > level) throw new HttpError(403, `${style.label} unlocks at level ${style.requiredLevel}.`, { engravingStyle: 'Locked' });
    const createdToday = (await count('SELECT count(*) AS c FROM locks WHERE owner_id = ? AND created_at >= ?', a.id, todayStart()));
    if (createdToday >= 10) throw new HttpError(429, 'You have attached 10 locks today. The bridge will welcome more tomorrow.');

    const puzzle = await buildPuzzle(input.puzzle, pepper);
    const id = newId();
    const result = await db.tx(async () => {
      const slot = await assignSlot(input.preferredSpan ?? null);
      await run(`INSERT INTO locks (id, owner_id, shape, material, color, engraving, engraving_style, decoration, effect, lock_date, title, category,
          visibility, available_at, expires_at, slot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, a.id, input.shape, input.material, input.color, input.engraving, input.engravingStyle, input.decoration, input.effect,
        input.lockDate, input.title, input.category, input.visibility, input.availableAt, input.expiresAt, slot, nowIso(), nowIso());
      await run('INSERT INTO lock_stories (lock_id, body, signature) VALUES (?, ?, ?)', id, input.story, input.signature);
      await run('INSERT INTO puzzles (lock_id, type, public_config, secret_config, hints, max_attempts) VALUES (?, ?, ?, ?, ?, ?)',
        id, puzzle.type, JSON.stringify(puzzle.publicConfig), JSON.stringify(puzzle.secretConfig), JSON.stringify(puzzle.hints), puzzle.maxAttempts);
      const invitation = input.visibility === 'private' ? null
        : await createInvitation(id, a.id, input.visibility === 'invite_only' ? 1 : null, null, 'Share link');
      const xp = await award(a.id, 'create_lock', id);
      const newAchievements = await checkAchievements(a.id);
      return { slot, invitation, xp, newAchievements };
    });
    const row = await getLockRow(id, a.id);
    return { lock: toSummary(row, a.id), invitation: result.invitation, xpAwarded: result.xp, newAchievements: result.newAchievements };
  });

  route('PATCH', '/api/locks/:id', async (ctx) => {
    const a = requireActor(ctx);
    const row = await getLockRow(ctx.params.id, a.id);
    if (!row || row.owner_id !== a.id) throw new HttpError(404, 'Lock not found.');
    const b = ctx.body ?? {};
    const story = await one('SELECT * FROM lock_stories WHERE lock_id = ?', row.id);
    const merged = {
      shape: b.shape ?? row.shape, material: b.material ?? row.material, color: b.color ?? row.color,
      engraving: b.engraving ?? row.engraving, engravingStyle: b.engravingStyle ?? row.engraving_style,
      decoration: b.decoration ?? row.decoration, effect: b.effect ?? row.effect, lockDate: b.lockDate ?? row.lock_date,
      title: b.title ?? row.title, category: b.category ?? row.category, story: b.story ?? story?.body,
      signature: b.signature ?? story?.signature, visibility: b.visibility ?? row.visibility,
      availableAt: b.availableAt !== undefined ? b.availableAt : row.available_at,
      expiresAt: b.expiresAt !== undefined ? b.expiresAt : row.expires_at,
      puzzle: b.puzzle ?? { type: 'pin', pin: '0000' }, // placeholder when puzzle is unchanged
    };
    const v = validateCreateLock(merged, now());
    if (!v.ok) {
      const errs = { ...v.errors };
      // An already-open scheduled lock or an unchanged expiry is fine when the owner doesn't touch it.
      if (b.availableAt === undefined && b.visibility === undefined) delete errs.availableAt;
      if (b.expiresAt === undefined) delete errs.expiresAt;
      if (Object.keys(errs).length) throw new HttpError(400, 'Please fix the highlighted fields.', errs);
    }
    const m = v.ok ? v.value : (merged as any);
    if (v.ok && materialById(m.material).requiredLevel > levelFromXp(a.xp) && m.material !== row.material)
      throw new HttpError(403, 'That material is still locked.');
    let newPuzzle: StoredPuzzle | null = null;
    if (b.puzzle) {
      const pv = validatePuzzle(b.puzzle);
      if (!pv.ok) throw new HttpError(400, 'Please fix the puzzle.', pv.errors);
      newPuzzle = await buildPuzzle(pv.value, pepper);
    }
    await db.tx(async () => {
      await run(`UPDATE locks SET shape=?, material=?, color=?, engraving=?, engraving_style=?, decoration=?, effect=?, lock_date=?, title=?, category=?,
          visibility=?, available_at=?, expires_at=?, updated_at=? WHERE id = ?`,
        m.shape, m.material, m.color, m.engraving, m.engravingStyle, m.decoration, m.effect, m.lockDate, m.title, m.category,
        m.visibility, m.visibility === 'scheduled' ? m.availableAt : null, m.expiresAt ?? null, nowIso(), row.id);
      await run('UPDATE lock_stories SET body = ?, signature = ? WHERE lock_id = ?', m.story, m.signature ?? '', row.id);
      if (newPuzzle) {
        await run('UPDATE puzzles SET type=?, public_config=?, secret_config=?, hints=?, max_attempts=? WHERE lock_id=?',
          newPuzzle.type, JSON.stringify(newPuzzle.publicConfig), JSON.stringify(newPuzzle.secretConfig), JSON.stringify(newPuzzle.hints), newPuzzle.maxAttempts, row.id);
      }
      if (m.visibility === 'private') await run('UPDATE invitations SET revoked = 1 WHERE lock_id = ?', row.id);
    });
    return { lock: toSummary(await getLockRow(row.id, a.id), a.id) };
  });

  route('DELETE', '/api/locks/:id', async (ctx) => {
    const a = requireActor(ctx);
    const row = await one('SELECT owner_id FROM locks WHERE id = ?', ctx.params.id);
    if (!row || (row.owner_id !== a.id && !a.is_admin)) throw new HttpError(404, 'Lock not found.');
    await run('DELETE FROM locks WHERE id = ?', ctx.params.id);
    if (a.is_admin && row.owner_id !== a.id) await run('INSERT INTO moderation_actions (lock_id, admin_id, action) VALUES (?, ?, ?)', ctx.params.id, a.id, 'delete');
    return { ok: true };
  });

  route('GET', '/api/locks/:id/story', async (ctx) => {
    const a = requireActor(ctx);
    const row = await getLockRow(ctx.params.id, a.id);
    if (!row || (row.owner_id !== a.id && !row.solved_by_me)) throw new HttpError(403, 'Solve the puzzle to read this story.');
    return await storyFor(row);
  });

  // --- invitations ---
  route('GET', '/api/locks/:id/invitations', async (ctx) => {
    const a = requireActor(ctx);
    const row = await one('SELECT owner_id FROM locks WHERE id = ?', ctx.params.id);
    if (!row || row.owner_id !== a.id) throw new HttpError(404, 'Lock not found.');
    return await all(`SELECT id, label, max_uses AS "maxUses", use_count AS "useCount", open_count AS "openCount", expires_at AS "expiresAt", revoked, created_at AS "createdAt"
      FROM invitations WHERE lock_id = ? ORDER BY created_at DESC`, ctx.params.id);
  });

  route('POST', '/api/locks/:id/invitations', async (ctx) => {
    const a = requireActor(ctx);
    const row = await one('SELECT owner_id, visibility FROM locks WHERE id = ?', ctx.params.id);
    if (!row || row.owner_id !== a.id) throw new HttpError(404, 'Lock not found.');
    if (row.visibility === 'private') throw new HttpError(400, 'Private locks cannot be shared. Change visibility first.');
    const active = (await count('SELECT count(*) AS c FROM invitations WHERE lock_id = ? AND revoked = 0', ctx.params.id));
    if (active >= 50) throw new HttpError(429, 'This lock already has 50 active invitations.');
    const maxUsesRaw = Number(ctx.body?.maxUses);
    const maxUses = Number.isInteger(maxUsesRaw) && maxUsesRaw > 0 ? Math.min(1000, maxUsesRaw) : null;
    const daysRaw = Number(ctx.body?.expiresInDays);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(365, daysRaw) : null;
    return await createInvitation(ctx.params.id, a.id, maxUses, days, cleanText(ctx.body?.label, 40));
  });

  route('DELETE', '/api/invitations/:id', async (ctx) => {
    const a = requireActor(ctx);
    const r = await run('UPDATE invitations SET revoked = 1 WHERE id = ? AND created_by = ?', ctx.params.id, a.id);
    if (!r.changes) throw new HttpError(404, 'Invitation not found.');
    return { ok: true };
  });

  route('GET', '/api/invitations/:token', async (ctx) => {
    const inv = await resolveInvitation(ctx.params.token);
    const row = await getLockRow(inv.lock_id, ctx.actor?.id ?? null);
    if (!row || !isLive(row) || row.visibility === 'private') throw new HttpError(404, 'This lock is no longer on the bridge.');
    await run('UPDATE invitations SET open_count = open_count + 1 WHERE id = ?', inv.id);
    const detail = await lockDetail(row, ctx.actor, true);
    if (inv.max_uses !== null && inv.use_count >= inv.max_uses && !detail.solvedByMe && !detail.isOwn) {
      detail.canAttempt = false;
      detail.attemptBlockedReason = 'This invitation has already been used.';
    }
    return detail;
  });

  // --- the unlock pipeline ---
  route('POST', '/api/unlock', async (ctx): Promise<UnlockResult> => {
    const a = requireActor(ctx);
    const ipWait = unlockIpLimiter.take(ctx.ipHash);
    if (ipWait) throw new HttpError(429, 'Slow down a little — too many attempts from your network.', undefined, ipWait);
    const answer = typeof ctx.body?.answer === 'string' ? ctx.body.answer.slice(0, 200) : '';
    let inv: any = null;
    let lockId: string;
    if (ctx.body?.token) { inv = await resolveInvitation(ctx.body.token); lockId = inv.lock_id; }
    else lockId = String(ctx.body?.lockId ?? '');
    const row = await getLockRow(lockId, a.id);
    if (!row || !isLive(row) || row.visibility === 'private') throw new HttpError(404, 'Lock not found.');
    if (row.owner_id === a.id) throw new HttpError(400, 'This is your own lock — open it from your profile.');
    if (row.solved_by_me) return { success: true, story: await storyFor(row), attemptsRemaining: null };
    if (scheduledPending(row)) throw new HttpError(403, 'This lock has not opened yet.');
    if ((row.visibility === 'unlisted' || row.visibility === 'invite_only') && !inv)
      throw new HttpError(403, 'This lock can only be opened with its invitation link.');
    if (inv && inv.max_uses !== null && inv.use_count >= inv.max_uses) throw new HttpError(410, 'This invitation has already been used.');
    if (await isBlockedBy(row.owner_id, a.id)) throw new HttpError(403, 'You cannot open this lock.');

    const puzzle = await loadPuzzle(row.id);
    const st = await attemptState(row, a.id, puzzle);
    if (st.remaining === 0) throw new HttpError(429, 'You have used all your attempts for today on this lock.', undefined, st.retryAfter);
    const burst = (await count('SELECT count(*) AS c FROM puzzle_attempts WHERE lock_id = ? AND actor_id = ? AND success = 0 AND created_at > ?', row.id, a.id, agoIso(10 * 60_000)));
    if (burst >= 5) throw new HttpError(429, 'Take a breath — try again in a few minutes.', undefined, 600);
    const ipFails = (await count('SELECT count(*) AS c FROM puzzle_attempts WHERE lock_id = ? AND ip_hash = ? AND success = 0 AND created_at > ?', row.id, ctx.ipHash, agoIso(60 * 60_000)));
    if (ipFails >= 30) throw new HttpError(429, 'Too many attempts on this lock from your network.', undefined, 3600);
    const lockFails = (await count('SELECT count(*) AS c FROM puzzle_attempts WHERE lock_id = ? AND success = 0 AND created_at > ?', row.id, agoIso(60 * 60_000)));
    if (lockFails >= 300) throw new HttpError(429, 'This lock is resting after many attempts. Try again later.', undefined, 3600);

    const handler = PUZZLE_HANDLERS[puzzle.type];
    if (!handler.isWellFormed(answer, puzzle)) {
      throw new HttpError(400, puzzle.type === 'pin' ? `Enter all ${puzzle.publicConfig.pinLength} digits.` : 'Enter an answer.');
    }
    const correct = await handler.check(answer, puzzle, pepper);
    const hintsUsed = Math.max(0, Math.min(puzzle.hints.length, Number(ctx.body?.hintsUsed) || 0));
    await run('INSERT INTO puzzle_attempts (lock_id, actor_id, ip_hash, success, hints_used, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      row.id, a.id, ctx.ipHash, correct ? 1 : 0, hintsUsed, nowIso());
    if (!correct) {
      return { success: false, attemptsRemaining: st.remaining - 1, message: 'Not quite. The lock stays closed.' };
    }
    const outcome = await db.tx(async () => {
      if (inv) {
        const u = await run('UPDATE invitations SET use_count = use_count + 1 WHERE id = ? AND (max_uses IS NULL OR use_count < max_uses)', inv.id);
        if (!u.changes) throw new HttpError(410, 'This invitation has already been used.');
      }
      await run('INSERT OR IGNORE INTO unlock_events (lock_id, actor_id, invitation_id, created_at) VALUES (?, ?, ?, ?)', row.id, a.id, inv?.id ?? null, nowIso());
      const xp = await award(a.id, 'solve_lock', row.id);
      // Owners earn XP only from registered solvers, so throwaway guest sessions cannot farm it.
      if (!a.is_guest) await award(row.owner_id, 'receive_unlock', `${row.id}:${a.id}`);
      await checkAchievements(row.owner_id);
      return { xp, newAchievements: await checkAchievements(a.id) };
    });
    return { success: true, story: await storyFor(await getLockRow(row.id, a.id)), xpAwarded: outcome.xp, newAchievements: outcome.newAchievements };
  });

  route('POST', '/api/hint', async (ctx) => {
    requireActor(ctx);
    let lockId: string;
    if (ctx.body?.token) lockId = (await resolveInvitation(ctx.body.token)).lock_id;
    else {
      lockId = String(ctx.body?.lockId ?? '');
      const row = await getLockRow(lockId, ctx.actor!.id);
      if (!row || !canViewDetails(row, ctx.actor)) throw new HttpError(404, 'Lock not found.');
    }
    const puzzle = await loadPuzzle(lockId);
    const index = Math.max(0, Math.min(puzzle.hints.length - 1, Number(ctx.body?.index) || 0));
    if (!puzzle.hints.length) throw new HttpError(404, 'This lock has no hints.');
    return { index, hint: puzzle.hints[index], total: puzzle.hints.length };
  });

  // --- social basics ---
  route('POST', '/api/locks/:id/react', async (ctx) => {
    const a = requireActor(ctx);
    const reaction = ctx.body?.reaction;
    if (!(REACTIONS as readonly string[]).includes(reaction)) throw new HttpError(400, 'Unknown reaction.');
    const row = await getLockRow(ctx.params.id, a.id);
    if (!row || !row.solved_by_me) throw new HttpError(403, 'Open the lock before reacting to its story.');
    await run(`INSERT INTO reactions (lock_id, actor_id, reaction, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (lock_id, actor_id) DO UPDATE SET reaction = excluded.reaction`, row.id, a.id, reaction, nowIso());
    return { reactions: toSummary(await getLockRow(row.id, a.id), a.id).reactions };
  });

  route('POST', '/api/locks/:id/inspect', async (ctx) => {
    const a = requireActor(ctx);
    const row = await getLockRow(ctx.params.id, a.id);
    if (!row || row.owner_id === a.id || !isLive(row) || row.visibility === 'private') return { xpAwarded: 0 };
    const r = await run('INSERT OR IGNORE INTO lock_inspections (profile_id, lock_id, created_at) VALUES (?, ?, ?)', a.id, row.id, nowIso());
    if (!r.changes) return { xpAwarded: 0 };
    const xp = await award(a.id, 'inspect_lock', row.id);
    return { xpAwarded: xp, newAchievements: await checkAchievements(a.id) };
  });

  route('POST', '/api/locks/:id/report', async (ctx) => {
    const a = requireActor(ctx);
    const reason = ctx.body?.reason;
    if (!(REPORT_REASONS as readonly string[]).includes(reason)) throw new HttpError(400, 'Choose a reason.');
    const row = await one('SELECT id, owner_id, status FROM locks WHERE id = ?', ctx.params.id);
    if (!row) throw new HttpError(404, 'Lock not found.');
    if (row.owner_id === a.id) throw new HttpError(400, 'You cannot report your own lock.');
    await run('INSERT OR IGNORE INTO reports (lock_id, reporter_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?)',
      row.id, a.id, reason, cleanText(ctx.body?.details, 500), nowIso());
    const distinct = (await count("SELECT count(DISTINCT reporter_id) AS c FROM reports WHERE lock_id = ? AND status = 'open'", row.id));
    if (distinct >= 3 && row.status === 'active') {
      await run("UPDATE locks SET status = 'hidden' WHERE id = ?", row.id);
      await run('INSERT INTO moderation_actions (lock_id, action, note) VALUES (?, ?, ?)', row.id, 'auto_hide', '3+ open reports');
    }
    return { ok: true };
  });

  route('POST', '/api/locks/:id/block-owner', async (ctx) => {
    const a = requireActor(ctx);
    const row = await one('SELECT owner_id FROM locks WHERE id = ?', ctx.params.id);
    if (!row) throw new HttpError(404, 'Lock not found.');
    if (row.owner_id === a.id) throw new HttpError(400, 'You cannot block yourself.');
    await run('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)', a.id, row.owner_id);
    return { ok: true };
  });

  // --- challenges & achievements ---
  async function challengeProgress(a: ActorRow): Promise<ChallengeProgress[]> {
    const date = nowIso().slice(0, 10);
    const start = todayStart();
    const counts = {
      create: (await count('SELECT count(*) AS c FROM locks WHERE owner_id = ? AND created_at >= ?', a.id, start)),
      solve: (await count('SELECT count(*) AS c FROM unlock_events WHERE actor_id = ? AND created_at >= ?', a.id, start)),
      inspect: (await count('SELECT count(*) AS c FROM lock_inspections WHERE profile_id = ? AND created_at >= ?', a.id, start)),
    };
    const out: ChallengeProgress[] = [];
    for (const c of challengesForDate(date)) {
      await run('INSERT OR IGNORE INTO daily_challenges (date, challenge_id, title, metric, target) VALUES (?, ?, ?, ?, ?)', date, c.id, c.title, c.metric, c.target);
      const progress = Math.min(c.target, Number(counts[c.metric]));
      const claimed = !!await one('SELECT 1 FROM daily_challenge_claims WHERE profile_id = ? AND date = ? AND challenge_id = ?', a.id, date, c.id);
      out.push({ id: c.id, title: c.title, description: c.description, target: c.target, progress, completed: progress >= c.target, claimed });
    }
    return out;
  }

  route('GET', '/api/challenges', async (ctx) => await challengeProgress(requireActor(ctx)));

  route('POST', '/api/challenges/:id/claim', async (ctx) => {
    const a = requireActor(ctx);
    const c = (await challengeProgress(a)).find((x) => x.id === ctx.params.id);
    if (!c) throw new HttpError(404, 'That challenge is not active today.');
    if (!c.completed) throw new HttpError(400, 'Complete the challenge first.');
    if (c.claimed) throw new HttpError(409, 'Already claimed.');
    const date = nowIso().slice(0, 10);
    return await db.tx(async () => {
      await run('INSERT INTO daily_challenge_claims (profile_id, date, challenge_id, claimed_at) VALUES (?, ?, ?, ?)', a.id, date, c.id, nowIso());
      const xp = await award(a.id, 'daily_challenge', `${date}:${c.id}`);
      return { xpAwarded: xp, newAchievements: await checkAchievements(a.id) };
    });
  });

  // --- analytics (first-party, privacy-friendly) ---
  route('POST', '/api/analytics', async (ctx) => {
    const name = String(ctx.body?.name ?? '');
    if (!ANALYTICS_EVENTS.has(name)) throw new HttpError(400, 'Unknown event.');
    const props = ctx.body?.props && typeof ctx.body.props === 'object' ? JSON.stringify(ctx.body.props).slice(0, 1000) : '{}';
    await run('INSERT INTO analytics_events (name, profile_id, props, created_at) VALUES (?, ?, ?, ?)', name, ctx.actor?.id ?? null, props, nowIso());
    return { ok: true };
  });

  // --- moderation (admins only) ---
  const requireAdmin = (ctx: Ctx) => {
    const a = requireActor(ctx);
    if (!a.is_admin) throw new HttpError(403, 'Moderators only.');
    return a;
  };

  route('GET', '/api/admin/reports', async (ctx) => {
    requireAdmin(ctx);
    return await all(`SELECT l.id AS "lockId", l.title, l.engraving, l.status, count(*) AS reports, group_concat(DISTINCT r.reason) AS reasons, max(r.created_at) AS "lastReportAt"
      FROM reports r JOIN locks l ON l.id = r.lock_id WHERE r.status = 'open' GROUP BY l.id, l.title, l.engraving, l.status ORDER BY reports DESC`);
  });

  route('POST', '/api/admin/locks/:id/moderate', async (ctx) => {
    const admin = requireAdmin(ctx);
    const action = ctx.body?.action;
    if (!['hide', 'restore', 'dismiss'].includes(action)) throw new HttpError(400, 'Unknown action.');
    await db.tx(async () => {
      if (action === 'hide') await run("UPDATE locks SET status = 'hidden' WHERE id = ?", ctx.params.id);
      if (action === 'restore' || action === 'dismiss') await run("UPDATE locks SET status = 'active' WHERE id = ?", ctx.params.id);
      await run(`UPDATE reports SET status = ? WHERE lock_id = ? AND status = 'open'`, action === 'hide' ? 'actioned' : 'dismissed', ctx.params.id);
      await run('INSERT INTO moderation_actions (lock_id, admin_id, action, note) VALUES (?, ?, ?, ?)', ctx.params.id, admin.id, action, cleanText(ctx.body?.note, 300));
    });
    return { ok: true };
  });

  route('GET', '/api/admin/metrics', async (ctx) => {
    requireAdmin(ctx);
    return {
      profiles: await count('SELECT count(*) AS c FROM profiles'),
      registered: await count('SELECT count(*) AS c FROM profiles WHERE is_guest = 0'),
      locks: await count('SELECT count(*) AS c FROM locks'),
      invitationsOpened: await count('SELECT coalesce(sum(open_count),0) AS c FROM invitations'),
      unlocks: await count('SELECT count(*) AS c FROM unlock_events'),
      attempts: await count('SELECT count(*) AS c FROM puzzle_attempts'),
      openReports: await count("SELECT count(*) AS c FROM reports WHERE status = 'open'"),
      events: await all('SELECT name, count(*) AS count FROM analytics_events GROUP BY name ORDER BY count DESC'),
    };
  });

  // ---------- dispatcher ----------
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;
    const fwd = opts.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
    const ip = fwd || req.socket.remoteAddress || 'unknown';
    const ipHash = sha256(pepper + ':' + ip).slice(0, 32);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const wait = burstLimiter.take(ipHash);
      if (wait) throw new HttpError(429, 'Too many requests.', undefined, wait);
      const method = req.method ?? 'GET';
      let match: { h: Handler; params: Record<string, string> } | null = null;
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method) continue;
        const params: Record<string, string> = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        match = { h: r.h, params };
        break;
      }
      if (!match) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed.' : 'Not found.');
      const body = method === 'GET' || method === 'DELETE' ? null : await readJson(req);
      const ctx: Ctx = { req, res, url, params: match.params, body, ip, ipHash, actor: await loadActor(req) };
      const out = await match.h(ctx);
      res.statusCode = 200;
      res.end(JSON.stringify(out ?? { ok: true }));
    } catch (e) {
      const err = e instanceof HttpError ? e : null;
      if (!err) console.error('[api] unhandled error', e);
      res.statusCode = err?.status ?? 500;
      if (err?.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
      res.end(JSON.stringify({ error: err?.message ?? 'Something went wrong.', details: err?.details, retryAfterSeconds: err?.retryAfterSeconds }));
    }
    return true;
  };
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new HttpError(413, 'Request is too large.');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}
