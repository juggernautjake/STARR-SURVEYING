# Cross-system template + style/theme parity (PF2/IG feel the change, like 5e)

**Status:** IN PROGRESS · started 2026-07-23

## Owner ask (stitched)

> Evaluate the templates/styles/themes across systems. The templates for PF2 and IG don't actually change —
> they just change colors. Make the styling, themes, and templates actually align with what's been built.
> Every system's sheet must work for its own system, but Classic/Codex/Dashboard/Play should RESEMBLE each
> other across systems (with each system's own infrastructure), and the styles + themes should resemble each
> other across systems too. It seems like styles/themes/templates for PF2/IG don't change much — make them
> actually change. Make all the templates/styles/themes the 5e ("Neon Odyssey") players use available for
> every system, geared to each.

## Evaluation (what's actually true in the code)

- **Templates ARE structurally distinct on PF2/IG, at parity with 5e.** `PF2Sheet`/`IGSheet` branch on `layout`
  and route Classic/Codex/Dashboard/Play to the SAME shared shells (`CodexShell`/`DashboardShell`/`PlayShell`)
  5e uses, with system-appropriate identity/hero panels. Codex vs Dashboard share the outer 2-column frame and
  differ only in the right body (resizable pane rail vs reflowing card grid) — but that's exactly how 5e
  behaves too. So "templates just change colors" is not literally true; the perception comes from (a) Codex ≈
  Dashboard being close cousins, and (b) the recolor riding on top of every layout.
- **Styles + themes ARE available and applied on PF2/IG — nothing is system-gated.** The unified `SheetChrome`
  picker offers all 5 styles + 5 themes on every system; `skinHxVars`/`themeToHxVars` derive a full `--hx-*`
  override set for each. BUT the change is a **color remap only**. The rich per-skin identity — FONTS (Cinzel
  serif / Pixelify pixel / Baloo rounded / Zilla slab / Oswald condensed), textures, frame art — lives in the
  5e-scoped `.dnd-sheet.skin-*` CSS in `theme.css`, which the bespoke PF2/IG sheets never consume. The skin
  fonts aren't even LOADED on PF2/IG pages (their `@import`s are inside 5e-only `theme.css`). That is why
  switching styles on PF2/IG "doesn't change much".

**Conclusion:** the fix is FIDELITY, not availability. Give the bespoke sheets the per-skin fonts (biggest
lever), then port a few skin visual treatments, so a style/theme switch changes the FEEL, not just the hue.

## Slices

- [x] **CS-1 — bridge the per-skin FONTS to PF2/IG SHIPPED 2026-07-23.** (a) Extracted the skin webfont
  `@import`s into `app/dnd/_sheet/styles/fonts.css`, imported by the dnd layout, so Oswald/Pixelify/Baloo/
  Zilla/Spectral/Cinzel load on EVERY /dnd page (they were 5e-`theme.css`-only). (b) `skinHxVars` now emits
  `--hx-font-display/body/mono` from the skin's `fonts` (map: lazzuh→Oswald, streamer→Pixelify, donata→Baloo,
  jack→Zilla; default→Hextech baseline, no override), and `themeToHxVars` emits from the theme's fonts (the
  streamer pink/blue variants carry Pixelify; the shared THEMES keep the Hextech face). PF2/IG already read
  `var(--hx-font-*)` everywhere, so switching STYLE now changes the TYPEFACE, not just colours. 7 unit tests;
  full suite green (4286).
- [ ] **CS-1 (orig) — bridge the per-skin FONTS to PF2/IG (the biggest, cleanest lever).** (a) Load the skin fonts on
  every /dnd page (extract the `@import`s from `theme.css` into a `fonts.css` imported by the dnd layout, so
  Oswald/Pixelify/Baloo/Zilla/Spectral load everywhere, not just under the 5e sheet). (b) Make
  `skinHxVars(sheetType)` and `themeToHxVars(theme)` emit `--hx-font-display` / `--hx-font-body` /
  `--hx-font-mono` from the skin/theme's `fonts` — PF2/IG already read those vars everywhere. Then switching
  the STYLE actually changes the typeface on PF2/IG (default→hextech keeps the baseline). Unit-test the
  font-var emission.
- [ ] **CS-2 — skin-aware class + a few visual treatments on the bespoke sheets.** Put `skin-<id>` on the
  PF2/IG sheet roots (they already carry `.igs-root`/`.sheet-shell`), and add a SMALL set of skin-scoped
  accents that read on the hextech token system (e.g. the pixel skins' scanline/letter-spacing, the parchment
  skins' warmer panel texture, the slab skin's heavier rules) — the affordable subset of what `theme.css` does
  for 5e, so each style has a distinct texture, not just colour. Browser-verified per skin (QA phase).
- [ ] **CS-3 — make Codex vs Dashboard read as more distinct (all systems).** Optional polish: nudge the
  Dashboard card grid (denser, boxier cards) away from the Codex pane rail so the two aren't near-twins on a
  sparse character. Shared shells, so it lands on every system at once. Visual (QA phase).
- [ ] **CS-4 — parity audit.** Confirm every style × theme × template renders correctly on each system after
  CS-1/2 (contrast guardrail already covers the token half); the visual sweep is QA-phase.

## Done means
Switching the STYLE or THEME on a PF2 or IG sheet visibly changes the typeface + texture (not only colours),
matching the 5e experience; all four templates remain structurally distinct and recognizably the same
template across systems; every style/theme/template is available and geared for every system.
