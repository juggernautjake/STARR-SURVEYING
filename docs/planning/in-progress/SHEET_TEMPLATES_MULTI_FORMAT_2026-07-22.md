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

- [ ] **T-SHELL — split each shell into a pure `FormatShell` + a per-system adapter.**
  - A pure `FormatShell` variant (Codex/Dashboard/Play) that takes `{ identity: ReactNode, panels:
    SheetPanel[], roller: ReactNode }` and arranges them — no `useChar`, no system knowledge.
  - Thin 5e adapters rendered inside the provider that compute `useFivePanels()`, build
    `<IdentityColumn/>` + `<DiceTray/>`, and pass them in. `App` swaps to these; 5e output unchanged.
  - PF2/IG adapters (their own slices) compute `usePf2Panels()` / `useIgPanels()` and their own
    identity + roller, then reuse the SAME `FormatShell`.
  - Move the shared `SheetPanel` type to one module both `fivePanels` and the PF2/IG hooks import.
  - Done: 5e Codex/Dashboard/Play render identically (browser-diff Perrin) through the new adapters;
    no shell references `useChar`; the standing green bar. This unblocks T-5b–d and T-6b–d, which
    then become "write a system adapter", not "rebuild a format".

### PF2 — panel set, then shells

- [ ] **T-5a — PF2 panel set (`pf2PanelSet()`), default unchanged.** Extract the sections inside
  `PF2Sheet.tsx` into a `usePf2Panels()` hook returning the SAME `SheetPanel[]` shape 5e uses
  (Attributes, Defenses & Vitals, Conditions, Skills, Strikes, Feats & Features, Spellcasting, Gear,
  Story) — each panel a `() => ReactNode` rendering the existing PF2 components against `data.pf2e`,
  preserving every roll/edit/number. `PF2Sheet` is then re-expressed as "Classic shell fed by
  `usePf2Panels()`", so today's default is byte-for-byte the same sections. NO new format yet. Done:
  Orin (L9 Wizard) renders identically to before (browser diff), every strike/skill/save still rolls
  and edits, `usePf2Panels` unit-tested for the expected panel ids/gates.
- [ ] **T-5b — PF2 Codex.** Feed `usePf2Panels()` into the Codex shell for PF2; add `codex` to PF2 in
  `BUILT_FOR`. Browser-verify on Orin across all 5 skins. Done bar + registry test updated.
- [ ] **T-5c — PF2 Dashboard.** Feed `usePf2Panels()` into the Dashboard shell; add `dashboard` to
  PF2. Browser-verify Orin × 5 skins.
- [ ] **T-5d — PF2 Play.** Feed `usePf2Panels()` into the Play shell (vitals band = AC/HP/class DC +
  saves; body = Strikes); add `play` to PF2. Browser-verify Orin × 5 skins.

### IG — panel set, then shells

- [ ] **T-6a — IG panel set (`useIgPanels()`), default unchanged.** As T-5a but for `IGSheet.tsx`
  (Vitals, Abilities, Skills, Combat, Stances, Powers, Feats & Features, Companion, Gear, Story)
  against `data.ig`. Re-express the default IG sheet as "Classic shell fed by `useIgPanels()`".
  Note: IG has no AC stat by design — the vitals panel must reflect IG's real defense model, not
  invent one. Done: Vashti (L6 Fighter) renders identically (browser diff); panels unit-tested.
- [ ] **T-6b — IG Codex.** Feed `useIgPanels()` into Codex; add `codex` to IG. Verify Vashti × 5 skins.
- [ ] **T-6c — IG Dashboard.** Feed `useIgPanels()` into Dashboard; add `dashboard` to IG. Verify × 5.
- [ ] **T-6d — IG Play.** Feed `useIgPanels()` into Play; add `play` to IG. Verify Vashti × 5 skins.

### Default-sheet polish (owner's explicit priority — heavier/larger fonts, more life)

- [x] **T-7-PF2 — PF2 default legibility pass.** Section titles 13→14.5/700, stat values →23/700,
  save/skill values bolded & enlarged, rank pills →11.5/800 solid badges, dim states lifted
  0.55→0.72, real hover/focus affordances on every tap target; all on `--hx-*` tokens. Verified on
  Orin across default/lazzuh/jack. (commit `3f5106f8`)
- [~] **T-7-IG — IG default legibility pass.** Same discipline for `IGSheet.tsx` + `ig*` classes:
  larger/heavier section titles, stat values, skill/ability text; lift faint dim states; hover/focus
  affordances; token-only so skins restyle for free. Verify on Vashti across dark + light skins.
  _(background agent in flight.)_

### Per-template dice rollers — each unique in render + simulation (owner 2026-07-22)

The 5e **Dice Core** (`_sheet/components/DiceTray.tsx` + `RollStage.tsx`) stays as Classic's roller.
Every other format gets its OWN roller: same roll DATA (sources, total, adv/dis, crit — so the maths
is identical and correct everywhere and it works for every system), but genuinely different RENDER and
SIMULATION — not a reskin. Each: honours `prefers-reduced-motion`, is theme-token styled (every skin),
and is browser-verified rolling a real check/attack/save with a correct visible breakdown.

- [ ] **T-DICE-CODEX — "Sigil Stack".** The roll resolves as a vertical stack of glyph tiles: the d20
  lands at the base, then each modifier tile (proficiency, ability, item, effect) snaps in beneath
  with its source label, and the total assembles top-down — echoing the Codex's stacked panes.
  Distinct settle animation (tiles cascade & lock). Replaces `DiceTray` for the Codex shell only.
- [ ] **T-DICE-DASHBOARD — "Roll Board".** A dealt-card roller: each die and each modifier is a card
  that flips face-up onto a felt and is totted like a hand; crit deals a second highlighted card;
  adv/dis deals two d20 cards and discards one visibly. Fits the card-grid identity. Dashboard only.
- [ ] **T-DICE-PLAY — "Impact Roller".** Big, physical, tactile: an oversized die tumbles and lands
  with a shake + flash, the result huge and immediate, the source breakdown a tap away. Built for
  the table. Play shell only.
- [ ] **T-DICE-WIRE — roller-per-format seam.** A `rollerFor(layout)` selector so each shell mounts
  its own roller and every SYSTEM (5e/PF2/IG) using that format gets it automatically (rollers read
  roll data, not system data). Test: each layout maps to its intended roller; Classic → Dice Core.

### Styling passes — 3–4 per template until each genuinely looks great (owner 2026-07-22)

Each format is not "done" at first render. Every format gets iterative visual passes and each pass is
its own checkbox so the work is visible and paced. Bar per pass: legible & well-composed in ALL 5
skins (especially the light ones), no skin-specific rule, `prefers-reduced-motion` respected.

- [ ] **T-STYLE-DASH — Dashboard, passes 1–4.** (1) hierarchy & card rhythm; (2) typography weight/
  size; (3) hover/focus/motion affordances; (4) cross-skin legibility sweep.
- [ ] **T-STYLE-PLAY — Play, passes 1–4.** As above, tuned for big-tap-target at-the-table feel.
- [ ] **T-STYLE-CODEX — Codex, passes 1–3.** Refresh now that it shares panels & gains the Sigil
  Stack; tighten pane headers, rail, resize handles; cross-skin sweep.
- [ ] **T-STYLE-CLASSIC — Classic, passes 1–2.** Light polish only (it is the mature baseline):
  vitals header rhythm + tab-bar affordances; cross-skin sweep.

### Whole-matrix QA

- [ ] **T-8 — Cross-cutting QA.** Drive every (system × format × skin) claimed built — up to
  4×4×5 = 80 combos minus honestly-unbuilt — on the three real characters (Perrin 2014 L4, Orin PF2
  L9, Vashti IG L6) plus a 2024 build, confirming real data renders, nothing is empty, rolls work,
  and text is readable everywhere. Record the matrix (built/verified/gap) in this doc before it moves
  to `completed/`.

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
