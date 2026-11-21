# Connectors & integrations

Status as inspected on 2026-11-21 from the Claude Code session that built the MVP.

| Integration | Status | What was done | Next step |
|---|---|---|---|
| **Supabase** | ❌ Not available: no Supabase connector or CLI in the environment | Full Postgres schema + RLS + `attempt_unlock` / `get_story` RPCs written in `supabase/migrations/0001_init.sql`; app runs on an equivalent local SQLite backend | Create a Supabase project → `supabase link` → `supabase db push` → enable anonymous sign-ins → insert pepper into `private.settings` → run RLS test plan (TESTING.md) → add `supabase` adapter in `src/lib/api.ts` |
| **Replit** | ⚠️ Connector connected, but it builds apps from natural-language prompts. It does not import an existing codebase. | Not used, to avoid creating a divergent copy | Import this repo from GitHub in Replit (`npm install && npm run build && npm start`; Replit sets `PORT`). See DEPLOYMENT.md |
| **GitHub** | ⚠️ Plugin server failed to connect ("Authorization header is badly formatted"); a separate GitHub connector is available | Local git repository initialised with a clean history | Choose a repo name/visibility, then push (not done automatically: creating a public/private repo is your call) |
| **Figma** | ✅ Connector connected | Design system implemented in code and documented in DESIGN.md | Optionally mirror DESIGN.md tokens + key screens into a Figma file |
| **Sentry** | Not configured | `VITE_SENTRY_DSN` reserved in `.env.example`; CSP already allows `*.sentry.io` | Add `@sentry/react` init when a DSN exists |
| **PostHog** | Not configured | First-party analytics endpoint stores the full funnel (`/api/analytics`, visible in `/admin`) | Forward events in `src/lib/analytics.ts` when `VITE_POSTHOG_KEY` is set |

## Secrets policy

- Never commit `.env`, `data/` (contains the DB and the pepper) or Supabase service-role keys. `.gitignore` covers these.
- The browser only ever receives public values (`VITE_*`). The Supabase **anon** key is public by design; the service-role key must stay server-side.
