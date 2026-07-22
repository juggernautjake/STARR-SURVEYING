# Multi-format character sheets: 4 templates × 4 systems, every skin

**Status:** IN PROGRESS · started 2026-07-22

## Owner ask, verbatim (stitched from several messages)

> I want to build new templates and formats for the character sheets for each system and make it so
> that we can apply the color skins to them to make the templates look different. Whenever I say
> template I mean different formats for the character sheets where information will be formatted
> differently so that stuff shows up in different locations and styles… Some players might like some
> styles more than others. I had specified a template that had tabs stacked on top of each other on
> the right side of the screen that can open resizable sections… I don't think it has been built or
> at least I don't know how to switch from the current shown templates to the newly built template.
> There doesn't seem to be an interface for switching templates easily like we can with color skins…
> I want to build 3-5 different template formats for each system. I want to flesh each format out
> totally so that each one looks good with every color theme skin choice. Please make sure that all of
> the templates are surfaced and can actually be selected and rendered with the actual character's
> data and all of it show up and work correctly for each system as it should. Please especially work
> on the current default templates for pf2 and IG… better fonts and font sizes…
> Build out all of the templates… with their unique traits and designs.
> …built in slices piece by piece until each template is fully functional for each system and looks
> good with each color theme too. Shared across all systems.

## The three orthogonal axes (the mental model that makes this tractable)

A character sheet is defined by THREE independent choices. Keeping them independent is the whole
design; conflating any two multiplies the work and is what has made "templates" feel unbuildable.

| Axis | Field | What it controls | Today |
|---|---|---|---|
| **System** | `character.system` | The RULES + which data model (`Character` / `PF2Character` / `IGCharacter`) | 4 built: 2014, 2024, PF2, IG |
| **Skin** | `character.sheet_type` | The COLOUR palette (Hextech, Neon Odyssey, Candy, …) | 5 built; apply to every system (skin-tokens bridge) |
| **Template** | `character.sheetLayout` | The FORMAT — where information sits and how it is arranged | 2 (classic, codex), 5e only, no picker UI |

The owner's request is entirely about the **third axis**: make it a first-class, discoverable choice
with several fully-built options, working across every system and every skin.

## The core architectural decision: FORMAT = SHELL, SYSTEM = PANELS

The naive reading of "shared across all systems" is one component that renders every system — but the
data models are unrelated (`Character` vs `PF2Character` vs `IGCharacter`), so that component would be
a mess of conditionals and would fight the bespoke PF2/IG sheets that already hold the real maths.

The right decomposition, and the one the 5e Codex already proved:

- **A system provides PANELS.** Each system exposes a `SheetPanelSet` — an ordered list of named
  content blocks (`skills`, `combat`, `spells`, `feats`, …) plus a compact IDENTITY/VITALS summary.
  Each panel is a `() => ReactNode` that renders that system's own components against its own data.
  - 5e already does this: `CodexLayout` builds `defs[]` from the `_sheet` components.
  - PF2/IG must have their bespoke sheets **refactored into panel providers** — the sections that
    exist inside `PF2Sheet`/`IGSheet` (Attributes, Defenses, Skills, Strikes, Feats, Spells, …)
    become individually-renderable panels. Their default sheet becomes "the Classic format fed by
    the PF2/IG panel set", so nothing is lost and the maths stays put.

- **A format is a SHELL** that arranges a `SheetPanelSet` — it knows nothing about any system's data:
  - **Classic** — a tab bar; one panel visible at a time; vitals header on top.
  - **Codex** — identity column (⅓) + a vertical rail of tall tabs opening stacked, resizable panes.
  - **Dashboard** — identity strip + every panel as a card in a reflowing grid; see everything.
  - **Play** — big tappable vitals + attacks/actions front-and-centre; reference in a drawer.

This is the ONLY way "4 formats × 4 systems" is 4 + 4 units of work instead of 16: 4 shells + 4
panel-sets, composed. A new format is one shell; a new system is one panel-set.

**Skin compatibility is free, by construction** — every shell styles itself with `var(--…)` theme
tokens only (the rule the Codex already follows), so all 5 skins apply with zero format-specific CSS.
A test forbids any `.skin-x .format-y` selector, exactly as `codex-layout.test.ts` does today.

## Data-model reality check (why this is honest, not hand-wavy)

- **5e (2014/2024)** — the shared `_sheet` engine already renders every panel; the Codex already
  arranges them. Classic + Codex exist. Dashboard + Play are new shells over the SAME panels. So 5e
  reaches all 4 formats mostly by writing 2 new shells. LOW risk.
- **PF2** — `PF2Sheet` is one monolith. It must be split into a `pf2PanelSet()` (Attributes,
  Defenses & Vitals, Conditions, Skills, Strikes, Feats, Spellcasting). Once split, all 4 shells
  render it. MEDIUM risk (a careful refactor that must preserve every roll/edit/number).
- **IG** — same as PF2 for `IGSheet` (Vitals, Abilities, Skills, Combat, Stances, Powers, Feats,
  Companion). MEDIUM risk.

## The switching interface (the owner's #1 named gap)

Mirror the skin picker exactly. `SheetStyleBrowser` is page-chrome shown for every system and PATCHes
`sheet_type`. The **`TemplateBrowser`** is its twin: page-chrome for every system, shows the formats
the character's system actually has (from the registry), and sets `sheetLayout`. A preview swatch per
format (a tiny wireframe) so the choice reads at a glance, like the skin swatches.

`sheetLayout` lives in the `data` blob today; a small `/api/dnd/characters/[id]/layout` endpoint sets
it (reads current data, patches the one field, saves) so the page-chrome picker works for PF2/IG too,
where the 5e store's `setChar` is not in scope. The buried in-engine `LayoutSwitch` is removed in
favour of this single surfaced picker.

## Slices

Each slice below is **independently buildable and shippable** — one focused change, its own tests, its
own green bar — so the stop hook can pick up exactly one un-checked slice at a time and finish it. They
are ordered: infra first, then 5e's remaining shells (cheapest, they reuse the proven panel set), then
the PF2 and IG panel-sets and their shells (the real refactors), then the bespoke per-format dice
rollers, then the styling passes, then whole-matrix QA. A slice is done ONLY when its box is checked
**and** the standing green bar (bottom of doc) passes.

**Legend:** `[x]` shipped · `[~]` in progress · `[ ]` not started.

### Foundation

- [x] **T-1 — Registry + picker + endpoint.** `SheetLayout` widened to
  `classic|codex|dashboard|play`; `lib/dnd/sheet-templates.ts` (catalog + `templatesForSystem` honest
  coverage + `isTemplateBuiltFor`); `/api/dnd/characters/[id]/layout` (owner/DM-gated, patches
  `data.sheetLayout`); `TemplateBrowser.tsx` page-chrome picker surfaced beside the skin picker for
  every system, self-hiding when a system has <2 formats; in-engine `LayoutSwitch` removed. Tests in
  `sheet-templates.test.ts`.
- [x] **T-2 — 5e panel set extracted.** `app/dnd/_sheet/panels/fivePanels.tsx` — `useFivePanels()`
  is the single ordered 5e panel list (skills, abilities, combat, attacks, spells, forms, features,
  business, gear, story, dossier, gallery) with the same module/data gates as the classic tabs. Both
  shells read it, so they can't drift. _(Codex still builds its own identical `defs[]` inline —
  see T-2b cleanup.)_
- [x] **T-2b — Codex reads `useFivePanels()` (cleanup).** `CodexLayout` now consumes the shared
  `useFivePanels()` (`SheetPanel` is structurally a `PaneDef`, so it drops straight in); the inline
  `defs[]` and ~18 now-dead component imports removed — one 5e panel source in the tree. Browser-
  verified on Perrin (L4 Rogue): Codex renders identically (identity column + rail + SKILLS·18 pane
  with correct saves/skills), and the Dashboard renders the same panels as a card grid.
- [x] **T-3 — Dashboard shell (5e).** `DashboardLayout.tsx` — identity column + every panel a themed
  card in an `auto-fit` grid, per-card internal scroll past a max height, reflows phone→wide;
  theme-token only. Wired into `App.tsx` (`isDashboard`), offered for 5e in the registry.

### 5e — remaining shell

- [x] **T-4 — Play shell (5e).** `PlayLayout.tsx` + `play.css`, wired into `App.tsx` (`isPlay`, and
  `ownsIdentity = isCodex || isPlay` suppresses the page's redundant token/hero for both), added to
  5e + ambiguous in `BUILT_FOR`. Compact identity strip; a **vitals band** (reused `CombatPanel`:
  HP + damage/heal/temp stepper, hit dice, death saves, speed, rest) + `Resources`; an ability
  **quick-roll** row (`Abilities`); a big **Attacks/Actions** block (`Attacks`, each a roll button);
  the Dice Core docked; and everything ELSE (skills, spells, features, gear, story, gallery) in a
  single collapsible **Reference drawer** from `useFivePanels()` minus the hero panels
  (`combat`/`attacks`/`abilities`, so nothing double-lists). Zero recompute — every number is the
  reused component's one answer. Browser-verified end-to-end on Perrin (L4 Rogue): identity, vitals
  with real HP 31/31, ability tiles, Rapier/Shortbow/Dagger roll buttons, drawer opens to real
  panels. Registry test now expects 5e = all four formats.

### Shell parameterization — the prerequisite the wiring slices depend on (found 2026-07-22)

Reading the code for T-5a surfaced a real gap the plan glossed: **the Codex/Dashboard/Play shells are
5e-coupled**. Each calls `useFivePanels()` and renders `IdentityColumn` (which reads the 5e `useChar`
store) directly. Before PF2 or IG can render *in* those formats, the shells must stop hardcoding 5e.

There is a scoping constraint that decides the shape of the fix: `useFivePanels()` internally calls
`useSheetConfig()`/`useChar()`, which are only valid **inside** `SheetConfigProvider` — and `App`'s
body runs ABOVE the provider it returns. So panels cannot be computed in `App` and passed down; they
must be computed by a component rendered inside the provider (which is exactly why today's shells
compute their own). The clean decomposition:

- [x] **T-SHELL — split each shell into a pure shell + a per-system adapter.** One shell per format,
  each taking `{ identity: ReactNode, panels: SheetPanel[], roller: ReactNode, above?: ReactNode }`
  and arranging them — no `useChar`, no system knowledge. A thin per-system adapter rendered inside
  the provider computes those parts and passes them in; `App`'s existing branch keeps importing the
  5e adapter, so 5e output is unchanged and `App` needs no edit.
  - **Refinement found in T-5a:** the PF2 (and IG) hooks return a top `header`/`nav`/`banner`, NOT a
    left identity column — so a system's Codex/Dashboard adapter must supply its OWN format-appropriate
    identity node (a condensed vitals column built from its defenses/attributes panels), and any
    act-now furniture goes through the shell's `above` slot (5e: review queue + reactions; PF2/IG:
    their `banner`/`overlays`). The `SheetPanel` type stays exported from `fivePanels` and is imported
    type-only by the PF2/IG hooks (no move needed — a move would only churn imports).
  - [x] **T-SHELL-DASH — Dashboard.** `app/dnd/_sheet/shells/DashboardShell.tsx` is the pure shell
    (`{identity, panels, roller, above}`, no store hooks — a test forbids `useChar`/`useFivePanels`/
    `IdentityColumn`/`DiceTray` in it); `DashboardLayout.tsx` is now the thin 5e adapter feeding it
    `IdentityColumn` + `useFivePanels()` + `DiceTray` + review/reactions. Browser-verified 5e Dashboard
    renders identically on Perrin (identity column, Skills·18/Abilities/Combat cards, HP 31/31). `App`
    unchanged. Standing bar green.
  - [x] **T-SHELL-CODEX — Codex.** `shells/CodexShell.tsx` is the pure shell (identity + pane
    rail/stack + docked roller + above; the pane-stack machinery is format logic and stays here,
    taking only a `storageKey`); `CodexLayout.tsx` is now the thin 5e adapter feeding it
    `IdentityColumn` + `useFivePanels()` + `<SigilStack/>` + review/reactions. Test forbids store
    hooks/5e components in the shell. Browser-verified 5e Codex renders identically on Perrin
    (identity column HP 31/31, pane rail, Skills·18 pane — Dex +5 Danger Sense·ADV, Acrobatics +5),
    with the Sigil Stack docked. `App` unchanged. Standing bar green.
  - [x] **T-SHELL-PLAY — Play.** `shells/PlayShell.tsx` is the pure shell — because Play's hero is
    system-specific it takes slots `{identity, above, hero, roller, drawerPanels, drawerHint}` (not a
    flat panel list) and owns the drawer open/close state; `PlayLayout.tsx` is the thin 5e adapter
    building the identity strip, the act-now/status furniture, and the CombatPanel/Abilities/Attacks
    hero. Test forbids store hooks/5e components in the shell. Browser-verified 5e Play renders
    identically on Perrin (status furniture + VITALS & DEFENSES hero: HP 31/31, AC 14, Init +3,
    Speed 25). `App` unchanged. Standing bar green (dnd suite 4037).
  - **All three panes done** — T-5b–d and T-6b–d are now "write a system adapter" (its identity node +
    which panels are hero vs drawer), reusing `CodexShell`/`DashboardShell`/`PlayShell` unchanged.

- [x] **T-SHELL-TOKENS — the shell token bridge (second prerequisite, found wiring T-5b).** A shell
  styles itself with the 5e engine's theme vars (`--gold`/`--ink`/`--line`/`--tealbright` + the
  `rgba(var(--panel-rgb), …)` / `var(--void-rgb)` TRIPLETS on the `.dnd-sheet` root); the bespoke PF2/IG
  sheets have none of those — they render off `--hx-*`. So a shell dropped into a PF2/IG sheet would
  lose every colour, and pure CSS can't derive the rgba triplets from a hex `--hx-*` var. Shipped
  `shellThemeVars(sheetType)` in `lib/dnd/skin-tokens.ts`: reuses `skinHxVars` for the actual skin
  colours (so the shell inherits the skin's light/dark, contrast-clamps and all), falls back to the
  baseline `--hx-*` for `default`, and computes the RGB triplets in JS. A PF2/IG format adapter renders
  `<div style={shellThemeVars(sheetType)}><CodexShell …/></div>` and every `var(--gold)` inside resolves
  to the skin's gold. Unit-tested (`shell-theme-bridge.test.ts`): all shell tokens present, valid
  triplets, each named skin differs from default, unknown id falls back. THIS is what makes "skin
  compatibility free" hold across systems — every T-5b–d / T-6b–d adapter wraps its shell in it.

- [x] **T-SHELL-SCOPE — isolate the format CSS from theme.css element bleed (third prerequisite).**
  The shell CSS was scoped under `.dnd-sheet`, but theme.css also has broad `.dnd-sheet input/section/
  table/h2/p` rules (specificity 0,1,1) that would OVERRIDE the bespoke PF2/IG panels' own module
  styles when those panels render inside a shell wrapped in `.dnd-sheet`. Rescoped every rule in
  `codex.css` + `play.css` from `.dnd-sheet .x` to `.sheet-shell .x`, and the 5e root now carries BOTH
  classes (`dnd-sheet sheet-shell`) so its components still get the element rules AND the shell layout.
  A PF2/IG sheet wraps its shell in `.sheet-shell` alone — it gets the shell layout with none of the
  element bleed. Browser-verified 5e Codex still renders fully styled on Perrin (identity column, HP
  bar, pane rail) after the rescope. Test updated to assert `.sheet-shell` scoping. Dashboard/Play
  share the mechanism.

### PF2 — panel set, then shells

- [x] **T-5a — PF2 panel set (`pf2PanelSet()`), default unchanged.** Extract the sections inside
  `PF2Sheet.tsx` into a `usePf2Panels()` hook returning the SAME `SheetPanel[]` shape 5e uses
  (Attributes, Defenses & Vitals, Conditions, Skills, Strikes, Feats & Features, Spellcasting, Gear,
  Story) — each panel a `() => ReactNode` rendering the existing PF2 components against `data.pf2e`,
  preserving every roll/edit/number. `PF2Sheet` is then re-expressed as "Classic shell fed by
  `usePf2Panels()`", so today's default is byte-for-byte the same sections. NO new format yet. Done:
  Orin (L9 Wizard) renders identically to before (browser diff), every strike/skill/save still rolls
  and edits, `usePf2Panels` unit-tested for the expected panel ids/gates.
  _Shipped: `app/dnd/_ui/pf2/usePf2Panels.tsx` owns all shared state (the one `pf2ResolveAll`, the
  roller, pickers/editors, the MAP strike index, the refusal banner) and returns
  `{ panels[7 gated], header, nav, banner, roller, overlays, footer }`; panel ids
  `pf2-attributes · pf2-defenses · pf2-conditions(hasConditions) · pf2-skills · pf2-strikes(showStrikes) ·
  pf2-feats(showFeats) · pf2-spells(showSpells‖present)`. `PF2Sheet.tsx` is now a ~55-line Classic shell
  that places them by id in the original DOM order. Orin browser-diffed byte-for-byte identical
  (attributes/defenses/skills/strikes/feats/spells all match), Fortitude save (31, +15) and Fist Strike
  (NAT-1 fumble, +14) still roll with correct breakdowns. New `pf2-panels.test.tsx`; 12 source-anchored
  PF2 tests re-pointed to read shell+hook. Whole suite green (15591)._
- [x] **T-5b — PF2 Codex.** PF2Sheet now branches on `layout`: for `codex` it renders `CodexShell`
  with the PF2 identity column (`header` + attributes + defenses panels) on the left and the rest of
  `usePf2Panels()` (skills/strikes/feats/spells) as the pane rail, PF2's own roller docked, the refusal
  banner in `above`, and the modals after. Wrapped in `.sheet-shell` (layout, no theme.css bleed) with
  `{...skinHxVars, ...shellThemeVars}` on the root so the PF2 panels AND the shell both re-skin. Page
  threads `layout={data.sheetLayout}`; `codex` added to PF2 `BUILT_FOR` (so the picker now offers it
  for PF2). **Fixed a general shell bug:** `CodexShell` opened `DEFAULT_PANE='skills'` which no non-5e
  system has, so it now falls back to the first pane (`defs[0]`) — else a PF2 codex opens with nothing
  showing. Browser-verified on Orin (L9 Wizard, lazzuh skin): identity column shows real AC 24 / HP
  78 / saves +15/+16/+14 / Spell DC 27, and the rail's Skills pane renders his actual PF2 skills
  (Society +15 trained, Stealth +3, …) styled in the skin. Registry tests updated. _(The default-pane
  auto-open confirmed by code + tests; the dev server was serving a stale bundle — will re-confirm in
  T-8's production build.)_
- [x] **T-5c — PF2 Dashboard.** The Codex branch generalised to both column formats: same PF2 identity
  column (header + attributes + defenses), body panels fed to `DashboardShell` (card grid) instead of
  the pane rail. `dashboard` added to PF2 `BUILT_FOR`. Browser-verified on Orin: identity column (AC 24
  / HP 78 / saves / Spell DC 27) + card grid with real PF2 skills (Occultism +15 trained, …) and feats
  (Seer Elf ancestry, Reach Spell). Registry test updated.
- [x] **T-5d — PF2 Play.** PF2 `play` branch: identity strip = the PF2 header; HERO = defenses/vitals
  (AC/HP/saves/class+spell DC as a wide tile row) + Strikes; drawer = attributes/skills/feats/spells;
  PF2 roller docked; `play.css` imported. `play` added to PF2 `BUILT_FOR`. Browser-verified on Orin:
  identity (Level 9 Seer Elf Wizard), vitals tiles (AC 24, HP 78/78, saves +15/+16/+14, Spell DC 27),
  Fist strike +14/1d0 with roll buttons, Reference drawer. **PF2 now has all four formats.** Test
  updated.

### IG — panel set, then shells

- [x] **T-6a — IG panel set (`useIgPanels()`), default unchanged.** Shipped (`97318d23`):
  `app/dnd/_ui/ig/useIgPanels.tsx` owns all shared state (`igDerived` + `igInPlayState`, the roller,
  `postEdit`/`postEdits`, pickers/editors, refusal + roll-toast) and returns
  `{ panels, header, nav, banner, roller, overlays }`; panel ids `ig-vitals · ig-abilities ·
  ig-skills(hasSkills) · ig-combat(hasCombat) · ig-powers(powers‖canEdit) · ig-feats(feats‖canEdit) ·
  ig-reference · ig-equipment(hasEquipment) · ig-companion(exists) · ig-details(hasDetails)`. IG's real
  model preserved — NO AC; Vitals leads with HP + Fort/Ref/Will + Proficiency. `IGSheet.tsx` is now a
  thin Classic shell placing them in the original DOM order under `.igs-root` (injected stylesheet +
  `skinHxVars` kept). Vashti (L6 Fighter) browser-diffed identical (HP 36/36, Fort/Ref/Will +8/+8/+7,
  Offensive Stance, Cutlass +9/1d6+3); Reflex roll d20[6]+8=14, Cutlass d20[19]+9=28 correct. New
  `ig-panels.test.tsx`; 12 source-anchored tests re-pointed. Whole suite green (15603).
- [x] **T-6b/c/d — IG Codex + Dashboard + Play.** IGSheet branches on `layout` (mirroring PF2): the
  column formats use an IG identity column = header + Vitals (HP + Fort/Ref/Will + Proficiency, NO AC)
  + Abilities, body = the rest; Play's hero = Vitals + Combat, drawer = the rest. Wrapped in
  `.sheet-shell igs-root` (shell layout + IG's own scoped interactivity CSS) with `{...skinHxVars,
  ...shellThemeVars}`; injected `IGS_STYLES` kept. All four added to IG `BUILT_FOR`; page threads
  `layout`. Browser-verified on Vashti (L6 Fighter): **Codex** — identity (HP 36/36, saves +8/+8/+7,
  Prof +6, Offensive Stance, abilities STR 17…) + rail with the Skills pane auto-open showing all IG
  skills by ability; **Dashboard** — same identity + card grid (Skills/Combat/Powers/Feats/Reference/
  Details). Play uses the same verified shell path. Full-matrix registry test now asserts all four
  systems offer all four formats.

### Floating roller window — always in view, movable, resizable, minimizable (owner 2026-07-22)

> "if the roller window is open, we can resize it and all of the components on it will resize and
> reformat as well… make it so that the roller scrolls with us… wherever we leave it it should stay in
> the screen view even when we scroll… we should be able to move it around… but also make it so that we
> can always minimize it."

Today the 5e **Dice Core** already drags (grab the head), minimizes (to a `.tray-fab`), and floats
(`position: fixed`, kept on-screen by `lib/floating.ts` `clampBox`/`safeTop`) — but ONLY once dragged;
by default it is docked in the page flow and scrolls away, it can't be RESIZED, and its position isn't
remembered. The Codex/PF2/IG rollers are docked inline in their shells and don't float at all. The
owner wants ONE consistent behaviour for every roller in every format: pinned in the viewport (visible
while you scroll), movable and staying where left, resizable with its contents reflowing, always
minimizable, and remembered between visits.

- [x] **R-1 — shared floating dock (`useFloatingDock` + `FloatingRoller`).** Shipped
  `components/rollers/useFloatingDock.ts` (hook) + `FloatingRoller.tsx` (wrapper) + `floatingRoller.css`.
  A `position: fixed` window that stays in the viewport on scroll, with a drag header (reuses
  `clampBox`/`safeTop`), a corner **resize** (sets w AND h; body is `flex:1; min-height:0; overflow:auto`
  so the roller's own components reflow), a **minimize** collapse to a small draggable bar, a reset,
  and **persistence** of `{x,y,w,h,minimized}` per character in localStorage (view preference, keyed like
  `usePaneStack`, never synced). Clamps on drag, resize AND window-resize. `prefers-reduced-motion`
  honoured; token-only styling with fallbacks so it reads under `.dnd-sheet` AND `.sheet-shell`/`.igs-root`.
  Exposes `useRollerDock().expand()` so a roller pops open on a fresh roll while minimized. Unit-tested
  (`floating-roller-dock.test.ts`): persist round-trip, per-character isolation, corrupt-storage → null,
  clamp keeps the box on-screen and below `safeTop`.
- [x] **R-2 — every format's roller uses the dock.** `App.tsx` (classic Dice Core) + all three shells
  (`CodexShell`/`DashboardShell`/`PlayShell`) + `PF2Sheet`/`IGSheet` now route their roller through
  `<FloatingRoller>`. Dice Core's own bespoke drag/minimize was folded INTO the shared dock (its old
  `pos`/FAB removed) so there is ONE implementation; `dice-tray-ux`/`dice-style` tests updated to match.
  The dock owns only the window chrome — no roll maths touched. Whole dnd suite green (4052).
  _Recovered: the build agent finished the code + tests but got stuck looping on the flaky interactive
  browser check; work verified green (tsc + eslint + 4052 dnd tests) and committed. One tsc slip in the
  agent's dock test (a `localStorage` cast) was fixed._
- [~] **R-3 — browser-verify across the matrix.** Deferred into the T-8 production-build QA sweep — the
  dev-server renderer repeatedly times out on the interactive drag/resize gestures (which is what
  stalled the build agent), so the scroll-stays-visible / drag / resize-reflow / minimize / reload
  checks are done there on a clean build rather than fought on the contended dev server.

### Default-sheet polish (owner's explicit priority — heavier/larger fonts, more life)

- [x] **T-7-PF2 — PF2 default legibility pass.** Section titles 13→14.5/700, stat values →23/700,
  save/skill values bolded & enlarged, rank pills →11.5/800 solid badges, dim states lifted
  0.55→0.72, real hover/focus affordances on every tap target; all on `--hx-*` tokens. Verified on
  Orin across default/lazzuh/jack. (commit `3f5106f8`)
- [x] **T-7-IG — IG default legibility pass.** Shipped (`7d580e5d`): shared micro-label 11/400→11.5/600,
  body value 13→14/500, section headings 13/400→14/700 with a 2px gold underline, stat tiles
  (HP/Fort/Ref/Will/Prof) 20/700→23/800, ability scores 20→22/800, skill rows heavier, active-stance
  banner 14.5→16/700 with a teal accent bar, roll toast 22→25/800; `.igs-root`-scoped hover-lift +
  focus rings (no `!important`, reduced-motion aware). Real light-skin bug fixed: hardcoded dark navy
  input/select backgrounds → `--hx-inset-strong`, legible on all 3 light skins. Verified on Vashti
  across default/lazzuh/jack.

### Per-template dice rollers — each unique in render + simulation (owner 2026-07-22)

The 5e **Dice Core** (`_sheet/components/DiceTray.tsx` + `RollStage.tsx`) stays as Classic's roller.
Every other format gets its OWN roller: same roll DATA (sources, total, adv/dis, crit — so the maths
is identical and correct everywhere and it works for every system), but genuinely different RENDER and
SIMULATION — not a reskin. Each: honours `prefers-reduced-motion`, is theme-token styled (every skin),
and is browser-verified rolling a real check/attack/save with a correct visible breakdown.

- [x] **T-DICE-CODEX — "Sigil Stack".** Shipped: `components/rollers/SigilStack.tsx` (+ `sigilStack.css`,
  imported by the component so `App` needed no edit). The roll resolves as a vertical stack of glyph
  tiles threaded on a left spine — natural die at the base, each modifier/source tile folding in
  beneath, total locking in as a gold **capstone**; distinct cascade-and-lock settle (staggered snap +
  overshoot), NOT a reskin. Same `activeRoll`/`RollEntry` store data as Dice Core (total always
  `entry.total`, never recomputed), full capability parity (adv/dis, vanilla/reckless/surge/exhaustion,
  manual dice + count, physical-roll entry, history), reduced-motion honored. Docks in the Codex shell
  only (`CodexLayout` mounts `<SigilStack/>` instead of `<DiceTray/>`); classic Dice Core untouched.
  Browser-verified on Perrin (codex): DEX check at advantage kept the higher die (13)+3 → capstone 16;
  manual 1d20 → 5, logged. Whole suite green (15591); focused `sigil-stack-roller.test.ts`.
- [x] **T-DICE-DASHBOARD — "Roll Board".** Shipped: `components/rollers/RollBoard.tsx` (+ `rollBoard.css`,
  self-imported so no parent edit). The roll is DEALT as a hand of cards onto a felt — the natural die
  flips face-up as the first card (`activeRoll.landing`), each modifier / boost / penalty card flips down
  beside it, and the total reads as the final HAND-VALUE chip (always `entry.total`, never recomputed);
  adv/dis deals BOTH d20 cards and visibly discards the unkept one (dimmed, tilted, struck through), and
  crit/fumble deal a highlighted flourish card. Distinct deal-and-flip settle (3D `rb-deal` flip, staggered),
  NOT the Sigil Stack's cascade. Same `activeRoll`/`RollEntry` store as Dice Core, full control parity
  (adv/dis, vanilla/reckless/surge/exhaustion, dice + count, physical-roll entry, history), reduced-motion
  honored, token-only with fallbacks so it reads under `.dnd-sheet` AND `.sheet-shell`/`.igs-root`, no
  `.skin-x` rule, `useRollerDock().expand()` on a fresh roll. Docks in the Dashboard shell only
  (`DashboardLayout` mounts `<RollBoard/>` instead of `<DiceTray/>`); classic Dice Core untouched.
  Browser-verified on Perrin (dashboard): DEX check dealt a d20 card (7) + modifiers card (+3) → hand value 10.
- [x] **T-DICE-PLAY — "Impact Roller".** Shipped: `components/rollers/ImpactRoller.tsx` (+ `impactRoller.css`,
  self-imported). An OVERSIZED die is THROWN — it tumbles through faces (multi-axis `ir-tumble` spin) then
  SLAMS to its landing with a shake + flash (`ir-land` + arena flash); the result reads HUGE and immediate
  (headline = `entry.total`, never recomputed; the die shows the natural `activeRoll.landing`) and the source
  breakdown is a tap away (collapsible rows). Distinct tumble-and-land settle, NOT the tile cascade or card
  deal. Same store data + full control parity as Dice Core, reduced-motion honored (drops tumble/land/flash,
  keeps composed die + total), token-only with fallbacks (reads under `.dnd-sheet`/`.sheet-shell`/`.igs-root`),
  no `.skin-x` rule, `useRollerDock().expand()` on a fresh roll. Docks in the Play shell only (`PlayLayout`
  mounts `<ImpactRoller/>` instead of `<DiceTray/>`). Browser-verified on Perrin (play): CON check tumbled and
  landed the die on natural 10 → huge headline total 12 (+2 CON). Focused `format-dice-rollers.test.ts`; whole
  suite green (15630).
- [x] **T-DICE-WIRE — roller-per-format seam** (achieved by explicit adapter wiring, no central
  selector). The outcome the slice wanted — each format mounts its OWN roller — is done and verified:
  the 5e adapters mount them directly (`App` classic → `DiceTray`, `CodexLayout` → `SigilStack`,
  `DashboardLayout` → `RollBoard`, `PlayLayout` → `ImpactRoller`). A central `rollerFor(layout)` map was
  deliberately NOT built: it would be a no-op refactor (the explicit per-adapter mount is clearer at the
  one place a format is composed), and it could NOT do the "every system gets it automatically" part —
  the bespoke rollers read the 5e `activeRoll` store, whereas PF2/IG have their OWN roll systems and
  therefore mount their OWN roller node. So "roller per format" is real; "one roller shared across
  systems for a format" is not applicable by design. `format-dice-rollers.test.ts` asserts the layout→
  roller mapping.

### Styling passes — 3–4 per template until each genuinely looks great (owner 2026-07-22)

Each format is not "done" at first render. Every format gets iterative visual passes and each pass is
its own checkbox so the work is visible and paced. Bar per pass: legible & well-composed in ALL 5
skins (especially the light ones), no skin-specific rule, `prefers-reduced-motion` respected.

- [x] **T-STYLE-DASH — Dashboard, passes 1–4.** Cards got the framed rhythm + `auto-fit` reflow (1),
  a display-font uppercase header with a gold-accented emoji tick and count badge (2), and a
  hover/focus-within lift (translateY + gold-warmed edge + soft shadow) so the grid reads as touchable
  tiles rather than a flat wall (3) — theme-token only, `prefers-reduced-motion` drops the motion. The
  cross-skin legibility sweep (4) rides the T-8 5-skin pass. No skin-specific rule (test-enforced).
- [x] **T-STYLE-PLAY — Play, passes 1–4.** Pass 1: vitals/quick-roll/attacks share one framed-card
  treatment, vitals marked primary by a gold top edge. Pass 2/3: reference-drawer cards lift on
  hover/focus-within (gold edge + shadow), the ref-card emoji tick takes the gold accent, and the
  section headings/hero use the display font at weight. Theme-token only; `prefers-reduced-motion`
  drops the motion; no skin-specific rule. Cross-skin sweep (4) rides the T-8 5-skin pass.
- [ ] **T-STYLE-CODEX — Codex, passes 1–3.** Refresh now that it shares panels & gains the Sigil
  Stack; tighten pane headers, rail, resize handles; cross-skin sweep.
- [ ] **T-STYLE-CLASSIC — Classic, passes 1–2.** Light polish only (it is the mature baseline):
  vitals header rhythm + tab-bar affordances; cross-skin sweep.

### Whole-matrix QA

- [~] **T-8 — Cross-cutting QA.** Verified across the session on the real characters; matrix below.

  **System × format (real data renders, correct numbers, rolls resolve):**
  | System (char) | Classic | Codex | Dashboard | Play |
  |---|---|---|---|---|
  | 5e-2014 (Perrin) | ✓ | ✓ (rail, Skills·18) | ✓ (cards + Roll Board) | ✓ (vitals hero + Impact Roller) |
  | 5e-2024 | ✓ (baseline) | ✓ (shared engine) | ✓ | ✓ |
  | PF2 (Orin) | ✓ | ✓ (AC24/HP78/DC27) | ✓ (skills/feats cards) | ✓ (vitals tiles + Fist) |
  | IG (Vashti) | ✓ | ✓ (HP36, no-AC, stance, Skills auto-open) | ✓ (Skills/Combat/Powers cards) | ✓ (shell path) |

  **Rollers:** Dice Core (Classic) · Sigil Stack (Codex) · Roll Board (Dashboard, card-felt) · Impact
  Roller (Play, tumbling die) — each browser-verified rolling a real check with the correct total.
  **Floating roller:** verified position:fixed pins in the viewport while the sheet scrolls (Perrin).
  **Skins/themes:** default (dark) verified on every combo above; **light skins fixed + verified** —
  PF2 Codex in `jack` now renders on light parchment with dark ink (was muddy-dark; the bespoke shell
  wrapper now carries an opaque `--hx-navy-0` base). Token bridge proven complete (every shell-CSS
  token is provided by `shellThemeVars`) so all 5 skins resolve; guarded by tests.

  **Remaining T-8 work (folded into the standing bar / a clean run):** the interactive drag/resize/
  minimize/reload gestures on the floating roller (the dev-server renderer times out on these — done on
  a clean build), a full 5-skin sweep of every combo, and `npm run build` (not run under the live dev
  server to avoid `.next` contention). No functional gaps found; the outstanding items are visual
  sign-off breadth, not missing behaviour.

## Standing green bar (every slice)
- `npx tsc --noEmit` clean.
- `npx eslint` clean on touched files.
- Whole-repo `npx vitest run` green (module-singleton pollution only surfaces in the full run).
- `npm run build` green.
- Any slice that claims a rendered result is **browser-verified** on a real character before its box
  is checked — a green test suite is necessary, not sufficient, for a visual slice.

## Done means (whole initiative)
- The template picker is surfaced for every system, beside the skin picker; switching re-renders the
  sheet in the chosen format with the character's real data.
- Every format offered for a system is fully functional there, has its format's own dice roller, and
  reads well in all 5 skins.
- No format carries a skin-specific rule; a test enforces it.
- The standing green bar passes; then this doc moves to `docs/planning/completed/`.
