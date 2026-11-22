# Deployment

## Single process (Replit, Render, Fly, a VPS)

```bash
npm ci
npm run build
SERVER_PEPPER=<32+ random bytes, base64> ADMIN_EMAILS=you@example.com TRUST_PROXY=1 npm start
```

- `npm start` serves the API and `dist/` on `$PORT` (default 8787) with security headers and a strict CSP.
- Persist the `DB_PATH` file (default `data/lovelocks.db`) on a volume. **Set `SERVER_PEPPER` explicitly in production and never change it** (changing it invalidates every puzzle).
- `TRUST_PROXY=1` only behind a trusted reverse proxy (needed for per-IP limits).
- `ADMIN_EMAILS` grants moderator access to accounts registered with those emails.

- `SEED_DEMO=1` re-creates the three labeled demo locks on an empty database.
- `npm start` runs `node --experimental-sqlite --import tsx server/index.ts`, which works on Node 22.6+ and 24.

### Replit

The repo includes a `.replit` file (Node 22, port 8787 → 80, Reserved VM deployment, `TRUST_PROXY=1`, `SEED_DEMO=1`).

1. On replit.com, choose **Create Repl → Import from GitHub** and pick `AbdElrahman08/love-locks`.
2. In **Secrets**, add `SERVER_PEPPER` (generate it with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). Add the Supabase Session pooler URI as `SUPABASE_DATABASE_URL` (it can coexist with Replit's reserved `DATABASE_URL`). Optionally add `ADMIN_EMAILS`.
3. Press **Run** to preview, then **Deploy → Reserved VM → Deploy**.

> ⚠️ **Data persistence.** Replit deployments do not keep files across redeploys. **Add `SUPABASE_DATABASE_URL` (Supabase, below) to Replit Secrets** so players and locks live in Postgres. Without it the app falls back to SQLite, which resets on every redeploy.

## Supabase (persistent production database)

1. Create a project at supabase.com and pick a region close to your players.
2. **Project → Connect → Session pooler** and copy the URI. Replace `[YOUR-PASSWORD]` with the database password.
3. Set `SUPABASE_DATABASE_URL` to that URI in Replit Secrets. Locally, either `SUPABASE_DATABASE_URL` or `DATABASE_URL` works. Keep `SERVER_PEPPER` set.
4. Start the server. It applies `supabase/migrations/0001_init.sql` (idempotently), seeds rewards and, with `SEED_DEMO=1`, the demo locks. The log shows `database: Postgres (SUPABASE_DATABASE_URL at <host>)`.

The database password is a secret: never commit it, and never use the Supabase **service-role** key in the browser. Optionally set `DATABASE_SSL_CA` to Supabase's CA certificate (Project Settings → Database → SSL) for full certificate verification.

## Mobile (Capacitor)

The app is a static SPA calling a same-origin API, so it wraps without changes once the API URL is absolute:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "Love Locks" com.lovelocks.app --web-dir dist
# set VITE_PUBLIC_URL=https://your-domain and make src/lib/api.ts prefix requests with it
npm run build && npx cap add android && npx cap sync
```

Invitation links should stay **web** links so recipients never need the app (Universal/App Links can open the app when installed).

## Checklist before a public beta

- [ ] HTTPS everywhere; HSTS at the proxy
- [ ] `SERVER_PEPPER` set and backed up in a secret manager
- [ ] DB backups (daily) + restore drill
- [ ] Admin account created; moderation response process defined
- [ ] Sentry DSN configured
- [ ] Privacy policy + terms reviewed: drafts exist at `/privacy` and `/terms`. Set `VITE_CONTACT_EMAIL` (a build-time variable, so add it to Replit Secrets **before** deploying), then set `LEGAL_DRAFT = false` in `src/screens/LegalScreen.tsx`
