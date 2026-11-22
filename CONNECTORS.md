# Connectors & integrations

Status as inspected on 2026-11-21 from the Claude Code session that built the MVP.

| Integration | Status | What was done | Next step |
|---|---|---|---|
| **Supabase** | ✅ Connected. Project `love-locks` (ref `whpevlfnkemjfetvcxrh`, Frankfurt `eu-central-1`, free tier), migration `0001_init` applied 2026-11-21 | The API prefers `SUPABASE_DATABASE_URL` (use this in Replit, where `DATABASE_URL` may be reserved), then falls back to `DATABASE_URL`. It applies `supabase/migrations/0001_init.sql` on boot (idempotent), and every table has RLS on with no policies plus privileges revoked from `anon`/`authenticated`. The same journeys A–D pass on real Postgres (PGlite) in CI. | Create a project → copy the **Session pooler** URI → set `SUPABASE_DATABASE_URL` (+ `SERVER_PEPPER`) in Replit Secrets → start the server. Later: Supabase Auth for OAuth/email verification |
| **Replit** | ⚠️ Connector connected, but it builds apps from natural-language prompts. It does not import an existing codebase. | `.replit` config committed (build, start, Reserved VM) | Import the GitHub repo in Replit, add `SERVER_PEPPER` + `SUPABASE_DATABASE_URL` secrets, Deploy. See DEPLOYMENT.md |
| **GitHub** | ✅ Code pushed to `AbdElrahman08/love-locks` (`main`) | The connector can read the account but can't create repos (403), so the repo was created manually and pushed with git | Keep pushing with `git push`; enable branch protection when collaborators join |
| **Figma** | ✅ Connector connected | Design system implemented in code and documented in DESIGN.md | Optionally mirror DESIGN.md tokens + key screens into a Figma file |
| **Sentry** | Not configured | `VITE_SENTRY_DSN` reserved in `.env.example`; CSP already allows `*.sentry.io` | Add `@sentry/react` init when a DSN exists |
| **PostHog** | Not configured | First-party analytics endpoint stores the full funnel (`/api/analytics`, visible in `/admin`) | Forward events in `src/lib/analytics.ts` when `VITE_POSTHOG_KEY` is set |

## Secrets policy

- Never commit `.env`, `data/` (contains the DB and the pepper) or Supabase service-role keys. `.gitignore` covers these.
- The browser only ever receives public values (`VITE_*`). The Supabase **anon** key is public by design; the service-role key must stay server-side.
