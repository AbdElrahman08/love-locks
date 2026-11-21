-- Love Locks – production schema for Supabase (PostgreSQL).
-- Mirrors server/db.ts. Sensitive data (stories, puzzle secrets, invitation hashes) lives in tables with RLS
-- enabled and NO select policies for clients: it is reachable only through SECURITY DEFINER functions
-- that perform authorization, rate limiting and answer checking server-side.
--
-- STATUS: written and reviewed, NOT yet applied to a live Supabase project (no Supabase connector was
-- available while building the MVP). Apply with `supabase db push` and run the RLS checks in TESTING.md.

create extension if not exists pgcrypto;

create schema if not exists private; -- not exposed through the Data API
revoke all on schema private from anon, authenticated;

-- Pepper for answer hashes; set once:  insert into private.settings values ('pepper', encode(gen_random_bytes(32),'base64'));
create table private.settings (key text primary key, value text not null);

-- ---------- tables ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 32),
  avatar text not null default '🗝️',
  is_guest boolean not null default true,        -- true for Supabase anonymous sign-ins
  xp integer not null default 0 check (xp >= 0),
  show_name_on_locks boolean not null default true,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  shape text not null check (shape in ('heart','classic','round','shield')),
  material text not null,
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  engraving text not null check (char_length(engraving) between 1 and 24),
  engraving_style text not null default 'serif',
  decoration text not null default 'none',
  effect text not null default 'none',
  lock_date date not null default current_date,
  title text not null default '' check (char_length(title) <= 60),
  category text not null default 'love',
  visibility text not null check (visibility in ('private','unlisted','public','invite_only','scheduled')),
  available_at timestamptz,
  expires_at timestamptz,
  slot integer not null unique check (slot >= 0),
  status text not null default 'active' check (status in ('active','hidden')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visibility <> 'scheduled' or available_at is not null)
);
create index locks_owner_idx on public.locks(owner_id);
create index locks_listing_idx on public.locks(visibility, status, created_at desc);

create table public.lock_stories (
  lock_id uuid primary key references public.locks(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  signature text not null default ''
);

create table public.puzzles (
  lock_id uuid primary key references public.locks(id) on delete cascade,
  type text not null check (type in ('pin','riddle')),
  public_config jsonb not null,
  secret_config jsonb not null,   -- bcrypt(hmac(pepper, answer)) hashes only
  hints jsonb not null default '[]',
  max_attempts integer not null default 10 check (max_attempts between 3 and 50)
);

create table public.puzzle_attempts (
  id bigint generated always as identity primary key,
  lock_id uuid not null references public.locks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  ip_hash text not null default '',
  success boolean not null,
  hints_used integer not null default 0,
  created_at timestamptz not null default now()
);
create index attempts_lock_actor_idx on public.puzzle_attempts(lock_id, actor_id, created_at);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  lock_id uuid not null references public.locks(id) on delete cascade,
  token_hash text not null unique,  -- sha256(token); the token itself is shown to the owner once
  created_by uuid not null references public.profiles(id) on delete cascade,
  label text not null default '',
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0,
  open_count integer not null default 0,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.unlock_events (
  id bigint generated always as identity primary key,
  lock_id uuid not null references public.locks(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  invitation_id uuid references public.invitations(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lock_id, actor_id)
);

create table public.reactions (
  lock_id uuid not null references public.locks(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('heart','tears','smile','sparkle')),
  created_at timestamptz not null default now(),
  primary key (lock_id, actor_id)
);

create table public.reports (
  id bigint generated always as identity primary key,
  lock_id uuid not null references public.locks(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason text not null check (reason in ('harassment','hate','sexual','personal_info','spam','other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now(),
  unique (lock_id, reporter_id)
);

create table public.moderation_actions (
  id bigint generated always as identity primary key,
  lock_id uuid not null,
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table public.xp_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  ref_id text not null,
  xp integer not null,
  created_at timestamptz not null default now(),
  unique (profile_id, reason, ref_id)
);

create table public.user_achievements (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (profile_id, achievement_id)
);

create table public.rewards (
  id text primary key,
  kind text not null check (kind in ('material','engraving_style','effect','theme')),
  ref text not null,
  label text not null,
  required_level integer not null default 1,
  seasonal boolean not null default false
);
insert into public.rewards values
  ('material:frost','material','frost','Winter Frost',2,true),
  ('material:crystal','material','crystal','Crystal',3,false),
  ('engraving:deco','engraving_style','deco','Art Deco',2,false);

create table public.user_rewards (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reward_id text not null references public.rewards(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (profile_id, reward_id)
);

create table public.lock_inspections (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  lock_id uuid not null references public.locks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, lock_id)
);

create table public.daily_challenges (
  date date not null,
  challenge_id text not null,
  title text not null,
  metric text not null,
  target integer not null,
  primary key (date, challenge_id)
);

create table public.daily_challenge_claims (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  challenge_id text not null,
  claimed_at timestamptz not null default now(),
  primary key (profile_id, date, challenge_id)
);

create table public.analytics_events (
  id bigint generated always as identity primary key,
  name text not null,
  profile_id uuid,
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.locks enable row level security;
alter table public.lock_stories enable row level security;          -- no client policies: functions only
alter table public.puzzles enable row level security;               -- no client policies: functions only
alter table public.puzzle_attempts enable row level security;       -- no client policies
alter table public.invitations enable row level security;
alter table public.unlock_events enable row level security;
alter table public.reactions enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;    -- admins via functions only
alter table public.blocks enable row level security;
alter table public.friendships enable row level security;
alter table public.xp_events enable row level security;
alter table public.user_achievements enable row level security;
alter table public.rewards enable row level security;
alter table public.user_rewards enable row level security;
alter table public.lock_inspections enable row level security;
alter table public.daily_challenges enable row level security;
alter table public.daily_challenge_claims enable row level security;
alter table public.analytics_events enable row level security;

-- Profiles: you can read and edit your own row. Others' display names are exposed only via public_locks view.
create policy profiles_self_select on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid());
-- xp / is_admin / is_guest must not be client-editable:
revoke update on public.profiles from authenticated;
grant update (display_name, avatar, show_name_on_locks) on public.profiles to authenticated;

-- Locks: appearance metadata only. Owners see all of theirs; others see live, non-private locks.
create policy locks_read on public.locks for select using (
  owner_id = auth.uid()
  or (status = 'active' and visibility <> 'private' and (expires_at is null or expires_at > now())
      and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = locks.owner_id))
);
-- Inserts go through create_lock() (needs hashing + slot assignment); owners may edit cosmetic fields / delete.
create policy locks_owner_update on public.locks for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy locks_owner_delete on public.locks for delete using (owner_id = auth.uid());
revoke update on public.locks from authenticated;
grant update (shape, material, color, engraving, engraving_style, decoration, effect, lock_date, title, category,
  visibility, available_at, expires_at, updated_at) on public.locks to authenticated;

create policy invitations_owner_read on public.invitations for select using (created_by = auth.uid());
create policy invitations_owner_revoke on public.invitations for update using (created_by = auth.uid()) with check (created_by = auth.uid());
revoke update on public.invitations from authenticated;
grant update (revoked) on public.invitations to authenticated;

create policy unlocks_self_read on public.unlock_events for select using (actor_id = auth.uid());
create policy reactions_read on public.reactions for select using (true);
create policy reactions_write on public.reactions for insert with check (
  actor_id = auth.uid() and exists (select 1 from public.unlock_events u where u.lock_id = reactions.lock_id and u.actor_id = auth.uid()));
create policy reactions_update on public.reactions for update using (actor_id = auth.uid()) with check (actor_id = auth.uid());
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid());
create policy blocks_self on public.blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy friendships_party on public.friendships for select using (auth.uid() in (requester_id, addressee_id));
create policy xp_self on public.xp_events for select using (profile_id = auth.uid());
create policy achievements_self on public.user_achievements for select using (profile_id = auth.uid());
create policy rewards_read on public.rewards for select using (true);
create policy user_rewards_self on public.user_rewards for select using (profile_id = auth.uid());
create policy inspections_self on public.lock_inspections for select using (profile_id = auth.uid());
create policy challenges_read on public.daily_challenges for select using (true);
create policy claims_self on public.daily_challenge_claims for select using (profile_id = auth.uid());
create policy analytics_insert on public.analytics_events for insert with check (profile_id is null or profile_id = auth.uid());

-- ---------- helpers ----------
create or replace function private.hash_answer(answer text) returns text
language sql security definer set search_path = '' as $$
  select extensions.crypt(
    encode(extensions.hmac(answer, (select value from private.settings where key = 'pepper'), 'sha256'), 'hex'),
    extensions.gen_salt('bf', 10));
$$;

create or replace function private.check_answer(answer text, stored text) returns boolean
language sql security definer set search_path = '' as $$
  select stored = extensions.crypt(
    encode(extensions.hmac(answer, (select value from private.settings where key = 'pepper'), 'sha256'), 'hex'), stored);
$$;

create or replace function private.normalize_answer(raw text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(lower(extensions.unaccent(coalesce(raw, ''))), '[^[:alnum:][:space:]]', ' ', 'g'), '\s+', ' ', 'g'));
$$;
-- requires: create extension if not exists unaccent with schema extensions;

-- New auth user => profile row (anonymous sign-ins become guests).
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, is_guest)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Wanderer #' || (1000 + floor(random() * 9000))::int), coalesce(new.is_anonymous, false));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- ---------- secure RPCs ----------
-- Unlock: rate-limits, checks the answer server-side and returns the story only on success.
create or replace function public.attempt_unlock(p_lock_id uuid, p_token text, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_lock public.locks;
  v_inv public.invitations;
  v_puzzle public.puzzles;
  v_fails int;
  v_burst int;
  v_ok boolean := false;
  v_hash text;
  v_story public.lock_stories;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_token is not null then
    select * into v_inv from public.invitations where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
    if not found or v_inv.revoked or (v_inv.expires_at is not null and v_inv.expires_at <= now()) then
      raise exception 'invalid_invitation' using errcode = 'P0002'; end if;
    p_lock_id := v_inv.lock_id;
  end if;
  select * into v_lock from public.locks where id = p_lock_id;
  if not found or v_lock.status <> 'active' or v_lock.visibility = 'private'
     or (v_lock.expires_at is not null and v_lock.expires_at <= now()) then
    raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_lock.owner_id = v_uid then raise exception 'own_lock'; end if;
  if exists (select 1 from public.unlock_events where lock_id = v_lock.id and actor_id = v_uid) then
    select * into v_story from public.lock_stories where lock_id = v_lock.id;
    return jsonb_build_object('success', true, 'story', jsonb_build_object('title', v_lock.title, 'body', v_story.body, 'signature', v_story.signature));
  end if;
  if v_lock.visibility = 'scheduled' and v_lock.available_at > now() then raise exception 'not_yet_open'; end if;
  if v_lock.visibility in ('unlisted','invite_only') and v_inv.id is null then raise exception 'invite_required'; end if;
  if v_inv.id is not null and v_inv.max_uses is not null and v_inv.use_count >= v_inv.max_uses then raise exception 'invitation_used'; end if;
  if exists (select 1 from public.blocks where blocker_id = v_lock.owner_id and blocked_id = v_uid) then raise exception 'blocked'; end if;

  select * into v_puzzle from public.puzzles where lock_id = v_lock.id;
  select count(*) into v_fails from public.puzzle_attempts
    where lock_id = v_lock.id and actor_id = v_uid and not success and created_at > now() - interval '24 hours';
  if v_fails >= v_puzzle.max_attempts then
    return jsonb_build_object('success', false, 'attemptsRemaining', 0, 'retryAfterSeconds', 86400); end if;
  select count(*) into v_burst from public.puzzle_attempts
    where lock_id = v_lock.id and actor_id = v_uid and not success and created_at > now() - interval '10 minutes';
  if v_burst >= 5 then return jsonb_build_object('success', false, 'retryAfterSeconds', 600); end if;

  if v_puzzle.type = 'pin' then
    v_ok := private.check_answer(btrim(p_answer), v_puzzle.secret_config->>'hash');
  else
    for v_hash in select jsonb_array_elements_text(v_puzzle.secret_config->'hashes') loop
      v_ok := v_ok or private.check_answer(private.normalize_answer(p_answer), v_hash);
    end loop;
  end if;

  insert into public.puzzle_attempts (lock_id, actor_id, success) values (v_lock.id, v_uid, v_ok);
  if not v_ok then
    return jsonb_build_object('success', false, 'attemptsRemaining', v_puzzle.max_attempts - v_fails - 1);
  end if;
  if v_inv.id is not null then
    update public.invitations set use_count = use_count + 1
      where id = v_inv.id and (max_uses is null or use_count < max_uses);
    if not found then raise exception 'invitation_used'; end if;
  end if;
  insert into public.unlock_events (lock_id, actor_id, invitation_id) values (v_lock.id, v_uid, v_inv.id) on conflict do nothing;
  insert into public.xp_events (profile_id, reason, ref_id, xp) values (v_uid, 'solve_lock', v_lock.id::text, 30) on conflict do nothing;
  if found then update public.profiles set xp = xp + 30 where id = v_uid; end if;
  select * into v_story from public.lock_stories where lock_id = v_lock.id;
  return jsonb_build_object('success', true, 'story', jsonb_build_object('title', v_lock.title, 'body', v_story.body, 'signature', v_story.signature));
end $$;

-- Owner or a past solver can re-read the story.
create or replace function public.get_story(p_lock_id uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('title', l.title, 'body', s.body, 'signature', s.signature)
  from public.locks l join public.lock_stories s on s.lock_id = l.id
  where l.id = p_lock_id and (l.owner_id = auth.uid()
    or exists (select 1 from public.unlock_events u where u.lock_id = l.id and u.actor_id = auth.uid()));
$$;

-- create_lock(): mirrors POST /api/locks (validation, slot assignment, hashing, share invitation).
-- Implemented as an Edge Function (supabase/functions/create-lock) in the next phase so validation
-- can reuse shared/validation.ts; see ROADMAP.md.

revoke all on function public.attempt_unlock(uuid, text, text) from public;
grant execute on function public.attempt_unlock(uuid, text, text) to authenticated;
revoke all on function public.get_story(uuid) from public;
grant execute on function public.get_story(uuid) to authenticated;
