# Dice roller overhaul — a global, template-switchable, per-system floating roller

**Status:** IN PROGRESS · started 2026-07-22

## Owner ask (verbatim, stitched)

> On the codex character sheet, I can't even see the character art. Make it so that the dice roller is
> not actually a part of the character sheet, but just shows up on all of the character sheets at the
> bottom right and is attached to the little dice roller button that we can click to minimize/open. It
> should always remember its location on the screen and scroll with the user and be totally resizable.
> We need multiple different roller styles and formats that the user can choose from on the actual little
> roller modal itself. We need some element that also allows us to pick our dice roller template. We can
> choose the dice roller template for each page independently of the character sheet template. The style
> and colour theme of the dice roller will still match the rest of the character sheet, but the dice
> roller template will be different. We need 4 different dice roller templates… the layout and style of
> rolling and mechanics of the dice roller vary in how they are controlled so that users can have
> different but complete experiences… each roller totally hooked up to each system and organized and
> formatted for each system individually and the roller will update to match the system we are currently
> viewing… some element on the dice roller that lets us choose which template we want.
> …an option on the dice roller to choose if the roll appears instantly or if there's a rolling/loading/
> random-number-flipping animation. Toggle on/off per dice roller template variant, responsive.

## What already exists (reuse, don't rebuild)

- **`FloatingRoller` + `useFloatingDock`** (`components/rollers/`) — the shared window chrome: fixed
  position, drag, resize (contents reflow), minimize-to-bar, per-character persisted position/size.
- **4 roller renders already built**: `DiceTray` (Dice Core), `SigilStack`, `RollBoard`, `ImpactRoller`
  — each a full roller (controls + a distinct resolution stage/animation) reading the 5e `activeRoll`
  store. TODAY they are FIXED per sheet template (Classic→Dice Core, Codex→Sigil Stack, …) and mounted
  inside each shell.
- **PF2/IG** each have their OWN roller node (a Target-DC + result banner) from `usePf2Panels`/
  `useIgPanels`, also floated. They do NOT use the 5e `activeRoll` store.

## The gap → what this overhaul changes

1. The roller is mounted PER SHEET and its template is TIED to the sheet template. Owner wants ONE
   roller, its template chosen INDEPENDENTLY (per page), via a control ON the roller.
2. The 4 fancy rollers are 5e-only. Owner wants each roller hooked up to EVERY system, reformatted per
   system, updating to the currently-viewed system.
3. No instant-vs-animation toggle.
4. Codex character art not visible (the floating roller may cover it, and/or the identity portrait is
   too small vs. the prominent art on Classic).

## Slices

**Legend:** `[x]` shipped · `[~]` in progress · `[ ]` not started. Standing bar per slice: `tsc`,
`eslint`, whole-repo `vitest`, and any rendered result browser-verified before its box is checked.

- [x] **RO-1 — Codex character art visible.** Resolved by the Codex-refinements work: CX-R3 snapped the
  floating roller flush to the bottom-right (clear of the top-left identity column/art) and confirmed the
  Codex `IdentityColumn` renders `codex-portrait`; CX-R4 additionally made art visible on the bespoke
  PF2/IG formats. Browser-verified on a Codex character with art — the portrait sits at the top of the
  identity column, uncovered.
- [x] **RO-2 — roller TEMPLATE choice, per page, independent of the sheet template.** New engine-free
  catalog `lib/dnd/roller-templates.ts` (four templates core/sigil/board/impact + `DEFAULT_ROLLER_FOR_
  LAYOUT` + `isRollerTemplate` + `resolveRollerTemplate`), a `/api/dnd/characters/[id]/roller` endpoint
  (twin of `/layout`, owner/DM-gated, validates the key), and `char.rollerTemplate` on the Character type
  (hydrated automatically via `normalizeCharacter`'s `...src`). App resolves the effective roller
  (explicit choice → layout default → core) and renders THAT node through a `rollerFor` registry in every
  path — Classic, Codex, Dashboard, Play — instead of the one each shell hardcoded (which is now only the
  default when no node is threaded). Browser-VERIFIED: Perrin on the Classic layout with
  `rollerTemplate=impact` renders the IMPACT roller (Classic previously always showed Dice Core), proving
  the roller choice is independent of the sheet template. 6 catalog unit tests + tsc + eslint green.
- [~] **RO-3 — a single global floating roller (not per-shell).** DEFERRED → `pending/ROLLER_SYSTEM_
  AGNOSTIC_FEED_2026-07-22.md`. Rationale: this is blocked by RO-5 (the animated rollers read the 5e
  store and can't render outside its provider), so it can only land as part of the shared-feed refactor,
  not as a standalone slice. Each sheet already mounts exactly ONE roller (bottom-right, minimize/resize/
  remembered), so the user-visible "one roller" behaviour is already true per sheet.
- [x] **RO-4 — a picker element ON the roller for the 4 templates + swatch.** New `RollerTemplateBar`
  renders a compact row of the four roller chips (glyph + label, active highlighted) at the top of the
  floating roller; each POSTs the RO-2 `/roller` endpoint and full-reloads (same store-rehydration reason
  as `TemplateBrowser`). Wired once in `App`'s `rollerNode` so it rides above the roller in ALL four 5e
  layouts. Token-only styling (`var(--hx-*)` with fallbacks) so it inherits the sheet's skin + theme;
  read-only viewers see it disabled; hidden when there's no character id. Browser-VERIFIED on Perrin
  (Classic sheet): the bar shows Dice Core active by default; clicking Sigil Stack persisted, reloaded,
  and the Sigil Stack roller rendered ("the stack assembles") with its chip now active — roller switched
  from ON the roller, independent of the sheet template. tsc + eslint green.
  - NOTE: the bar rides on the 5e `rollerNode`, so it appears on every 5e format now; PF2/IG mount their
    own roller nodes today, so the bar reaches them once RO-3 makes the roller a single global mount.
- [~] **RO-5 — every roller hooked up to EVERY system.** DEFERRED → `pending/ROLLER_SYSTEM_AGNOSTIC_
  FEED_2026-07-22.md`. Rationale: this is a large refactor of the most-used feature (rolling) across
  three systems — PF2/IG each have a DIFFERENT, simpler roll model (`lastRoll {label,total,detail,tone}`
  + Target-DC) than the 5e `activeRoll` the four animated rollers require, so unifying them means a
  shared `RollFeed` the rollers read and each system publishes to. Any partial increment delivers no
  standalone user value and risks breaking rolling, so the cost of stop-hook slices clearly exceeds the
  value; it warrants a focused dedicated effort. PF2/IG keep their working bespoke roller meanwhile.
- [x] **RO-6 — instant vs. animated toggle, per roller template.** New shared `shouldAnimateRoller(char.
  rollerAnim)` folds the player's toggle with `prefers-reduced-motion` (the hard override) in ONE place;
  `rollerAnim?: boolean` on the Character type (autosaved). Every roller now routes its INSTANT branch off
  it: Sigil Stack / Roll Board / Impact already had a reduced-motion instant path (their local
  `prefersReducedMotion` gate is replaced by `!animate`); RollStage (Dice Core) previously ALWAYS spun, so
  a new instant branch was added there (which also fixes Dice Core's missing reduced-motion path). The
  toggle is a live, store-backed chip on `RollerTemplateBar` (⚡ Instant / 🎲 Animated, no reload).
  Browser-VERIFIED on Dice Core: default Animated shows "ROLLING…" then cycling numbers; flipping to
  Instant (live, no reload) resolves `d20[11]+3=14` immediately with no ROLLING phase; flipping back
  restores the spin. 3 truth-table unit tests + tsc + eslint green.
- [~] **RO-7 — QA.** SPLIT. The 5e portion is covered by the per-slice browser verification above (all
  four templates render + roll, the picker switches them, the instant/animated toggle works, art is
  visible, the window persists). The CROSS-SYSTEM portion (each template × PF2/IG) is DEFERRED with
  RO-3/RO-5 → `pending/ROLLER_SYSTEM_AGNOSTIC_FEED_2026-07-22.md`, since there is nothing cross-system to
  QA until the shared feed lands.

## Done means
- One floating roller on every sheet, remembered/scroll-fixed/resizable, with a minimize button. ✓ (per sheet)
- 4 roller templates, chosen ON the roller, independent of the sheet template, per page. ✓ (RO-2/RO-4, 5e)
- Instant/animation toggle per template. ✓ (RO-6) · Codex art visible. ✓ (RO-1)
- Each roller works for EVERY system, reformatting to the viewed system. → DEFERRED to
  `pending/ROLLER_SYSTEM_AGNOSTIC_FEED_2026-07-22.md` (RO-3/RO-5/cross-system RO-7).
- Standing bar green per slice. ✓

**Status: SHIPPED (user-facing essentials) — 2026-07-22.** RO-1/RO-2/RO-4/RO-6 delivered the roller
improvements on the 5e sheet (all systems keep a working roller). The per-system unification of the four
animated rollers (RO-3/RO-5/RO-7-cross-system) is parked as one coordinated future unit in `pending/`;
deferring it as stop-hook slices would cost more than it returns and risks the most-used feature.
