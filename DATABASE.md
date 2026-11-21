# Database

Two implementations of the same schema:

- `server/db.ts`: SQLite (via `node:sqlite`). Used when `DATABASE_URL` is empty (local development).
- `supabase/migrations/0001_init.sql`: PostgreSQL / Supabase. Used when `DATABASE_URL` is set; the server applies it on boot.

Both sit behind the async `Sql` interface in `server/sql.ts`. The API writes SQLite-flavoured SQL and the Postgres adapter translates placeholders, `INSERT OR IGNORE` and aggregates, so the business logic exists once. The full API suite runs against both engines.

**Access model on Supabase:** only the API server talks to the database (as `postgres`). Every table has RLS enabled with **no policies**, and `anon`/`authenticated` have no privileges, so the public Data API and anon key can read nothing. The last column below describes what the API allows; direct database access is denied to everyone except the server.

## Tables

| Table | Purpose | Sensitive? | What the API allows |
|---|---|---|---|
| `profiles` | display name, avatar, guest flag, XP, privacy toggle, admin flag | email and scrypt+pepper password hash | own row only; only cosmetic columns are updatable |
| `sessions` | SHA-256 of bearer session tokens | yes | never exposed |
| `locks` | appearance, title, category, visibility, schedule, expiry, **slot (UNIQUE)**, status, is_demo | no | owner: all; others: live, non-private, not blocked |
| `lock_stories` | story body + signature | **yes** | **only** after a correct answer (`/api/unlock`), or to the owner / a past solver |
| `puzzles` | `public_config` (pin length / question), `secret_config` (hashes), hints, max attempts | **yes** | **none** |
| `puzzle_attempts` | every attempt: lock, actor, ip hash, success, hints used | yes | none |
| `invitations` | SHA-256(token), max uses, use count, open count, expiry, revoked | token hash | owner read; owner can set `revoked` |
| `unlock_events` | who opened which lock (UNIQUE lock + actor) | — | own rows |
| `reactions` | one reaction per person per lock | — | read all; insert only after unlocking |
| `reports` | UNIQUE reporter + lock | — | insert own |
| `moderation_actions` | audit log of hides/restores (incl. automatic) | — | admins via server |
| `blocks` | blocker → blocked | — | own rows |
| `friendships` | prepared for the social roadmap | — | parties |
| `xp_events` | **UNIQUE (profile, reason, ref)**: idempotent XP and anti-farming | — | own rows |
| `user_achievements`, `rewards`, `user_rewards` | progression and cosmetics | — | own rows / catalog |
| `lock_inspections` | first inspection of each lock (Explorer achievement) | — | own rows |
| `daily_challenges`, `daily_challenge_claims` | deterministic daily set + claims | — | read / own rows |
| `analytics_events` | first-party funnel events | — | insert own |

## Relationships

`profiles 1─* locks 1─1 lock_stories`, `locks 1─1 puzzles`, `locks 1─* invitations`, `locks 1─* puzzle_attempts`, `locks 1─* unlock_events *─1 profiles`.
Deleting a profile **cascades** to its locks, stories, puzzles, invitations, reactions, sessions and progress (account deletion). Attempts and reports keep a `NULL` actor for audit.

## Indexes

`locks(owner_id)`, `locks(visibility, status, created_at)`, `puzzle_attempts(lock_id, actor_id, created_at)` and `(lock_id, ip_hash, created_at)` for the rate-limit queries, `invitations(lock_id)`, `analytics_events(name, created_at)`, plus every UNIQUE constraint.

## Bridge slots

`slot = ((span × 2 + side) × 5 + row) × 24 + col` gives 1,680 slots per bridge. The server picks a random free slot, optionally within the span the player chose. Adding more bridges later means adding a `bridge_id` column to the uniqueness key.
