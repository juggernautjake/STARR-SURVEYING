# Cross-system templates + styles + themes: full parity for PF2/IG (match 5e)

**Status:** COMPLETE · started 2026-07-23 · closed 2026-07-23 (all slices shipped; QA sweep done)

## Owner ask (stitched, verbatim intent)

> Make the templates ACTUALLY different for PF2 and IG and match the templates available for the D&D versions.
> Fully build them out; every style and theme must be applicable to each template on each system. Each template
> must facilitate each system's mechanics/rules fully. Classic/Codex/Dashboard/Play should resemble each other
> across systems (same template = same look, geared per system), and styles/themes should resemble each other
> across systems too. The PF2/IG templates/styles/themes "don't really change" — make them actually change.
> Build a full, complete planning doc and build it all out in slices.

## Ground truth (verified in code)

- **Switching works.** `SheetChrome` offers all four templates for every system (`templatesForSystem` →
  classic/codex/dashboard/play for 2014/2024/PF2/IG). The Template chip POSTs `/layout` (saves
  `data.sheetLayout`, validated by `isTemplateBuiltFor`) then reloads; `page.tsx` reads `data.sheetLayout`
  fresh and threads it to `PF2Sheet`/`IGSheet`, which branch to the correct shell. No per-system gate.
- **Templates ARE structurally distinct** and use the SAME shells as 5e: Classic (stacked cards + jump-nav),
  Codex (identity column + resizable pane rail `PaneStack`), Dashboard (identity column + reflowing `dash-grid`
  cards), Play (compact identity + system `hero` + collapsible reference drawer). PF2/IG feed their own panels
  to those shells, so each template facilitates the system's mechanics.
- **Styles + themes ARE applied** on every template/system via the `--hx-*` token bridge (`skin-tokens.ts`),
  now including FONTS (CS-1) and per-skin TEXTURES (CS-2).

**So the mechanism is sound; the felt gap is (a) FIDELITY — PF2/IG only recolored, now also refont/retexture —
and (b) DISTINCTNESS — Codex and Dashboard read as near-twins (true on 5e too), so switching between them
looks like "nothing changed but colors."** This doc closes both, and hardens the whole matrix with tests.

## Slices

### Fidelity — make a STYLE/THEME switch change the feel (mostly shipped)
- [x] **CS-1 — per-skin FONTS on PF2/IG (SHIPPED 2026-07-23).** `fonts.css` loads every skin webfont on all
  /dnd pages; `skinHxVars`/`themeToHxVars` emit `--hx-font-display/body/mono`. Switching STYLE now changes the
  typeface (Oswald / Cinzel / Pixelify / Baloo / Zilla). 7 tests.
- [x] **CS-2 — per-skin TEXTURES + `skin-<id>` hook (SHIPPED 2026-07-23).** `skinClass` puts `skin-<id>` on
  every PF2/IG root; `skinAccents.css` paints a distinct subtle surface per style. 3 tests.

### Distinctness — make the four TEMPLATES unmistakably different (all systems)
- [x] **CT-1 — verify + guard the four are structurally distinct per system.** Render-test `PF2Sheet` and
  `IGSheet` (and the 5e layouts) at each of classic/codex/dashboard/play and assert each produces its shell's
  signature (Classic → the stacked `pf2Section`/`igs` cards; Codex → `codex` grid + `codex-accordion`/pane
  rail; Dashboard → `dash-grid`; Play → `play` + the reference drawer). This proves — and locks — that the
  templates really change on PF2/IG, and surfaces any layout that silently falls through.
- [x] **CT-2 (SHIPPED 2026-07-23) — make Codex vs Dashboard read as clearly different (shared shells → lands on every system).**
  The two share the outer 2-column frame; nudge them apart: Dashboard = a denser, boxier, always-open card
  GRID (equal-height cards, visible card chrome, tighter gutters); Codex = the single tall resizable pane
  RAIL it already is, emphasized (wider panes, rail affordance). A player switching between them must see an
  obviously different arrangement, not a recolor. Token-only CSS in `codex.css`; browser-verified per system.
- [x] **CT-3 — each template's SIGNATURE is legible (VERIFIED in the QA sweep 2026-07-23).** With the codex
  dead-space fixed (CM-2 below), the four templates are unmistakable at a glance on every system: Classic = the
  jump-nav + stacked cards; Codex = the identity column + tall accordion panes with the upright-letter rail;
  Dashboard = the boxed card GRID (all sections open); Play = the vitals/attack hero + collapsible Reference
  drawer. Confirmed identical-signature across 2014/2024/PF2/IG via Playwright screenshots.

### Full matrix — every style × theme × template × system
- [x] **CM-1 — instant, reliable template switching (SHIPPED + verified live 2026-07-23).** New
  `lib/dnd/layoutChoice.ts` (per-character client cache + `useSyncExternalStore` signal, mirroring
  `rollerChoice.ts`). `PF2Sheet`/`IGSheet` read `useLayoutChoice(characterId, layout)` and branch on that;
  `SheetChrome`'s template chip, for the prop-driven PF2/IG systems, writes the cache + moves the chip
  optimistically + persists in the background with NO reload (5e keeps the store-safe reload). Playwright:
  clicking Codex swaps `.framedPanel → .codex` with `reloadHappened:false`, marker survived, `sheetLayout`
  saved. Kills the "disappears and reappears" jank the owner reported.
- [x] **CM-2 — matrix parity audit (DONE 2026-07-23; two cross-cutting defects found + fixed).** Drove the full
  matrix in Playwright (all 4 systems × 4 templates, + style/theme variants) with a minted owner session
  against a fresh local build. Templates/styles/themes all render and change correctly per system. Two defects
  the sweep surfaced — both cross-cutting, both now fixed:
  - **Roller open-by-default overlapped the sheet.** A fresh viewer (no saved localStorage) got the 396px
    floating roller docked bottom-right, OPEN, clipping the right edge of the content on every template.
    Fix: `useFloatingDock` fresh default is now `minimized: true` — the sheet loads unobstructed and the roller
    pops open on the first roll (`useExpandOnRoll`) or a click of the corner dice FAB. Uniform across systems.
  - **Codex read as empty.** Only one short pane opened by default, so the column was one pane beside a tall
    staircase of closed 104px rail tabs — big dead space on 2014/2024/PF2/IG alike. Fix: `usePaneStack` now
    accepts several default-open ids and `CodexShell` opens ~3 (a skills-like pane first, then canonical order),
    so the column FILLS while staying distinct from Dashboard's all-open grid.

## Done means
On a PF2 or IG sheet, switching the TEMPLATE visibly rearranges the sheet (Classic ≠ Codex ≠ Dashboard ≠ Play,
each recognizably the same template as its 5e counterpart and geared to the system's mechanics), and switching
the STYLE or THEME changes font + texture + colour (not colour alone). Every style/theme/template combination is
available and legible on every system, with each system's full rules/panels intact.
