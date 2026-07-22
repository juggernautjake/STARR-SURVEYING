# Unified chip pickers (Style · Template · Theme) + 5 shared colour themes

**Status:** IN PROGRESS · started 2026-07-22

## Owner ask (verbatim, stitched)

> I like how underneath the character info on the hextech we have the option to choose a theme… then
> below that we have the layout choice too. But the style sheet is located somewhere else. What I want
> is for the theme, layout and style sheet picker to all be clickable elements that get highlighted
> depending on which one is active, just like they are for the hextech, but I want it for all of the
> character sheet templates and styles. And every character sheet template should work with every style
> sheet. We also need at least 5 variant themes for each style… we have hextech gold, shadow isles,
> noxus crimson, and freljord ice. Please create one more that is unique and apply it to each template
> and style… every template and every style sheet and every theme available for all character sheets
> and systems… classic and codex version of the pathfinder character sheet and the IG sheet and the
> 2024 and the 2014, as well as all of the other character sheet templates too.
> …this is a request to change my dropdown request actually.

**Decisions (asked + answered 2026-07-22):**
- **5 shared themes, every style** — the 5 colour themes apply to EVERY style. Style = structure, Theme
  = colour. (Not 5 bespoke palettes per style.)
- **Pickers together at the top** — one chip-picker block just below the Build Kit, page chrome above
  every sheet, identical for every system + template. REPLACES the collapsible Style/Template dropdowns.

## The three axes, clarified

- **Style** (`character.sheet_type`) — the visual FAMILY / structure: Hextech, Neon Odyssey, Candy,
  Homebrew, streamer. Provides the frame/decoration + fonts. Today it ALSO carries the colour; after
  this it defers colour to the Theme when one is chosen.
- **Template** (`character.data.sheetLayout`) — the LAYOUT: Classic / Codex / Dashboard / Play. (Done.)
- **Theme** (`character.skinVariant` → stored in `data.skinVariant`) — the COLOUR palette, now a set of
  **5 shared themes usable on every style**: Hextech Gold · Shadow Isles · Noxus Crimson · Freljord Ice
  · **+ 1 new unique theme**. A chosen theme recolours whatever style is active; with none chosen the
  style shows its native colours.

## Current state (what exists)

- `theme.ts`: `ThemeVariant{key,label,theme:SheetTheme}`, `HEXTECH_VARIANTS` (4), `themeVariantsFor(skin)`
  (per-skin: hextech→4, streamer→2, others→1), `resolveThemeVariant`, `themeToCssVars(SheetTheme)`
  (→ 5e `.dnd-sheet` `--*` vars). `char.skinVariant` persists the choice; 5e `App.tsx` renders the
  `SkinSwitch` chip row (the "THEME //" model the owner likes) and applies `themeToCssVars(effectiveTheme)`.
- `SheetStyleBrowser` (skin, `sheet_type`) + `TemplateBrowser` (layout) — COLLAPSIBLE dropdowns, page
  chrome (just moved to the top). To be replaced by chip rows.
- Bespoke PF2/IG sheets colour off `--hx-*` via `skinHxVars(sheet_type)` — NO theme layer today.
- `shellThemeVars(sheetType)` bridges a skin → the shared shell tokens.

## Slices

**Legend:** `[x]` shipped · `[~]` in progress · `[ ]` not started. Standing bar (each slice): `tsc`,
`eslint`, whole-repo `vitest`, and any rendered result browser-verified before its box is checked.

- [ ] **U-1 — the 5th theme + make the 5 themes universal.** Add a new unique `SheetTheme` (a full
  palette distinct from the four LoL-region looks — e.g. a warm "Sunfire Ember" or a violet "Void
  Prophet"; pick one and make it genuinely its own). Introduce a shared `THEMES` list = the 4 Hextech
  palettes + the new one (5), each `{key,label,theme}`. Change `themeVariantsFor` so EVERY skin returns
  these 5 (the theme is now universal, not skin-bound); keep each skin's native palette reachable as the
  default when no `skinVariant` is set. 5e already applies `themeToCssVars(effectiveTheme)`, so 5e
  recolours to any of the 5 for free. Test: `themeVariantsFor(anySkin)` returns 5; each theme resolves.
- [ ] **U-2 — theme → bespoke colour bridge.** New `themeToHxVars(SheetTheme)` mapping a theme's colours
  to the `--hx-*` tokens the PF2/IG sheets (and `shellThemeVars`) read — the mirror of `skinHxVars` but
  keyed by a theme, with the RGB triplets computed in JS. `PF2Sheet`/`IGSheet` apply the chosen theme's
  `--hx-*` on their root (over the skin's, so the theme wins) and read `data.skinVariant`. So a bespoke
  sheet recolours to any of the 5 themes, in any format, on any style. Unit-test the bridge (all tokens,
  valid triplets, differs per theme). Browser-verify Orin/Vashti recolour.
- [ ] **U-3 — `/theme` endpoint + cross-system persistence.** The theme choice (`skinVariant`) is a 5e
  store field today; bespoke sheets have no store. Add `/api/dnd/characters/[id]/theme` (owner/DM-gated,
  patches `data.skinVariant`) so the chip picker sets the theme for EVERY system — the twin of the
  `/layout` endpoint. 5e keeps using the store `setChar` (which writes the same field); the picker uses
  the endpoint so it works for PF2/IG too. Guard test (gates + patches only the one field).
- [ ] **U-4 — the unified chip-picker block (replaces the dropdowns).** One `SheetChrome` component,
  page chrome just below the Build Kit, for EVERY system, rendering THREE chip rows in the `SkinSwitch`
  idiom (a labelled row of `btn`-chips, the active one highlighted + swatch): **Style** (all skins),
  **Template** (all formats for the system), **Theme** (all 5). Each chip POSTs its axis's endpoint
  (`sheet_type` PATCH · `/layout` · `/theme`) and refreshes. Remove `SheetStyleBrowser`/`TemplateBrowser`
  dropdowns from the chrome (keep the components only if still used elsewhere) and the in-sheet 5e
  `SkinSwitch` (its job moves here). Every option always shown + highlighted-when-active. Browser-verify
  the block reads identically on 5e, PF2, IG.
- [ ] **U-5 — full matrix availability + QA.** Confirm every Style × Template × Theme renders on every
  System with real data and readable colour (esp. the light-leaning themes on the light styles), rolls
  work, nothing empty. Record the matrix. Then move this doc to `completed/`.

## Done means
- Style, Template, and Theme are all chosen the same way — highlighted chips in one block at the top,
  on every character, every system, every template.
- All 5 themes work on every style, every template, every system (5e + PF2 + IG), recolouring correctly.
- The new 5th theme is unique and available everywhere.
- Standing bar green per slice; no format/style/theme-specific hacks a test forbids.
