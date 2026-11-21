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
2. In **Secrets**, add `SERVER_PEPPER` (generate it with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). Optionally add `ADMIN_EMAILS`.
3. Press **Run** to preview, then **Deploy → Reserved VM → Deploy**.

> ⚠️ **Data persistence.** Replit deployments do not keep files across redeploys. The SQLite database (players, locks, stories) resets each time you redeploy. That's fine for a demo or closed beta, but moving to Supabase/Postgres (see below) is required before a public launch.

## Supabase (target production backend)

See CONNECTORS.md. Apply `supabase/migrations/0001_init.sql`, then point the client adapter at Supabase. The static `dist/` can then be hosted on any CDN.

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
- [ ] Privacy policy + terms published (guidelines page exists)
