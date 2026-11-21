# Testing

## Automated (`npm test`): 38 tests, all passing (2026-11-21)

The API suite runs **twice**: on SQLite and on real Postgres (PGlite, the Postgres engine compiled to WASM, loaded with the Supabase migration). `tests/sql.test.ts` covers the SQLite→Postgres translation.

`tests/api.test.ts` starts the real HTTP API on an in-memory database with a controllable clock:

| Journey | What is asserted |
|---|---|
| **A: Create a lock** | validation errors; slot assigned and present on `/api/bridge`; share link format; +50 XP and `first_lock`; story not echoed back; level-gated material refused |
| **B: Unlock via invitation** | invitation view hides story and answers; hint delivery; riddle answer normalization (`"  PONT dès ARTS!! "`); story revealed and re-readable; appears in "stories I opened"; single-use invitation consumed (410 for others); owner sees use count |
| **C: Invalid attempts** | malformed PIN rejected; 5 wrong answers stay sealed with decreasing `attemptsRemaining`; burst limit (429); daily budget (429 with `retryAfterSeconds`); story endpoint 403; owner sees attempt count; works again after 24 h |
| **D: Unauthorized access** | private lock 404 / story 403 / not on bridge; unlisted needs link; cannot PATCH/DELETE/list invitations of others; forged token and lock-id-as-token fail; no session → 401; admin routes 403; revoked link dead; no listing contains answers, hashes or stories |
| Accounts & safety | guest → account upgrade keeps locks; wrong password 401; 3 reports auto-hide and moderator restores; blocking hides creator; inspection XP not repeatable; account deletion removes locks and invalidates session; guest-creation rate limit |

`tests/validation.test.ts` covers answer normalization, PIN/riddle rules, scheduled dates, link and control-character stripping, the level curve and daily challenge determinism.

## Manual, in a real browser (built-in browser pane, 2026-11-21)

| Check | Result |
|---|---|
| Landing renders the 3D bridge behind the hero (desktop) | ✅ |
| Bridge: feed cards → camera flies to lock, selection ring, detail sheet, +5 XP inspect | ✅ |
| Workshop: all 6 steps, 3D preview updates, publish → +50 XP, "First Lock", share link | ✅ |
| Invitation on mobile viewport (375×812): no Babylon download, wrong answer → sealed + 9 attempts left, hint, `STRAWBERRIES!` accepted, story reveal | ✅ |
| Stranger reusing a single-use link → 410; direct lock/story access → 403 | ✅ |
| Profile on mobile: stats, my locks with open/attempt counts | ✅ |
| Production build (`npm start`) with strict CSP: 3D works, zero console errors, path traversal → SPA shell | ✅ |
| Frame cost on Intel HD 4600: ~2 ms (low tier), ~9 ms (high tier) | ✅ |

## Not yet tested (honest gaps)

- **Live Supabase project (`whpevlfnkemjfetvcxrh`)**: lock-out verified on 2026-11-21. 21 tables have RLS on, 0 policies and 0 grants to `anon`/`authenticated`. With a canary story inserted, the anon key got `401 permission denied` reading `lock_stories`, `locks`, `puzzles`, `profiles` and inserting into `lock_stories`; the canary was then deleted. The security advisor shows only the expected INFO "RLS enabled, no policy". **Not yet done:** running the game server itself against the hosted database (needs `DATABASE_URL` with the database password).
- Real Android/iOS devices and Capacitor builds (only emulated mobile viewport so far).
- Screen-reader pass (semantic labels and `aria-live` are in place; not audited with NVDA/VoiceOver).
- Load testing of the unlock endpoint.
