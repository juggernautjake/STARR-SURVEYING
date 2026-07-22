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

### T-1 — Infrastructure: registry + picker + endpoint ✅ the foundation
- Widen `SheetLayout` to `'classic' | 'codex' | 'dashboard' | 'play'`.
- `lib/dnd/sheet-templates.ts` — `SHEET_TEMPLATES` (id, label, blurb, wireframe hint) and
  `templatesForSystem(system)` reporting which formats are BUILT for each system (honest coverage,
  like the catalog-status objects — a format not yet built for a system is not offered there).
- `/api/dnd/characters/[id]/layout` route — owner/DM-gated, sets `data.sheetLayout`.
- `TemplateBrowser.tsx` — page-chrome picker, surfaced for all systems in `page.tsx`, next to the
  skin picker. Remove the in-engine `LayoutSwitch`.
- Tests: every offered template maps to a real shell; the endpoint gates + persists.

### T-2 — 5e panel-set extraction (make the format seam explicit) 
Factor the 5e `defs[]` currently living inside `CodexLayout` into a shared `fivePanelSet()` the shells
consume, so Classic/Codex/Dashboard/Play all read one panel list.

### T-3 — Dashboard shell (5e first)
The card-grid shell. Identity strip on top; each panel a themed card in a responsive `auto-fit` grid;
internal scroll per card past a max height; reflows phone→wide. Green on 5e, all skins.

### T-4 — Play shell (5e first)
Big vitals band (HP/AC/saves as large tap targets) + an Attacks/Actions block; everything else in a
collapsible reference drawer. Tuned for at-the-table play; all skins.

### T-5 — PF2 panel-set + all 4 formats
Split `PF2Sheet` into `pf2PanelSet()` preserving every roll/edit/number; its default becomes Classic.
Wire Codex/Dashboard/Play. Browser-verify each × 5 skins on Orin (Lv 9 Wizard).

### T-6 — IG panel-set + all 4 formats
Split `IGSheet` into `igPanelSet()`; default becomes Classic; wire the other three. Browser-verify
each × 5 skins on Vashti (Lv 6 Fighter).

### T-7 — Default-sheet polish (PF2 + IG) — the owner's explicit priority
Heavier, larger, more legible fonts; stronger hierarchy; hover/focus affordances; premium feel.
Readable on all 5 skins, especially the 3 light ones. (Started in parallel; folds in here.)

### T-8 — Cross-cutting QA
Drive every (system × format × skin) that is claimed built — 4×4×5 = up to 80 combinations, minus the
honestly-unbuilt — confirming real data renders, nothing is empty, and text is readable everywhere.

## Done means
- The template picker is surfaced for every system, beside the skin picker, and switching re-renders
  the sheet in the chosen format with the character's real data.
- Every format offered for a system is fully functional there and reads well in all 5 skins.
- No format carries a skin-specific rule; a test enforces it.
- `npx tsc --noEmit`, `npx eslint`, whole-repo `npx vitest run`, `npm run build` green per slice.
