-- Love Locks – PostgreSQL schema (Supabase).
--
-- Architecture: the Love Locks API server (server/app.ts) is the ONLY client of this database. It connects
-- with DATABASE_URL (the `postgres` role) and enforces all authorization, puzzle checking and rate limiting.
-- Supabase's auto-generated Data API must expose NOTHING: every table has row level security enabled with
-- no policies, and the anon/authenticated roles have no privileges. Stories and answer hashes are therefore
-- unreachable with the public anon key.
--
-- Idempotent: the server applies this file on boot (CREATE ... IF NOT EXISTS), and it can also be applied with
-- `supabase db push`. Mirrors the SQLite schema in server/db.ts.

CREATE TABLE IF NOT EXISTS profiles (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  avatar text NOT NULL DEFAULT '🗝️',
  is_guest integer NOT NULL DEFAULT 1,
  email text UNIQUE,
  password_hash text,
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  show_name_on_locks integer NOT NULL DEFAULT 1,
  is_admin integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_profile_idx ON sessions(profile_id);

CREATE TABLE IF NOT EXISTS locks (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shape text NOT NULL,
  material text NOT NULL,
  color text NOT NULL CHECK (length(color) = 7),
  engraving text NOT NULL CHECK (length(engraving) BETWEEN 1 AND 24),
  engraving_style text NOT NULL DEFAULT 'serif',
  decoration text NOT NULL DEFAULT 'none',
  effect text NOT NULL DEFAULT 'none',
  lock_date text NOT NULL,
  title text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'love',
  visibility text NOT NULL CHECK (visibility IN ('private','unlisted','public','invite_only','scheduled')),
  available_at timestamptz,
  expires_at timestamptz,
  slot integer NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden')),
  is_demo integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS locks_owner_idx ON locks(owner_id);
CREATE INDEX IF NOT EXISTS locks_visibility_idx ON locks(visibility, status, created_at);

CREATE TABLE IF NOT EXISTS lock_stories (
  lock_id text PRIMARY KEY REFERENCES locks(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) <= 4000),
  signature text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS puzzles (
  lock_id text PRIMARY KEY REFERENCES locks(id) ON DELETE CASCADE,
  type text NOT NULL,
  public_config text NOT NULL,
  secret_config text NOT NULL,
  hints text NOT NULL DEFAULT '[]',
  max_attempts integer NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS puzzle_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lock_id text NOT NULL REFERENCES locks(id) ON DELETE CASCADE,
  actor_id text REFERENCES profiles(id) ON DELETE SET NULL,
  ip_hash text NOT NULL,
  success integer NOT NULL,
  hints_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attempts_lock_actor_idx ON puzzle_attempts(lock_id, actor_id, created_at);
CREATE INDEX IF NOT EXISTS attempts_lock_ip_idx ON puzzle_attempts(lock_id, ip_hash, created_at);

CREATE TABLE IF NOT EXISTS invitations (
  id text PRIMARY KEY,
  lock_id text NOT NULL REFERENCES locks(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_by text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  max_uses integer,
  use_count integer NOT NULL DEFAULT 0,
  open_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  revoked integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitations_lock_idx ON invitations(lock_id);

CREATE TABLE IF NOT EXISTS unlock_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lock_id text NOT NULL REFERENCES locks(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invitation_id text REFERENCES invitations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lock_id, actor_id)
);

CREATE TABLE IF NOT EXISTS reactions (
  lock_id text NOT NULL REFERENCES locks(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lock_id, actor_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lock_id text NOT NULL REFERENCES locks(id) ON DELETE CASCADE,
  reporter_id text REFERENCES profiles(id) ON DELETE SET NULL,
  reason text NOT NULL,
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lock_id, reporter_id)
);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lock_id text NOT NULL,
  admin_id text REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS friendships (
  requester_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE TABLE IF NOT EXISTS xp_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  ref_id text NOT NULL,
  xp integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, reason, ref_id)
);

CREATE TABLE IF NOT EXISTS user_achievements (
  profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS rewards (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('material','engraving_style','effect','theme')),
  ref text NOT NULL,
  label text NOT NULL,
  required_level integer NOT NULL DEFAULT 1,
  seasonal integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_rewards (
  profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reward_id text NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, reward_id)
);

CREATE TABLE IF NOT EXISTS lock_inspections (
  profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lock_id text NOT NULL REFERENCES locks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, lock_id)
);

CREATE TABLE IF NOT EXISTS daily_challenges (
  date text NOT NULL,
  challenge_id text NOT NULL,
  title text NOT NULL,
  metric text NOT NULL,
  target integer NOT NULL,
  PRIMARY KEY (date, challenge_id)
);

CREATE TABLE IF NOT EXISTS daily_challenge_claims (
  profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date text NOT NULL,
  challenge_id text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, date, challenge_id)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  profile_id text,
  props text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_name_idx ON analytics_events(name, created_at);

-- ---------------------------------------------------------------------------------------------------
-- Lock the Data API out. RLS on, no policies; and no table privileges for the public roles (they only
-- exist on Supabase, so this block is skipped on plain Postgres / PGlite).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','sessions','locks','lock_stories','puzzles','puzzle_attempts','invitations',
    'unlock_events','reactions','reports','moderation_actions','blocks','friendships','xp_events','user_achievements',
    'rewards','user_rewards','lock_inspections','daily_challenges','daily_challenge_claims','analytics_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
  END IF;
END $$;
