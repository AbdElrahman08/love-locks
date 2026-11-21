# Features & task checklist

Statuses: **Not started** · **In progress** · **Implemented** · **Tested** · **Blocked**

## MVP essentials

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | 3D Paris-inspired bridge | **Tested** | procedural scene, 3 quality tiers, auto quality, WebGL fallback |
| 2 | Lock creation & customization | **Tested** | 4 shapes, 7 materials, 16 colors + picker, 4 engraving styles, decorations, effects, date, 3D preview |
| 3 | Place locks on the bridge | **Tested** | server-assigned unique slots, optional span choice, thin instances |
| 4 | PIN and riddle puzzles | **Tested** | server-side validation, hints, attempt limits, normalization |
| 5 | Secure story reveal | **Tested** | animation, reduced motion, sound toggle, reactions |
| 6 | Invitation links without install | **Tested** | 256-bit tokens, use limits, expiry, revoke, open/use counts |
| 7 | Accounts & profiles | **Tested** | guest-first, email registration with in-place upgrade, profile editing |

## Game modes & screens

| Feature | Status |
|---|---|
| Landing page with live 3D preview | Tested |
| Home / Bridge: featured & recent, daily challenge chip, span navigation, orbit/walk camera, lock inspection | Tested |
| Lock workshop (6 steps, draft autosave without secrets, edit mode) | Tested (create); Implemented (edit) |
| Puzzle screen (PIN pad, riddle, hints, attempt feedback, cooldown timer) | Tested |
| Explore: search, categories, sort by featured/newest/most opened | Implemented |
| Challenges: daily (3 / day), claim XP, achievements grid | Implemented |
| Profile: stats, achievements, my locks, opened stories, settings, blocked users, delete account | Tested (view) / Implemented (rest) |
| Moderation screen (reports, hide/restore, funnel metrics) | Implemented (API tested) |
| Community guidelines | Implemented |
| Bottom navigation (Home, Explore, Create, Challenges, Profile) | Tested |

## Systems

| Feature | Status |
|---|---|
| XP with daily caps + idempotency | Tested |
| 7 achievements | Tested (first_lock) / Implemented (others) |
| Level-gated cosmetic rewards (Frost Lv2, Crystal Lv3, Art Deco Lv2) | Tested (gate) |
| Reactions after unlocking | Tested |
| Report → auto-hide → moderator review | Tested |
| Block creator | Tested |
| First-party analytics funnel | Implemented |
| PWA manifest | Implemented (no service worker yet) |
| Supabase backend | **Blocked**: no project/connector; migration written |
| Social login (Google/Apple) | **Blocked**: depends on Supabase Auth |
| Capacitor Android/iOS builds | Not started |
| Sentry / PostHog | Not started (hooks reserved) |
| Friends, collections, community challenges | Not started (schema prepared) |
| Memory / key-hunt / visual / multi-step puzzles | Not started (engine is pluggable) |
