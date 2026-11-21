// Entry point: serves the JSON API and (in production) the built web app from dist/.
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, createReadStream } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import { openDb } from './db.ts';
import { createApi } from './app.ts';
import { seedDemoLocks } from './seed.ts';

loadDotEnv();

// In dev the API always sits on 8787 behind Vite's proxy (hosts like Replit set PORT for the web port).
const PORT = process.argv.includes('--dev') ? Number(process.env.API_PORT ?? 8787) : Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.DB_PATH ?? 'data/lovelocks.db';
const DIST = resolve('dist');

function loadDotEnv() {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/** The pepper must never live in the database. In dev it is generated once into data/.pepper (gitignored). */
function getPepper(): string {
  if (process.env.SERVER_PEPPER) return process.env.SERVER_PEPPER;
  const file = 'data/.pepper';
  mkdirSync('data', { recursive: true });
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('base64url'), { mode: 0o600 });
  return readFileSync(file, 'utf8').trim();
}

const db = openDb(DB_PATH);
const pepper = getPepper();
// Hosted deployments may start from an empty disk; SEED_DEMO=1 restores the labeled demo locks.
if (process.env.SEED_DEMO === '1') {
  seedDemoLocks(db, pepper).then((n) => n && console.log(`[love-locks] seeded ${n} demo locks`)).catch((e) => console.error('[love-locks] demo seed failed', e));
}
const api = createApi({
  db,
  pepper,
  adminEmails: (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === '1',
});

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co https://*.posthog.com https://*.sentry.io",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join('; ');

const server = createServer(async (req, res) => {
  if (await api(req, res)) return;
  // Static hosting of the built SPA.
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer'); // invitation tokens live in URLs — never leak them via Referer
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  if (!existsSync(DIST)) {
    res.statusCode = 404;
    res.end('Web app not built. Run `npm run build`, or use `npm run dev` for development.');
    return;
  }
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = normalize(join(DIST, pathname));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
  if (file.includes(`${join(DIST, 'assets')}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`[love-locks] API${existsSync(DIST) ? ' + web' : ''} on http://localhost:${PORT}`));
