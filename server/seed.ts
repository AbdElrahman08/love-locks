// Seeds a few clearly labeled DEMO locks so a fresh install has something to explore and test.
// Their answers are documented in README.md. Run: npm run seed
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { openDb } from './db.ts';
import { createApi } from './app.ts';

const db = openDb(process.env.DB_PATH ?? 'data/lovelocks.db');
if ((db.prepare('SELECT count(*) AS c FROM locks WHERE is_demo = 1').get() as { c: number }).c > 0) {
  console.log('Demo locks already present — nothing to do.');
  process.exit(0);
}
const pepper = process.env.SERVER_PEPPER ?? (existsSync('data/.pepper') ? readFileSync('data/.pepper', 'utf8').trim() : '');
if (!pepper) { console.error('Start the server once (npm run dev) so data/.pepper exists, then seed.'); process.exit(1); }

const api = createApi({ db, pepper });
const server = createServer(async (req, res) => { await api(req, res); });
await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const call = async (path: string, token: string | null, body: unknown) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j;
};

const { token, profile } = await call('/api/auth/guest', null, {});
db.prepare("UPDATE profiles SET display_name = 'Love Locks Team', avatar = '🗼', is_guest = 0 WHERE id = ?").run(profile.id);

const demos = [
  {
    shape: 'heart', material: 'gold', color: '#e8c27a', engraving: 'Bienvenue', engravingStyle: 'script', decoration: 'hearts', effect: 'glow',
    title: 'Welcome to the bridge', category: 'love', visibility: 'public', preferredSpan: 3,
    story: 'Welcome, wanderer.\nEvery lock on this bridge holds a story that only the right answer can open. You just opened your first one.\nNow it is your turn: make a lock, hide a memory inside, and send the key to someone who matters.',
    signature: 'The Love Locks Team',
    puzzle: { type: 'riddle', question: 'What city is this bridge inspired by?', answers: ['Paris'], hints: ['The city of light', 'It has a famous iron tower'] },
  },
  {
    shape: 'classic', material: 'silver', color: '#d9dde3', engraving: '1804', engravingStyle: 'block', decoration: 'stars', effect: 'none',
    title: 'The year the first iron bridge crossed here', category: 'puzzle', visibility: 'public', preferredSpan: 2,
    story: 'The original iron footbridge on this spot opened in 1804 — one of the first iron bridges in France. The lock you see is a demo of a PIN puzzle.',
    signature: 'Demo lock',
    puzzle: { type: 'pin', pin: '1804', hints: ['Engravings can be clues.'] },
  },
  {
    shape: 'round', material: 'bronze', color: '#b9773f', engraving: 'Merci', engravingStyle: 'serif', decoration: 'vines', effect: 'sparkle',
    title: 'A thank-you note', category: 'gratitude', visibility: 'public', preferredSpan: 4,
    story: 'Thank you for testing Love Locks. Gratitude locks are a lovely way to thank a teacher, a friend or a stranger who once helped you.',
    signature: 'Demo lock',
    puzzle: { type: 'riddle', question: 'How do you say “thank you” in French?', answers: ['merci', 'merci beaucoup'], hints: [] },
  },
];
for (const d of demos) {
  const r = await call('/api/locks', token, { ...d, lockDate: '2026-11-21' });
  db.prepare('UPDATE locks SET is_demo = 1 WHERE id = ?').run(r.lock.id);
  console.log(`Seeded demo lock “${d.title}” → /lock/${r.lock.id}`);
}
server.close();
