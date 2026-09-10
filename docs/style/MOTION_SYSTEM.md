# Motion & consistency system — what moves, how, and what must look the same everywhere

> **Audience.** Anyone redesigning or building an admin page.
> **Owner's brief (2026-09-09).** *"As I go through and redesign the pages, I want to make sure
> that our style choices and animation/transition styling and formats are consistent and
> recognizable … clearly defined and outlined somewhere what kinds of transitions/animations are
> allowed with the different kinds of layouts and elements."*
>
> **The code.** `app/styles/motion.css` (tokens, the shared `ui-*` keyframes, the `.m-*`
> utilities, the global reduced-motion rule) — loaded once from `app/layout.tsx`.
> **The guard.** `__tests__/admin/motion-system.test.ts`.
> **Reference implementations.** The Projects and Research listings
> (`app/admin/components/listing/`) and the New Research Project modal
> (`app/admin/research/components/NewResearchProjectModal.*`). New pages copy them.

This document sits beside [`STYLE_GUIDE.md`](./STYLE_GUIDE.md) (brand colours, type, the
marketing site) and [`../admin-styling-contract.md`](../admin-styling-contract.md) (the admin
token contract, control heights, icons). It owns MOTION and the shared component grammar for
lists, cards, chips, dropdowns, modals and loading states. Where the older documents disagree
with this one on motion, this one wins — §10 of the style guide predates the tokens.

---

## 1. Principles

1. **Motion explains a change, it never decorates.** Something appears, leaves, unfolds,
   acknowledges, or is still working. If none of those is true, nothing moves.
2. **Arrive slow, leave fast.** Entrances use `--ease-out` and `--motion-base`; exits use
   `--ease-in` and `--motion-fast`. A thing that took 220 ms to arrive and vanishes in 0 ms reads
   as a glitch; one that takes 340 ms to leave reads as sluggish.
3. **Only opacity and transform.** (Plus `grid-template-rows` for the unfold, and
   `background-position` for the project card's gradient sweep — a paint, not a layout.) Never
   animate width, height, margin, padding, top/left or font-size — they force layout on every frame.
4. **Nothing loops except "still working".** Shimmer, pulse, sweep and spin are the only
   infinite animations, and each means something is loading or live.
5. **One overshoot at most, and only on small things.** `--ease-spring` is for a tick, a badge,
   a count. Panels and cards never bounce.
6. **Respect reduced motion, globally.** One rule in `motion.css` stops every animation and
   collapses every transition; a spinner or progress bar carries `.motion-essential` and slows
   down instead of stopping.
7. **Tokens, never literals.** A sheet reads `var(--motion-fast) var(--ease-out)`; it never types
   `0.15s ease`. Keyframes are the shared `ui-*` set; a sheet declares its own only for something
   the vocabulary genuinely lacks — and then it is added to `motion.css`, not to the sheet.

## 2. Tokens

| Token | Value | Use |
|---|---|---|
| `--motion-instant` | 80 ms | hover colour, press feedback |
| `--motion-fast` | 140 ms | chips, small state changes, exits, tooltips |
| `--motion-base` | 220 ms | cards entering, dropdown panels, unfolds, modal enter |
| `--motion-slow` | 340 ms | whole-page transitions, the tick pop |
| `--motion-stagger` | 45 ms | gap between siblings entering together (capped at 12) |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | arriving |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | leaving |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | moving between two places |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | one small overshoot, small things only |
| `--motion-rise` | 10 px | how far an entering card/panel travels |
| `--motion-lift` | −1 px | a hovered card |
| `--motion-press` | 0.985 | a pressed control (scale) |

The older `--transition-fast / -base / -slow` tokens still resolve, to these values.

## 3. What is allowed, by element

| Element / layout | Enter | Leave | Hover | Press | Ongoing | Utility / keyframe |
|---|---|---|---|---|---|---|
| **Page section, panel** | fade + rise (`ui-rise`, base, ease-out) | none (route change) | — | — | — | `.m-enter` |
| **List of cards** (listing pages, results) | each card rises, staggered by `--i` | none | lift −1 px, edge widens, chevron slides in | scale 0.985 | — | `.m-stagger`, `.m-pressable` |
| **Card that opens** (research, job) | as above | — | lift + shadow | scale | — | `.m-pressable` |
| **Project card** (the brand gradient) | as above | — | the blue→red gradient slides across (`background-position`, 2× slow), the red edge turns white, the card grows 1.2 % | settles to 1.004 | — | `.lst--projects .lst-card` |
| **Modal / dialog** | overlay fades (fast); card rises + scales (`ui-rise-scale`, base) | overlay fades out, card sinks (`ui-sink`, fast, ease-in) — **always played before unmount** | — | — | progress bar while working | — |
| **Dropdown / popover panel** (Filter, menus) | `ui-drop` (fast) | none (instant) | — | — | — | — |
| **Disclosure / unfold** (info card, category picker, accordion) | `ui-unfold` (base) — grid-row trick, nothing below jumps | instant | — | — | — | `.m-unfold` |
| **Chip, toggle, tab** | — | — | border/colour (fast) | scale 0.96 (instant) | — | — |
| **Button** (primary) | — | — | lift −1 px + shadow (fast) | settle (instant) | — | — |
| **Input** | — | — | border + focus ring (fast) | — | — | — |
| **Status chip — live** (Analyzing, Drawing, Verifying) | — | — | — | — | pulsing dot (`ui-pulse`) | `.m-live-dot` |
| **Status chip — static** | — | — | — | — | none | — |
| **Count badge, tick, "linked"** | `ui-pop` / `ui-tick` (spring) | — | — | — | — | — |
| **Toast / notice** | `ui-drop` (fast) | `ui-fade-out` (fast) | — | — | — | — |
| **Skeleton** | fade (base) | replaced by content | — | — | shimmer | `.m-skeleton` |
| **List being refreshed** | — | — | — | — | rows dim to 55 % (never a skeleton over rows already on screen) | `.m-refreshing` |
| **Progress bar** | — | — | — | — | sweep (`ui-sweep`), `.motion-essential` | — |
| **Spinner** | — | — | — | — | `spin` (globals.css), `.motion-essential` | `.app-spinner` |
| **Drop zone during a drag** | — | — | — | — | `ui-breathe` ring | — |
| **Table rows** | none (a table does not stagger) | none | background (fast) | — | — | — |
| **Icon rail / nav** | — | — | background (fast) | — | tooltip appears (fast) | — |

Anything not in the table does not animate. Add a row here before adding motion to a new kind of
element.

## 4. Loading, in order of preference

1. **Keep what is on screen.** A reload after a filter or search dims the rows (`.m-refreshing`)
   and swaps them when the data lands. The user never loses their place.
2. **Card-shaped skeleton, once.** A first load shows placeholders shaped like the real cards
   (edge, title bar, chip, three lines), so the real ones land without the page jumping.
3. **Progress bar** for a multi-step action the user started (create + upload).
4. **Spinner** only inside a control (a button that is working), never as a page state.
5. **Never** a spinner in the middle of an empty page, a skeleton over existing rows, or a
   "Loading…" sentence where a skeleton would do.

## 5. The shared visual grammar (the parts that must look the same)

The listings and the modal set these; the older admin pages migrate toward them (§7).

- **Page frame:** title (icon in the accent colour + `--text-2xl`, count in muted text), one
  2 px rule beneath, then controls, then content. Max width 1040 px for a stacked list.
- **Search:** pill-shaped, icon at left, Search button at right sharing the border, focus ring
  in the accent.
- **Filter:** a "Filter ▾" button with a count badge, opening a panel of labelled chip groups
  (Status / Sort by / dates / Show) with Reset and Done.
- **Card:** 14 px radius, 5 px coloured left edge, name + status chip on the first line. Two
  families: the **project card** is the brand gradient (blue → red) with white text, a red edge,
  and white status tags; the **research card** is a white card with a red-to-blue edge. The
  controls stay identical on both pages. Name + status chip on the first line,
  key/value lines in `--text-sm`, a dashed footer for the facts that matter.
- **Status chip:** uppercase 0.74 rem, 8 px radius, tinted background + 1 px border, four tones
  only — `accent` (in progress), `warn` (needs a person), `good` (done), `muted` (not started).
- **Buttons:** primary = accent fill + white text + soft shadow, 10 px radius; **brand** =
  the blue → red gradient with white text, sliding on hover (`.lst-new--brand`, reserved for the
  page's one main action, e.g. "+ New Project"); ghost = bordered transparent; destructive =
  danger text on transparent. 40 px control height (contract §).
- **Dialog:** 18 px radius card, header with a gradient tint, a scrolling body of section cards
  (title on the border, number badge), a footer with status text + Cancel + primary.
- **Empty state:** dashed 14 px frame, icon, one heading, one sentence, one action.
- **Error state:** its own component (`ErrorState`), never the empty state in red.
- **Colour:** theme tokens only (`--theme-*`), with a literal fallback. No hex inside `style={}`.
  Family accents come from `color-mix()` of the accent with a status colour, never a new hex.

## 6. Checklist for a new or redesigned page

- [ ] Every duration and easing is a token; no `0.15s ease` literals.
- [ ] No `@keyframes` in the page's sheet — use `ui-*`; if the vocabulary lacks one, add it to
      `motion.css` and to the table in §3.
- [ ] Entrances use `ui-rise` / `.m-stagger`; exits exist and are faster than entrances.
- [ ] Loading follows §4 (dim → skeleton → progress bar → spinner).
- [ ] The only loops are shimmer / pulse / sweep / spin, each meaning "still working".
- [ ] Spinners and progress bars carry `.motion-essential`; nothing else does.
- [ ] Classes are defined in a sheet the page actually loads (`rendered-classes-are-styled`).
- [ ] Colours are tokens; the inline-hex ratchet stays flat; the contrast floor passes.
- [ ] Driven in a browser before it is called done.

## 7. Audit — where the admin is today (measured 2026-09-09)

Across `app/**/*.css` (the admin sheets are 43,859 lines; `AdminResearch.css` alone is 14,288):

| Measure | Count | What it means |
|---|---|---|
| `@keyframes` declarations | 218 (207 distinct names) | the same fade/rise/pulse written ~20 times over, in 14 sheets; names are global, so duplicates silently override each other |
| Transition durations in use | 14 different values (0.1 s … 0.4 s; `.15s`, `0.15s`, `150ms` all present) | no shared tempo |
| Sheets hard-coding durations | 61 | vs 15 using the `--transition-*` tokens |
| Easings | `ease` ×357, `linear` ×321, `ease-in-out` ×68, `ease-out` ×53 | almost nothing distinguishes arriving from leaving |
| Overlay / modal class families | 27 | 27 ways to dim the page |
| Button class families | 295 | |
| Card class families | 118 | |
| Chip / pill / badge / status families | 183 | |
| Distinct `border-radius` values | 12 (8 px ×558, 6 px ×436, 10 px ×314, 4 px ×246, 12 px ×189 …) | the `--radius-*` tokens are used 169 times |
| Distinct `box-shadow` values | 452 | |
| Distinct `font-size` values | 234 | vs a 7-step `--text-*` scale |
| Distinct hex colours in CSS | 525 | 5,137 `var(--theme-*)` reads beside ~9,000 raw hexes |

The pattern: the tokens exist and are good; most sheets were written before them or beside them.
The two redesigned surfaces show what "on the system" looks like — zero hex, zero local
keyframes after this pass, every duration a token.

### Consolidation backlog, in the order that pays

1. **Motion first (this pass).** `motion.css` shipped; the two reference sheets migrated; the
   global reduced-motion rule covers every sheet at once. The keyframe count is now a ratchet
   (`motion-system.test.ts`): it may only go down.
2. **Overlays and dialogs → one.** 27 overlay families; `AdminDialog.css` is loaded everywhere
   and should be the only one. Migrate `research-modal-overlay`, `tl-modal-overlay`,
   `err-dialog-overlay`, `cmdk-overlay` … onto it as each page is redesigned.
3. **Chips → four tones.** 183 families collapse onto `accent / warn / good / muted` (the
   `.lst-status` grammar). Most of the 525 hexes live here.
4. **Cards + buttons → the listing grammar.** As each list page is redesigned (jobs, leads,
   receipts, contacts, time logs), it moves onto `app/admin/components/listing`.
5. **Radii and shadows → tokens.** Mechanical: `8px → var(--radius-lg)` etc. Can be scripted per
   sheet once a page is otherwise on the system.
6. **`AdminResearch.css` (14,288 lines).** Split per feature as the research pages are redesigned;
   nothing new is added to it.

Each redesigned page retires its old sheet's rules rather than leaving them beside the new ones —
dead CSS is what makes the next audit read 27 overlays again.
