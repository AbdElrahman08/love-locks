# Design system

Mood: **Paris at dusk**. Night-blue surfaces, warm brass light, ivory paper for stories. Cinematic and romantic, never generic "mobile template".

## Color tokens (`tailwind.config.js`)

| Token | Hex | Use |
|---|---|---|
| `night-950` | `#0b0d1a` | app background |
| `night-900` | `#12152a` | cards, sheets |
| `night-800` / `700` | `#1b1f3a` / `#262b4d` | raised surfaces, avatar wells |
| `brass-300` | `#f3d9a4` | highlights, active text |
| `brass-400` | `#e8c27a` | primary accents, focus rings |
| `brass-500` / `600` | `#d4a14f` / `#b07f33` | button gradient, pressed |
| `rose-300…500` | `#f4b6c2…#d9607d` | errors, love accents |
| `seine-400/500` | `#5a8db3` / `#3d6a8c` | water, secondary accents |
| `ivory` | `#fbf6ec` | body text, story paper |

## Typography

- **Display**: Cormorant Garamond (500/600, italic). Titles, story text and numbers (lining figures forced).
- **UI**: Inter (400/500/600). Labels, buttons, body.
- Overlines: 11px uppercase, letter-spacing 0.25–0.35em, brass.

## Components (`src/components/ui.tsx`)

`Button` (primary brass gradient with glow / ghost / quiet / danger; min height 44px), `Card` (glassy night panel, radius 24px), `Field` (label + hint + error), `Chip` (toggle pills), `Spinner`, `ErrorState`, `EmptyState`, `PageHeader`. Shared visuals: `LockArt` (SVG lock), `PuzzleSolver`, `StoryReveal`, `SharePanel`.

## Motion

Eased camera flights (cubic in-out, 1 s). Lock opening uses a shackle lift and swing. The story fades in line by line. Everything respects `prefers-reduced-motion` and the in-app Motion setting.

## Layout

Mobile-first, with a bottom nav of 5 items and a raised Create button that respects the safe area. On desktop the workshop splits into a preview column and a form column.
