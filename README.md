# Love Locks – The Bridge of Memories

*Every lock holds a story.*

Love Locks is a 3D web game inspired by the love-lock bridge in Paris. Players design a lock, hide a personal story inside it behind a puzzle (a PIN or a riddle), hang it on a virtual bridge over the Seine, and send the "key" (an invitation link) to someone. The recipient opens the link in any mobile browser, with no install and no sign-up, solves the puzzle, and the story is revealed.

> This is a **virtual** bridge. Never attach physical locks to real bridges or monuments.

## Quick start

Requirements: **Node.js ≥ 22.5** (the local backend uses the built-in `node:sqlite`). Tested on Node 24.

```bash
npm install
npm run dev        # web on http://localhost:5173, API on :8787 (proxied)
npm run seed       # optional: adds 3 clearly labeled demo locks (run after the first `dev` start)
npm test           # backend security + validation tests
npm run build      # production bundle in dist/
npm start          # single process: API + built web app on $PORT (default 8787)
```

Copy `.env.example` to `.env` to configure it. No secrets are needed for local development. The server creates a random answer-hashing pepper in `data/.pepper`, which is gitignored.

### Demo locks (from `npm run seed`)

| Lock | Puzzle | Answer |
|---|---|---|
| Welcome to the bridge | Riddle | `Paris` |
| The year the first iron bridge crossed here | PIN | `1804` |
| A thank-you note | Riddle | `merci` |

These locks are labeled **Demo** in the UI. They are not real user content.

## What's in the MVP

- A procedural 3D Paris-at-dusk scene (Babylon.js): an iron footbridge with 7 arches, the river, quays, Haussmann-style blocks, a domed academy, a palace wing, street lamps, fireflies, and hundreds of decorative locks drawn as GPU thin instances
- A lock workshop with a live 3D preview: 4 shapes, 7 materials (2 unlocked by level), colors, engraving styles, decorations, effects and a date
- PIN and riddle puzzles, validated **only on the server**: answers are salted and peppered with scrypt, and attempts are rate-limited and logged
- 5 visibility modes: public, unlisted, invitation-only, scheduled and private
- Unguessable, revocable invitation links with use limits and expiry. The invitation page is lightweight (no 3D engine) and mobile-first.
- A story reveal: the lock opens, light and particles, the text unfolds line by line, an optional synthesized chime and reactions. Reduced-motion is respected.
- Guest-first accounts, optional email registration (a guest is upgraded in place), profiles, XP and levels, 7 achievements and daily challenges
- Reporting with auto-hide after 3 reports, blocking, a moderation screen, account deletion and community guidelines
- First-party analytics events for the product funnel

See [FEATURES.md](FEATURES.md) for the full status checklist and [ROADMAP.md](ROADMAP.md) for what comes next.

## Project layout

```
shared/        catalog, validation, progression, API types (used by client AND server)
server/        local API (node:http + node:sqlite): app.ts routes, puzzles.ts engine, security.ts
src/three/     Babylon scenes: BridgeWorld (bridge), LockPreview (workshop), procedural textures
src/screens/   one file per screen; src/components/ shared UI
supabase/      production Postgres schema with RLS + secure RPCs (not yet applied — see CONNECTORS.md)
tests/         vitest: user journeys A–D against the real HTTP API
```

Docs: [ARCHITECTURE](ARCHITECTURE.md) · [DATABASE](DATABASE.md) · [SECURITY](SECURITY.md) · [TESTING](TESTING.md) · [DEPLOYMENT](DEPLOYMENT.md) · [CONNECTORS](CONNECTORS.md) · [DESIGN](DESIGN.md) · [CHANGELOG](CHANGELOG.md)
