# Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | project, architecture, schema, auth, git, design system | ✅ done (Supabase blocked → local backend + migration) |
| 2 3D environment | bridge, river, city, cameras, attachment points, optimization | ✅ done |
| 3 Lock system | models, workshop, materials, saving, placement | ✅ done |
| 4 Puzzle engine | PIN, riddle, server validation, attempts, hints | ✅ done |
| 5 Stories & invitations | protected stories, reveal, links, recipient page | ✅ done |
| 6 Accounts & social basics | guest, registration, profiles, explore, achievements, report/block | ✅ done |
| 7 Mobile & optimization | PWA, Capacitor, device testing, performance, accessibility | 🟡 partial |
| 8 QA & beta | functional, security, RLS, device, perf testing; beta deploy | 🟡 partial |

## Next up (priority order)

1. **Connect Supabase**: apply the migration, run the RLS test plan, add a Supabase adapter (Auth with anonymous sign-in, OAuth, email verification and password reset).
2. **Deploy a beta** (Replit or similar) with a persistent volume and `SERVER_PEPPER`; push the repo to GitHub.
3. **Shrink the 3D bundle**: switch Babylon imports to deep paths (`@babylonjs/core/Meshes/...`) to tree-shake ~4.8 MB → ~1.5 MB; add a service worker for asset caching.
4. **Real-device pass**: Android mid-range and iPhone; Capacitor wrappers; haptics on unlock.
5. **Accessibility audit** with NVDA/VoiceOver; keyboard navigation of the 3D scene (list of nearby locks).
6. **Sentry + PostHog**; dashboard for the target metrics (first lock 40%+, share rate 25%+, invitation conversion 15%+, D1 30%+, D7 10%+). These targets are hypotheses to validate.
7. **New puzzle types**: memory match and multi-step (each is a new handler in `server/puzzles.ts`).
8. **Social**: friends, collections, seasonal community challenges; then seasonal cosmetic packs (never gating puzzles or stories).

Explicitly **not** in the MVP: multiple bridges, real-time multiplayer, chat, AI puzzle generation, subscriptions or payments.
