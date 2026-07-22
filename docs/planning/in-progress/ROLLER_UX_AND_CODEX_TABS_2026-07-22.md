# Roller UX polish + shaped dice + readable Codex tabs

**Status:** IN PROGRESS · started 2026-07-22

## Owner ask (verbatim, stitched)

> There should just be a button for the dice roller at the bottom right of the page like there was
> before. Click it while closed → opens the modal; click while open → closes it. Remember the last
> position the roller was in before minimizing, so opening again opens it in the same location. Make all
> the different dice roller styles/formats robust and have noises. For the Impact roller, make the
> spinning-dice animation a tad slower and go a tad longer (I like the noises). Depending on the type of
> die selected, the number of SIDES on the digital dice shape should change — right now it's just a
> rounded square that spins for every roll; a d20 should be a 20-sided shape that spins then shows the
> result. On the Codex template, make the section tabs a bit wider, the tab text bold and easier to read
> on every style + theme — right now it's hard to tell they're even clickable tabs. And make the sections
> easy to format/intuitive, with all text for all styles/themes easy to read and comprehend.

## Slices

**Legend:** `[x]` shipped · `[~]` in progress · `[ ]` not started. Standing bar per slice: `tsc`,
`eslint`, `vitest`, browser-verified before its box is checked.

- [x] **D-1 — bottom-right toggle button + remembered position.** The MINIMIZED roller is a compact dice FAB
  pinned bottom-right; clicking it opens the roller at its REMEMBERED position/size, the header minimize
  returns it. `useFloatingDock` keeps `x/y` across a minimize and exposes a fixed bottom-right button style.
  Browser-verified move→minimize→reopen returns to the exact spot. **Fix (owner follow-up):** the FAB was
  colliding with the fixed "Edit with AI" launcher (both right/bottom, z-index 60) — it now sits ABOVE it
  (right:18, bottom:82, z-index 61); browser-verified no overlap.
- [x] **D-2 — Codex tabs: wider, bold, obviously clickable, readable on every style/theme.** `.codex-railtab`
  is now wider (padding 14×11, min-width 40), BOLD (700) at 13.5px in full-contrast `--ink` (was the faint
  `--muted` that read as disabled), with a real border (`--line-strong`), inset depth, a hover lift, and a
  `◂` chevron at the foot pointing where the pane opens — gold + filled `◀` on the open tab. All token-only
  so every style/theme stays legible. Browser-VERIFIED on Perrin's Codex (Shadow Isles): the rail reads as
  bold, bordered, obviously-clickable tabs with the open ones gold-outlined + gold chevron. tsc/eslint clean.
- [x] **D-3 — Impact roller: slightly slower + longer tumble.** Impact `TUMBLE` 760 → 1080ms and the
  scramble interval 70 → 85ms, so the die spins a touch longer and less frantically before it slams to its
  landing (the owner likes the sound). Commit still fires TUMBLE+320 after; the instant/reduced-motion path
  is unchanged. tsc/eslint clean.
- [x] **D-4 — shaped digital die (sides match the die).** New `dieShape.ts`: `dieSides(roll)` derives the
  die's face count (d20 roll → 20; else parses the `NdM` notation from the breakdown, e.g. `1d8` → 8, `d100`
  → 10; else a single-die min/max fallback; null for a mixed pool) and `ngonClip(n)` builds a regular N-gon
  CSS `clip-path`. The Impact roller's tumbling die now takes that clip-path (removing its rounded-square
  border-radius) so a d20 spins as a 20-sided shape and a d8 as an octagon; an ambiguous pool keeps the
  neutral rounded shape. Browser-VERIFIED: rolling a d20 (Initiative) gives the `.ir-die` a 20-vertex
  polygon clip-path. 5 unit tests (die parsing + clamped polygon). NOTE: the Dice Core / Sigil / Board
  render a number/tiles/cards, not a die shape — the shaped die is for the Impact roller's die. tsc/eslint green.
- [x] **D-5 — every roller robust + audible.** Audit outcome: all four rollers already wire the full sound
  set — `whoosh` on spin, `tick` per step, `blip`/`tada`/`errorBuzz` on land/crit/fumble — in BOTH the
  animated and the instant paths, each with its own per-skin voice (`lib/audio` parameterised by roller),
  plus a mute control (`isMuted`/`setMuted`). No gaps found. Browser-VERIFIED: rolling on the Impact roller
  leaves the AudioContext `running` with no audio errors (sound fires); the same audio calls back every
  template.
- [ ] **D-6 — readable sections on every style/theme.** Sweep the sheet's section text/labels for contrast
  + intuitive formatting across all 5 styles × 5 themes (the contrast clamp already guarantees the token
  colours; this is about the places that hardcode a colour or read faint). Fix offenders; record.
- [x] **D-7 — every roller shows the full breakdown ALWAYS (no toggle).** Audited the 4 rollers: the Dice
  Core (`RollStage` `.rv-break` + total), Sigil Stack (tile stack) and Roll Board (dealt cards) ALREADY show
  the breakdown inline with no toggle. The Impact roller was the only one gating it behind a "▸ Show
  breakdown" button — removed; its `.ir-detail` now renders always on landing, showing the die row (with
  `d20 · advantage/disadvantage (kept pair)` when applicable), the modifier total, and each named boost/
  penalty (conditions/feats), beneath the big final total. Browser-VERIFIED on the Impact roller: rolling
  Initiative shows the die (d20 16) + modifiers (+3) rows immediately, no toggle present. tsc/eslint green.

- [x] **D-8 — purge Lazzuh Gun defaults bleeding into other characters.** Several 5e panels hardcoded
  Lazzuh's story as flavour shown on EVERY character (all templates share these panels): `Abilities` ("hands-
  on brawler… Unarmored Defense and laser aim" lead + a whole "How these were built" callout with Lazzuh's
  exact rolled scores + Jenovan species), `Features` ("the powers that make him him… Barbarian chassis and
  Jenovan biology"), `SavesSkills` ("Danger Sense… Surge / psi — 8 + prof + STR"), `Inventory` ("A smooth
  boi's kit — engineered biology first, salvaged space-tech second"). All rewritten to GENERIC, instructional
  copy (what the section is / how to use it), and the Lazzuh-only callout removed. `blankCharacter` was
  audited and is already clean (empty features/inventory/forms — a new character inherits nothing). Browser-
  VERIFIED on Perrin (Rogue): every Lazzuh term (hands-on brawler, laser aim, Jenovan, smooth boi, space-
  tech, Surge/psi, "make him him") is now ABSENT. tsc + eslint green.
  - NOTE: the `Forms`/`FormAbilities` panels still say "Rampager"; they are gated on the `forms` module (a
    Lazzuh-style shapeshifter mechanic) so they never render on a normal character — left as-is (not a bleed).

- [x] **D-4b — the shaped die needs a clean, correct edge (owner follow-up).** The clip-path die had a
  broken edge (a CSS border on a clip-path box is sliced, not an outline). The Impact die is now a real SVG
  `<polygon>` (`ngonPoints`) with a stroked edge — a crisp N-sided outline that recolours to gold on crit /
  danger on fumble; the wrapper drops its square border/fill so the polygon IS the die. Browser-VERIFIED on
  a d20 roll: `.ir-die-shape polygon` has exactly 20 vertices, a 4px visible stroke, and a dark panel fill.
  ngonPoints unit-tested. tsc/eslint green.
- [x] **D-9 — a UNIQUE final-number reveal animation per roller.** Each roller now reveals its total with a
  bespoke motion tied to its metaphor: **Dice Core** — a digital LOCK-IN (`stageLock`: the number snaps out
  of a stretched, dim scan and settles crisp); **Impact** — a SLAM (`ir-total-slam`: drops in oversized +
  blurred, cracks to size with a hard overshoot); **Roll Board** — a card FLIP (`rb-chip`: the total chip
  flips up on the X-axis like the winning card); **Sigil Stack** — already bespoke (`sigil-snap` drop +
  `sigil-lock` glow-ring pulse). All gated on `prefers-reduced-motion`. Browser-VERIFIED: the Dice Core
  lands in `stage-done` with `stageLock` on the number.
- [x] **D-10 — clearer Impact breakdown (owner follow-up on D-7).** Refactored `buildRows` + the row CSS into
  a clean top-to-bottom calculation: the natural die row (`d20`, with `· advantage/disadvantage (kept x,y)`
  when applicable), the folded modifier now labelled `Ability + proficiency` with its signed value, each
  named condition/feat as a `▲` (helped, green) / `▼` (hurt, red) row, then an emphasised **Total** row set
  off by a divider (uppercase label, big gold value). Replaced the vague "modifiers / helped / hurt" text.
  Browser-VERIFIED on the Impact roller: an Initiative roll reads `d20 → 13`, `Ability + proficiency → +3`,
  `Total → 16`. tsc/eslint green.

- [x] **D-11a — Codex: content-sized open + only-shrink cap (owner 2026-07-22).** A section now OPENS at
  the minimum height that reveals ALL of its content for THIS character (measured from an unconstrained
  inner wrapper — `scrollHeight` alone reports the container, not the content, when the pane is taller than
  its content), and its content height becomes the resize CAP: the user may drag a section SMALLER but never
  larger than its content (no empty space below). `paneMath` gains `Pane.max` + `capPaneToContent` (first
  measure opens at content; later measures keep the player's size, only re-capping), `resizePane` clamps to
  the cap; `usePaneStack.setContentHeight` + a `ResizeObserver` in `PaneStack` measure and report it. Lives
  in the shared shell, so it works for EVERY system. 5 unit tests + browser-VERIFIED: a fresh Skills section
  opens at ~1284px (its content height), Abilities at ~206px (its content), each snug to its content.
- [x] **D-11b — Codex: connected tab⇄section accordion, tabs push down (owner 2026-07-22).** Rebuilt
  `PaneStack` from a separate rail + pane column into ONE vertical accordion column of rows: each section is
  a row whose tab sits on the right edge; when open, the section body opens OUT to the LEFT of that tab,
  joined to it (squared shared edge, `align-items: stretch` so the tab spans the section height — one unit).
  Because every section is a row in the same column, opening one PUSHES the tabs below it DOWN and closing
  reflows them UP — no shrink-to-fit (each section keeps its content height; `openPane` simplified to
  insert-only). Lives in the shared shell → every system. Browser-VERIFIED on Perrin's Codex: with Skills
  open the next tab (Abilities) is pushed from ~y992 down to ~y2318, below the open section; all lower tabs
  follow. 36 codex tests + tsc + eslint green.
- [ ] **D-12 — section RELEVANCE filtering by system + class/subclass (owner 2026-07-22).** Only show the
  sections that make sense for THIS character: a Barbarian with no spells/powers must have NO Spells/Powers
  tab on any template. Audit which sections are mechanic-gated (Spells, Powers, Forms, Dossier, …) and which
  systems/classes actually use each; drive tab/section availability off the character's own data (has spells
  → Spells section; has a shapeshift/forms feature → Forms; etc.) rather than showing every section to every
  character. Custom content re-enables a section (a Barbarian given a few homebrew spells GAINS a Spells
  section to manage them). Reduce clutter across all templates + systems. (Confirmed clutter: Perrin, a
  Rogue, currently shows Spells / Forms / Dossier tabs it should not.)
- [ ] **D-13 — build/add CUSTOM sections (owner 2026-07-22).** A way to create a NEW section on a character
  sheet, format it, and populate it — added to the sheet (and its tabs), for any system. The section
  builder + storage on the character, surfaced in every template.

## Done means
- One bottom-right toggle button; the roller reopens where it was. Every roller is robust + audible; Impact
  spins a touch longer. The digital die has the right number of sides for the die rolled. Codex tabs read
  as bold, wide, obviously-clickable tabs on every style/theme, and all section text is legible everywhere.
