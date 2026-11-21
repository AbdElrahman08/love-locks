# Architecture

```
┌──────────────────────── Browser (React + TS + Tailwind) ────────────────────────┐
│  screens/  ── lib/api.ts (guest-first session) ── lib/analytics.ts               │
│     │                                                                            │
│     ├─ lazy ─► components/Canvas3D ─► three/BridgeWorld  (Babylon.js, WebGL)      │
│     │                              └► three/LockPreview                           │
│     └─ InvitePage / LockPage / StoryReveal use SVG LockArt (no 3D download)       │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ JSON over HTTPS, Bearer session token
┌──────────────────────────────────────▼──────────────────────────────────────────┐
│ server/app.ts  (authoritative)                                                   │
│   auth · locks · invitations · unlock pipeline · XP/achievements · moderation     │
│   server/puzzles.ts  ← pluggable puzzle handlers (pin, riddle, …)                 │
│   server/security.ts ← tokens, scrypt+pepper hashing, rate limiters               │
│   server/db.ts       ← node:sqlite (dev/single-node)  ║  supabase/migrations (prod) │
└─────────────────────────────────────────────────────────────────────────────────┘
                shared/ (catalog, validation, progression, types) used by both sides
```

## Key decisions

| Decision | Why |
|---|---|
| **Shared `shared/` module** | The same validation and catalog run in the browser (instant feedback) and on the server (the authority), so they can't drift apart. |
| **Local Node API + SQLite** | No Supabase project was connected. `node:sqlite` needs no native build, runs anywhere Node 22.5+ runs (Replit included) and gives a real SQL database with constraints and cascades. The Postgres schema in `supabase/migrations` mirrors it table for table. |
| **Puzzle engine as handlers** | `PUZZLE_HANDLERS[type]` = `build / check / publicView / isWellFormed`. A new puzzle type (memory, multi-step…) is one object. Rate limiting, logging, reveal and XP are shared. |
| **Procedural 3D, no asset files** | Geometry and textures are generated in code: no downloads, works offline, passes a strict CSP, and is easy to restyle. Locks use **thin instances**: one draw call per shape × material (28 groups) whatever the lock count. |
| **3D is lazy-loaded** | The invitation page is the viral entry point. It loads ~72 KB gzipped and never downloads Babylon. |
| **Guest-first** | `POST /api/auth/guest` runs on first use. Registering upgrades that same profile, so locks, XP and opened stories carry over. |
| **Config, not hard-coding** | `src/config/gameConfig.ts` holds the provisional decisions: camera mode, world mode, which visibilities can be attempted from the bridge, and account requirements. |

## 3D world (`src/three/BridgeWorld.ts`)

- Units are meters. The bridge runs along X (7 spans × 20 m), the deck is at y = 8 and 11 m wide, and the river runs along Z.
- `slotTransform(slot)` deterministically maps a slot index to span, side, row and column, then to a world position, rotation and a slight random tilt. The server assigns slots (`UNIQUE`), so every client draws the same bridge.
- Quality tiers (low, medium, high) control resolution scaling, the glow layer, mirror water reflections, the particle count and the number of decorative locks. "Auto" picks a tier from the GPU name and steps down if the measured FPS stays below 28.
- The camera can orbit (default, third-person) or walk (first-person WASD/drag). Moving between spans and locks uses eased transitions, which are skipped under reduced motion.
- The lighting environment is a procedural dusk cube map, and its diffuse harmonics are precomputed in JS.
- Fallback: without WebGL, the bridge screen becomes a gallery of SVG locks and the workshop uses the SVG preview.

## Unlock pipeline (`POST /api/unlock`)

1. Session required (a guest is fine) → per-IP burst limiter
2. Resolve the lock by invitation token (hashed lookup) or by lock id. Visibility, schedule, expiry, use count and blocks are all checked.
3. Already solved → return the story idempotently
4. Limits: per person and lock, `maxAttempts` failures per 24 h and 5 failures per 10 min; per IP and lock, 30 failures per hour; per lock overall, 300 failures per hour
5. A cheap well-formedness check (a malformed PIN is rejected without a hash check)
6. A constant-time check against scrypt(HMAC(pepper, answer)). The attempt is recorded.
7. On success, in one transaction: consume an invitation use, record an `unlock_event`, award XP and evaluate achievements, then return the story

## Future-ready seams

- `friendships` table and `/api/locks/:id/react` for social features
- `rewards` / `user_rewards` for cosmetic monetization (no payments in the MVP; puzzles and stories are never gated)
- Analytics are first-party; a PostHog forwarder can be added in `lib/analytics.ts`
- Capacitor: the app is a static SPA plus an API origin, so it wraps directly (see DEPLOYMENT.md)
