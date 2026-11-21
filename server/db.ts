// Local development database (SQLite via node:sqlite). The schema mirrors
// supabase/migrations/0001_init.sql so the same API contract works against both.
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MATERIALS, ENGRAVING_STYLES } from '../shared/catalog.ts';

// Loaded via require so bundlers/test runners that don't know the newer `node:sqlite` builtin leave it alone.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
export type DB = DatabaseSyncType;

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🗝️',
  is_guest INTEGER NOT NULL DEFAULT 1,
  email TEXT UNIQUE,
  password_hash TEXT,
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  show_name_on_locks INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_profile_idx ON sessions(profile_id);

CREATE TABLE IF NOT EXISTS locks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shape TEXT NOT NULL,
  material TEXT NOT NULL,
  color TEXT NOT NULL CHECK (length(color) = 7),
  engraving TEXT NOT NULL CHECK (length(engraving) BETWEEN 1 AND 24),
  engraving_style TEXT NOT NULL DEFAULT 'serif',
  decoration TEXT NOT NULL DEFAULT 'none',
  effect TEXT NOT NULL DEFAULT 'none',
  lock_date TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'love',
  visibility TEXT NOT NULL CHECK (visibility IN ('private','unlisted','public','invite_only','scheduled')),
  available_at TEXT,
  expires_at TEXT,
  slot INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden')),
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS locks_owner_idx ON locks(owner_id);
CREATE INDEX IF NOT EXISTS locks_visibility_idx ON locks(visibility, status, created_at);

-- Sensitive: never returned by listing endpoints.
CREATE TABLE IF NOT EXISTS lock_stories (
  lock_id TEXT PRIMARY KEY REFERENCES locks(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) <= 4000),
  signature TEXT NOT NULL DEFAULT ''
);

-- public_config is safe to show; secret_config holds salted+peppered hashes only.
CREATE TABLE IF NOT EXISTS puzzles (
  lock_id TEXT PRIMARY KEY REFERENCES locks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  public_config TEXT NOT NULL,
  secret_config TEXT NOT NULL,
  hints TEXT NOT NULL DEFAULT '[]',
  max_attempts INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS puzzle_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lock_id TEXT NOT NULL REFERENCES locks(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  ip_hash TEXT NOT NULL,
  success INTEGER NOT NULL,
  hints_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS attempts_lock_actor_idx ON puzzle_attempts(lock_id, actor_id, created_at);
CREATE INDEX IF NOT EXISTS attempts_lock_ip_idx ON puzzle_attempts(lock_id, ip_hash, created_at);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  lock_id TEXT NOT NULL REFERENCES locks(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  open_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS invitations_lock_idx ON invitations(lock_id);

CREATE TABLE IF NOT EXISTS unlock_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lock_id TEXT NOT NULL REFERENCES locks(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invitation_id TEXT REFERENCES invitations(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (lock_id, actor_id)
);

CREATE TABLE IF NOT EXISTS reactions (
  lock_id TEXT NOT NULL REFERENCES locks(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (lock_id, actor_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lock_id TEXT NOT NULL REFERENCES locks(id) ON DELETE CASCADE,
  reporter_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (lock_id, reporter_id)
);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lock_id TEXT NOT NULL,
  admin_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- Prepared for the social roadmap; no UI in the MVP.
CREATE TABLE IF NOT EXISTS friendships (
  requester_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  xp INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (profile_id, reason, ref_id)
);

CREATE TABLE IF NOT EXISTS user_achievements (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (profile_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('material','engraving_style','effect','theme')),
  ref TEXT NOT NULL,
  label TEXT NOT NULL,
  required_level INTEGER NOT NULL DEFAULT 1,
  seasonal INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_rewards (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reward_id TEXT NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (profile_id, reward_id)
);

CREATE TABLE IF NOT EXISTS lock_inspections (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lock_id TEXT NOT NULL REFERENCES locks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (profile_id, lock_id)
);

CREATE TABLE IF NOT EXISTS daily_challenges (
  date TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  title TEXT NOT NULL,
  metric TEXT NOT NULL,
  target INTEGER NOT NULL,
  PRIMARY KEY (date, challenge_id)
);

CREATE TABLE IF NOT EXISTS daily_challenge_claims (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (profile_id, date, challenge_id)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  profile_id TEXT,
  props TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS analytics_name_idx ON analytics_events(name, created_at);
`;

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  seedRewards(db);
  return db;
}

function seedRewards(db: DB) {
  const ins = db.prepare(
    'INSERT OR IGNORE INTO rewards (id, kind, ref, label, required_level, seasonal) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const m of MATERIALS)
    if (m.requiredLevel > 1) ins.run(`material:${m.id}`, 'material', m.id, m.label, m.requiredLevel, m.seasonal ? 1 : 0);
  for (const s of ENGRAVING_STYLES)
    if (s.requiredLevel > 1) ins.run(`engraving:${s.id}`, 'engraving_style', s.id, s.label, s.requiredLevel, 0);
}

/** Run fn inside a transaction (node:sqlite has no helper). */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
