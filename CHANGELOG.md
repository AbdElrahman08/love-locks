# Changelog

## 0.2.0: Supabase-ready storage (2026-11-21)

- The API now runs on **Supabase Postgres** when `DATABASE_URL` is set and on local SQLite otherwise, behind one async `Sql` layer (`server/sql.ts`).
- Rewrote `supabase/migrations/0001_init.sql` to match the server schema. It is applied idempotently on boot, with RLS on and no policies so the public Data API is locked out.
- The test suite runs journeys A–D on both SQLite and real Postgres (PGlite): 38 tests.
- Replit: `.replit` config, a Node 22–compatible start command, and `SEED_DEMO=1` self-seeding.

## 0.1.0: MVP (2026-11-21)

### Added
- Procedural 3D Paris bridge (Babylon.js) with quality tiers, auto-quality, orbit/walk cameras, lock inspection and WebGL fallback.
- Lock workshop with live 3D preview, 4 shapes, 7 materials, colors, engravings, decorations and effects.
- Puzzle engine (PIN, riddle) with server-side validation, hints, attempt limits and rate limiting.
- Invitation links (256-bit, hashed, revocable, use-limited, expiring) and a lightweight mobile recipient page.
- Story reveal experience with reactions, reduced-motion support and an optional chime.
- Guest-first auth with email registration (guest upgraded in place), profiles, XP, achievements and daily challenges.
- Reporting, auto-hide, moderation screen, blocking, account deletion and community guidelines.
- First-party analytics funnel; admin metrics.
- Local backend (node:sqlite) and Supabase migration with RLS.
- 22 automated tests covering user journeys A–D; documentation set.

### Fixed during QA
- The dev API took the host's `PORT`; it is now pinned to 8787 in dev.
- The reflection probe never applied, so metals rendered black; replaced with a procedural environment cube with precomputed harmonics, which also removed async errors on unmount.
- "Auto" quality chose the high tier on weak integrated GPUs; detection is now GPU-aware with an FPS-based step-down.
- Portrait camera framing, old-style numerals in stats, and an emoji unsupported on Windows 10.
