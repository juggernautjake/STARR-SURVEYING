# `app/dnd/_sheet/` — vendored Lazzuh sheet source (Phase C)

These files are vendored from the standalone Vite/React app `neon-odyssey-sheet`
(built machine: `../neon-odyssey-sheet`; only its minified bundle previously lived
in `public/dnd-sheet/`). `_sheet/` is a Next **private folder** (leading underscore →
no routing). See `docs/planning/in-progress/DND_CAMPAIGN_PLATFORM_2026-07-06.md` §8.6
Phase C.

## C1a — pure, framework-agnostic core (verbatim copies)
Kept as exact copies so re-syncing from source is a clean diff; the rules/effects
generalization happens later in C12–C20, not here:

- `rules/dnd.ts` — ability/proficiency/mod rules + `AbilityKey`/`ProfLevel` types
- `lib/dice.ts` — dice roller core
- `types.ts` — `Character` and sheet data types
- `data/lazzuh.ts` — Lazzuh Gun's character data (the reference sheet)

Import graph: `types → rules/dnd`, `data/lazzuh → types`, `dice` standalone. No DOM,
no CSS, no `localStorage` — safe to import from server or client.

## C1b — UI layer + scoped stylesheet (DONE)
- `components/*` incl. `components/ui/{SectionHead,InlineNumber}.tsx`, `state/store.tsx`,
  `lib/{inline.tsx,audio.ts}`, `App.tsx` — vendored.
- `styles/theme.css` — the source's **2,007-line global stylesheet**, machine-scoped so
  every selector is prefixed with `.dnd-sheet` (`:root`/`html`/`body`/`*`/`::selection`/
  scrollbars all rewritten to target the container). Verified: **0 unscoped global
  selectors**. Regenerate via the postcss AST transform (do NOT hand-edit); the Google
  Fonts `<link>` from the standalone `index.html` was moved to an `@import` at the top.
- **Local edits to vendored files** (kept minimal, all commented):
  - `App.tsx` — `'use client'`, `import './styles/theme.css'`, and a `.dnd-sheet` wrapper
    div around the existing `.wrap` (the scope root).
  - `state/store.tsx` — `'use client'`.
  - `FormAbilities.tsx`, `Inventory.tsx` — `react-hooks/rules-of-hooks` disable comments on
    `useFormAbility`/`useItem` calls (store **actions**, not React hooks — false positives).
  - `ui/SectionHead.tsx` (`//` textnode) + `Forms.tsx` (`it's` apostrophe) — lint fixes.
- `main.tsx` is intentionally NOT vendored — its `createRoot` mount is replaced by C2
  rendering `<App/>` (wrapped in `CharacterProvider`) as a Next client component at a route.

Typecheck + eslint clean across all 26 files.

## Next (C2+)
- **C2** — render `<App/>` at a route (client component + `CharacterProvider`), fed static data.
- **C3** — replace the `localStorage` persistence in `state/store.tsx` with the DB-backed store.
