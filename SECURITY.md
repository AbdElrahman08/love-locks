# Security & privacy

## Threats and mitigations

| Threat | Mitigation | Verified by |
|---|---|---|
| Reading a story without solving | Stories are only returned by `/api/unlock` (correct answer), `/api/locks/:id/story` (owner or past solver). Never in listings. | `api.test.ts` Journey B/D, "never returns puzzle secrets" |
| Reading puzzle answers | Only hashes stored: `scrypt(HMAC-SHA256(pepper, answer), salt)`. Pepper lives outside the DB (`SERVER_PEPPER` / `data/.pepper`). Public view exposes only PIN length / question. | tests grep responses for answers, `s1$`, `secret` |
| Brute-forcing a PIN | Per person+lock: `maxAttempts` (3–50) fails / 24 h and 5 fails / 10 min; per IP+lock 30 / h; per lock 300 / h; per IP 40 unlock calls / min; guest creation 20 / h per IP. 4-digit PIN ⇒ days, not minutes. | Journey C |
| Offline cracking after a DB leak | Pepper is not in the DB; scrypt is memory-hard. | design |
| Guessing invitation links | 256-bit random tokens; only SHA-256 stored; revocable; optional use limit and expiry; never derived from DB ids. | Journey D (forged token, lock id as token, revoked) |
| Token leakage via Referer | `Referrer-Policy: no-referrer` on the web app. | prod smoke test |
| Editing/deleting others' locks | Ownership checks on every mutating route (404 to avoid probing). | Journey D |
| Unlisted/invite-only discovery | Bridge shows only appearance; details need an invitation or prior unlock. | Journey D |
| XP farming | `xp_events` UNIQUE(profile, reason, ref) + daily caps; owners earn "receive unlock" XP only from registered solvers. | inspection test |
| Abuse / harassment | Report → auto-hide after 3 distinct reporters → moderator review; block creator; guidelines page; links banned in engravings/titles. | moderation test |
| XSS | React escapes all user text; no `dangerouslySetInnerHTML`; strict CSP (`script-src 'self'`). | prod CSP check |
| Path traversal (static) | Resolved path must stay inside `dist/`, else SPA shell. | prod smoke test |
| Oversized requests | 64 KB JSON body limit; field length limits in `shared/validation.ts`. | validation tests |

## Privacy

- No location data is ever collected. Analytics are first-party and contain no free text.
- Email is never exposed to other players; creators can hide their name on locks (`showNameOnLocks`).
- Account deletion removes the profile and all owned content (cascade).
- Workshop drafts are stored locally **without** PIN/answers.

## Production hardening still to do (tracked in ROADMAP)

- Connect the live Supabase project (code ready: `DATABASE_URL`). Its Data API is locked out by RLS with no policies plus revoked privileges; verify with the anon-key check in TESTING.md.
- Move accounts to Supabase Auth (email verification, password reset, OAuth).
- Distributed rate limiting (the in-memory limiters are per-process; DB-backed attempt limits already work across processes).
- Content moderation assist (keyword/ML pre-screen of titles and stories), age gate per jurisdiction, abuse reporting SLA.
- Sentry with PII scrubbing; dependency scanning in CI.
