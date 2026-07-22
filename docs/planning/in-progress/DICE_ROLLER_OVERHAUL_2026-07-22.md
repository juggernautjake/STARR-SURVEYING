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

- [ ] **RO-1 — Codex character art visible.** Diagnose: is `artUrl` reaching the Codex `IdentityColumn`
  (it should), is the `codex-portrait` rendering, and is the floating roller's default position covering
  it? Fixes likely: give the roller a default bottom-right position clear of the identity column, and/or
  make the Codex portrait larger/always-present when the character has art (mirror how prominent Classic
  art is). Browser-verify on a character WITH art in Codex.
- [ ] **RO-2 — roller TEMPLATE choice, per page, independent of the sheet template.** Persist a
  `data.rollerTemplate` (one of `core | sigil | board | impact`) via a small `/api/dnd/characters/[id]/
  roller` endpoint (twin of `/layout`), defaulting to a sensible per-sheet-template default so nothing
  regresses. The mounted roller renders the CHOSEN roller template, not the one baked into the shell.
- [ ] **RO-3 — a single global floating roller (not per-shell).** Mount ONE roller at the character-page
  level (page chrome), not inside each shell/adapter — so it shows on ALL sheets (5e engine, PF2, IG,
  every format) at the bottom-right, attached to its minimize/open button, remembering location, scroll-
  fixed, resizable (the `FloatingRoller` behaviour, now singleton). Remove the per-shell roller mounts.
- [ ] **RO-4 — a picker element ON the roller for the 4 templates + swatch.** The roller header carries
  a small template switcher (4 options, active highlighted, each with a mini glyph) that POSTs `/roller`.
  Choosing re-renders the roller in that template. The roller inherits the sheet's style + colour theme
  by construction (token-only styling).
- [ ] **RO-5 — every roller hooked up to EVERY system.** Introduce a system-agnostic roll interface so
  all 4 roller templates consume the SAME roll data regardless of system, and each renders that data
  organised/formatted for the currently-viewed system. 5e feeds the `activeRoll` store; PF2/IG feed
  their own resolved rolls into the same interface. The roller updates to match the system being viewed.
  (Largest slice — a shared `RollFeed` the rollers read and each system publishes to.)
- [ ] **RO-6 — instant vs. animated toggle, per roller template.** A control on the roller to switch
  between an INSTANT result and the template's rolling/flipping/tumbling animation; persisted per
  character (`data.rollerAnim`), honoured by every template's resolution stage (and still respecting
  `prefers-reduced-motion` as the hard override). Responsive.
- [ ] **RO-7 — QA.** Every roller template × every system × a couple themes: rolls resolve with the
  correct total, the animation toggle works, the window persists, art is visible. Record + move to
  `completed/`.

## Done means
- One global floating roller on every sheet, remembered/scroll-fixed/resizable, with a minimize button.
- 4 roller templates, chosen ON the roller, independent of the sheet template, per page.
- Each roller works for every system, reformatting to the viewed system, matching its style + theme.
- Instant/animation toggle per template. Codex art visible. Standing bar green per slice.
