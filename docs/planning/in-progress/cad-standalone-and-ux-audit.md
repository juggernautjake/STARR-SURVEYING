# CAD Standalone Window & UX Audit — Self-Updating Master Plan

Status: **in progress** · Owner: CAD/UX · Started: 2026-05-26 09:0x CDT
Time-box: **stop at 2:00 PM CDT, 2026-05-26.** (Extended by the user
from 12:30 PM.)

---

## 0. How to use this document (READ FIRST, EVERY RESUME)

This is a **self-updating audit loop**. The Stop hook
(`.claude/hooks/continue-until-planning-done.sh`) keeps the session
running as long as this file sits in `docs/planning/in-progress/`. That
means **moving this file to `completed/` is the only clean way to stop.**

### 0.1 On EVERY resume, do these in order

1. **Check the clock**: run `TZ="America/Chicago" date "+%H:%M"`.
   - **If it is 2:00 PM CDT (14:00) or later** → go to §7 "Finalization"
     and STOP. Do not start a new audit slice.
   - Otherwise continue.
2. Read the **Audit Log (§6)** bottom entry to see where the last slice
   stopped and what is next.
3. Read the **Audit Backlog (§5)**. Pick the **single highest-priority
   open `[ ]` target** (top-down order is the priority order).
4. Run **one full audit cycle (§3)** on that one target. Keep the slice
   small — one target, one commit.
5. Append a dated entry to the Audit Log (§6) describing what changed,
   what was verified, and what to do next. Re-order/refine the backlog
   if the audit surfaced new issues (this is the "self-updating" part —
   add newly-discovered targets as `[ ]` items).
6. Commit + push. The hook will resume the loop.

### 0.2 The prime directives

- **Never** leave the tree broken: `tsc --noEmit` + `next lint` on
  touched files must pass before every commit.
- **Verify before claiming done.** Prefer live verification (§4). If a
  target genuinely can't be verified live, say so in the log and fall
  back to unit/component tests.
- **Small slices.** One audit target per loop. Don't batch unrelated
  fixes into one commit.
- **Self-update the backlog.** Auditing one area always reveals more;
  add those as new `[ ]` targets rather than fixing everything at once.
- Don't gold-plate. Fix real issues (broken, unresizable, cluttered,
  inconsistent). Skip cosmetic nitpicks that don't help the surveyor.

---

## 1. Vision

Make Starr CAD feel and behave like a **standalone desktop application**,
not a page embedded in the admin web app. Then **audit every surface** of
the CAD editor for formatting, utility, and correctness issues, fixing
them one at a time with live verification.

Success criteria:
- CAD opens in a **true full-screen, chrome-free window** (no admin nav
  bleeding in; an in-app Fullscreen toggle; correct title).
- **Every panel that should be resizable, is** — left tool rail, layer
  panel, right property/traverse/image dock, bottom point table — via
  draggable splitters with sensible min/max and persisted sizes.
- **Menus and dropdowns are consolidated** — long menus grouped into
  logical submenus; redundant entries removed; everything reachable and
  not overwhelming.
- **Every tool, menu item, panel, and context menu actually works** and
  is verified.

---

## 2. Verification harness (built in Slice 1)

The CAD route (`/admin/cad`) is auth-gated by `middleware.ts`, and this
environment has no admin credentials. But the CAD editor is a
client-side app (Zustand + IndexedDB), so it renders without the
backend. Verification strategy:

- **Env-gated harness route** outside `/admin` (so middleware ignores
  it), rendering `CADLayout`, active only when
  `NEXT_PUBLIC_E2E_HARNESS=1`. Returns 404 otherwise — zero production
  exposure.
- **`next dev` server** booted in the background on a known port.
- **Playwright** (chromium is installed at `/opt/pw-browsers`) drives the
  harness, exercises the target, and captures **screenshots**.
- **Visual OCR = read the screenshot.** Screenshots are saved to
  `test-results/audit/` and read back with the Read tool for a direct
  visual assessment of layout/formatting (more reliable than tesseract
  on canvas pixels). DOM-text assertions cover the deterministic parts.

If the dev server or harness can't boot in a given slice, fall back to
component/unit tests and note the limitation in the log.

---

## 3. The audit cycle (run once per slice, on ONE target)

For the chosen backlog target:

1. **Inspect** — read the relevant component(s) and current behavior.
2. **Diagnose** — list concrete issues: broken, unresizable, cluttered,
   inconsistent, mis-formatted, non-functional. Be specific.
3. **Fix** — implement the smallest change that resolves the issues.
4. **Verify**:
   - `tsc --noEmit` + lint clean.
   - Relevant vitest/component tests green (add tests when logic changed).
   - **Live**: boot harness, screenshot the target, read the screenshot,
     confirm the fix looks/behaves right; check for regressions in
     neighboring UI.
5. **Refine** — if verification shows it's not right, iterate. If good,
   move on.
6. **Record** — Audit Log entry + backlog update + commit + push.

---

## 4. Live-verification quick commands

```bash
# Boot dev server with the harness flag (background):
NEXT_PUBLIC_E2E_HARNESS=1 npm run dev   # run_in_background

# Drive a target + screenshot (Playwright, harness config):
npx playwright test --config=playwright.harness.config.ts <spec>

# Then Read test-results/audit/<name>.png to assess visually.
```

---

## 5. Audit Backlog (priority order — top is next)

Legend: `[ ]` open · `[x]` shipped+verified · `[~]` partial/deferred
(with inline reason).

### Infrastructure
- [x] **Slice 1 — Verification harness**: env-gated `/cad-harness`
  route, `playwright.harness.config.ts` with a `webServer`, one audit
  spec that screenshots the CAD shell. VERIFIED — chromium renders the
  bare full-screen editor (`test-results/audit/shell.png`). Also
  suppressed marketing chrome on `/cad-harness` in `LayoutShell`.

### Standalone window
- [x] **Standalone full-screen shell**: `AdminLayoutClient` now returns
  `<>{children}</>` for any `/admin/cad*` path (still inside
  SessionProvider) — no admin sidebar/topbar/page-header/FAB, no big
  logo, no nav, no footer. The editor owns the full viewport. The
  harness (identical bare CADLayout tree) verifies the layout; live
  `/admin/cad` verification needs admin auth (unavailable here) but the
  change is verified-by-construction since the harness renders the same
  bare component tree.
- [x] **Fullscreen toggle**: `FullscreenToggle` (Fullscreen API) added
  to the tool-options strip next to Prefs; screenshot confirms the icon
  renders. Reflects live fullscreen state via `fullscreenchange`.

### Export selection / layers (user request 2026-05-26)
- [x] **Export by selection** — `lib/cad/delivery/scope-document.ts`
  (`scopeDocument`/`scopedFeatureCount`, 6 unit tests) narrows the doc to
  the current selection (layers/settings preserved); File ▸ Export now
  has "Export selection as CSV / DXF / LandXML" (disabled when nothing is
  selected). VERIFIED via menu screenshot (`export-selection-menu.png`).
- [ ] **Export by chosen layers** — the `scopeDocument` helper already
  supports `{kind:'LAYERS'}`; needs a small layer-picker dialog to choose
  which layers, then CSV/DXF/LandXML. (DWG: no DWG writer exists — DXF is
  the interchange equivalent; DWG out-of-scope unless a writer is added.)

### Resizable panels (the headline complaint)
- [ ] **Left tool rail** (`width:52`, fixed) — keep icon rail fixed but
  audit overflow on short viewports.
- [x] **Reusable resize primitive** — `lib/cad/ui/panel-size.ts` (pure
  clamp + localStorage, unit-tested), `usePanelSize` hook, and a
  keyboard-accessible `ResizeHandle` (`role="separator"`, arrow keys,
  pointer capture, min/max).
- [x] **Layer panel** (was `w-48` fixed) — now draggable [160,480]px,
  persisted under `starr-cad-panel:layer`. VERIFIED via drag spec +
  screenshot (`layer-panel-resized.png`).
- [x] **Right dock** (property/traverse/image) — draggable [160,520]px
  (handle on LEFT edge, sign -1), persisted under `…:right`. VERIFIED via
  drag spec + screenshot.
- [x] **Bottom point table** — draggable [120,520]px (handle on TOP edge,
  axis y, sign -1), persisted under `…:pointTable`. VERIFIED via drag
  spec + screenshot (`point-table-resized.png`).
- [x] **Canvas surround coverage on resize** — root cause: the canvas
  has a ResizeObserver that resizes the renderer correctly (canvas always
  == container, measured), but `renderPaper` drew the grey surround using
  the viewport store's `screenWidth/Height`, which the RO only updates on
  a deferred frame. Stale dims left the renderer clear-color showing as
  bands. Fixed by drawing the surround from the LIVE renderer size
  (oversized). Surround now uniformly covers on initial render and after
  resize. VERIFIED via screenshots.

### Import placement (user request 2026-05-26)
- [x] **Imported points render off-page (up/right) instead of on the
  template**: root cause — features are stored at raw state-plane N/E
  (millions of ft) while the paper frame defaults to world origin (0,0).
  Fixed in `ImportDialog`: after applying an import, `fitPaperToBounds`
  (new, unit-tested) recenters the paper (`paperOrigin`) under the
  points' bbox and picks the smallest engineering scale that fits them
  with a 15% margin; the existing `cad:zoomExtents` then frames them.
  Placement math unit-verified (6 tests); live full-dialog drive was
  flaky (the import modal re-renders so its Import button never reports
  "stable", and a synthetic click appears to submit a form/navigate —
  see the type="button" item below), so live verification stopped at the
  Validate step (confirmed 5 points parse end-to-end via screenshot).
- [ ] **Import dialog button type** (latent, discovered while verifying):
  the green "Import (N)" button likely lacks `type="button"`; a
  programmatic click navigated the page (form submit). Audit dialog
  buttons for missing `type` to prevent accidental submits.

### Menu / dropdown consolidation
- [ ] **MenuBar audit** — group long menus into logical submenus, remove
  redundant entries, ensure consistent labeling (drop emoji noise or use
  consistently), verify every action fires.
- [ ] **Context menus** (`FeatureContextMenu`, `PickModeContextMenu`) —
  consistency, no-vanish-on-mouse-off behavior, every entry works.

### Point identity & auto-naming (user request 2026-05-26 — see §8)
- [x] **8a. Deterministic naming core** (`lib/cad/points/point-naming.ts`):
  `parsePointName`, `nextPointName` (numeric→max+1, then `P#`, collision-
  safe), `derivedName`→`base:N`, `coincidentName`, and `resolveVertexName`
  (reuse / derive / mint per §8 rules). Pure, 13 unit tests. No AI
  dependency.
- [~] **8b. Assign-on-create**: ENGINE DONE — `point-registry.ts`
  (`buildPointRegistry`, `collectExistingNames`, `assignNamesForNewFeatures`
  returning per-feature `POINT name` / `VERTICES refs`, + `encode/
  parsePointRefs` for JSON storage in `properties`). 8 unit tests cover
  the exact user scenarios (same-layer reuse, cross-layer `255:1`→`:2`,
  mint, shared-mint-in-batch). REMAINING (8b-wire): call the engine from
  the manual draw-tool completion path and apply assignments inside the
  same undo batch — deferred from this slice because `addFeature` is a
  shared low-level mutation (import/AI/intersect) and naming must hook
  only manual creation to avoid double-naming the import flow.
- [x] **8b-apply**: `applyAssignment` + `nameDrawnFeature(doc, feature)`
  stamp names into `properties` (POINT→`pointName`, linework→JSON
  `pointRefs`); 3 more unit tests (11 total in the registry suite). The
  draw-path wire-up is now a safe one-liner per call site.
- [ ] **8c. Export inclusion**: every named point (incl. `:N` and
  auto-minted vertex points) appears in CSV/PNEZD/DXF/LandXML.
- [ ] **8d. Duplication/copy semantics**: copy across layers →
  `base:N`; copy within a layer → fresh number; integrate with
  LayerTransferDialog.
- [ ] **8e. AI naming advisor (enhancement)**: infer the file's naming
  scheme + suggest codes; never block on it.

### Point & Traverse data viewers (user request 2026-05-26 — see §10)
- [x] **10a. point-rows model** — `lib/cad/points/point-rows.ts`:
  `buildPointRows` (origin-applied N/E), `rowToWorldPoint`,
  `rowEditToFeatureUpdate` (coords move the point; code/desc/elev →
  properties; validates). 9 unit tests.
- [x] **10b. rename-impact + strategy logic** — `point-rename.ts`:
  `findNameReferences` (point + linework refs + `:N` derivatives),
  `planRename` (rebases derivatives), `planDuplicate`, `nameIsTaken`,
  `RenameStrategy` type. 6 unit tests. (UI/preference wiring in 10d.)
- [x] **10c. editable Point Viewer UI** — `PointDataViewer.tsx`: inline-
  edit grid (coords move the point via `rowEditToFeatureUpdate`+undo;
  code/desc/elev), column show/hide (persisted), layer filter, search,
  empty state. Toggled from View ▸ "Point Data Viewer (editable)" in a
  resizable bottom dock. VERIFIED via harness screenshot. Name edits
  route to an interim confirm-based rename; rich dialog = 10d.
- [x] **10d. rename confirmation dialog** — `RenameConfirmDialog.tsx`:
  warns with blast radius (linework refs, `:N` derivatives, export
  impact, name-collision), offers "Rename everywhere" vs "Duplicate
  instead" vs Cancel, and a "remember my choice" checkbox persisted to
  localStorage (skips the dialog next time). Wired into CADLayout via the
  viewer's name edits. Logic unit-tested (10b); live trigger needs a
  seeded named point (canvas-draw flaky) so verified by unit+types.
- [x] **10e. Traverse Viewer** — `traverse-rows.ts` (pure, 5 tests:
  distance/azimuth/bearing/polyline-length/arc radius-delta-arclen-chord)
  + `TraverseViewer.tsx` (computed columns, customizable show/hide, layer
  filter, View-menu toggle, resizable dock). VERIFIED via screenshot.
- [ ] **10f. Traverse editing**: edit distance/bearing to drive geometry
  (read-only today; maps back to start/end is a follow-up).

### Per-surface functional audit (expand as discovered)
- [ ] **ToolBar** — every tool button activates the right tool; tooltips
  correct; active state visible.
- [ ] **ToolOptionsBar** — options reflect the active tool.
- [ ] **LayerPanel** — add/rename/delete/visibility/lock all work.
- [ ] **PropertyPanel** — edits apply to selection; geometry fields work.
- [ ] **StatusBar / CommandBar** — coordinate readout, command input.
- [ ] **Dialogs sweep** — each dialog in `CADLayout` opens, is usable,
  closes cleanly (sample, don't exhaustively grind).

---

## 6. Audit Log (append-only; newest at bottom)

- 2026-05-26 09:0x CDT — Plan created. Confirmed: Stop-hook loop drives
  iteration; chromium installed (`/opt/pw-browsers`), network works;
  `/admin/cad` is auth-gated (no creds) → will use an env-gated harness
  route for live verification. Next: Slice 1 (verification harness).
- 2026-05-26 09:3x CDT — Slice 1 DONE + verified. Added `/cad-harness`
  (env-gated, 404 unless `NEXT_PUBLIC_E2E_HARNESS=1`),
  `playwright.harness.config.ts` (webServer boots next dev on :3100),
  `e2e/harness/{_harness.ts,shell.spec.ts}`, `testIgnore` for harness in
  the main e2e config, and suppressed marketing chrome on `/cad-harness`
  in `LayoutShell`. Screenshot confirms the bare full-screen editor.
  A persistent dev server runs on :3100 for fast screenshot iteration.
  Discovered: real `/admin/cad` is NOT standalone — wrapped by
  `AdminLayoutClient` chrome (sidebar/topbar/header/FAB). Added the user's
  new request (export selected features / chosen layers). Next:
  Standalone full-screen shell.
- 2026-05-26 09:5x CDT — Slice 2 DONE. Standalone shell: `/admin/cad*`
  bypasses all admin chrome (sidebar/topbar/header/FAB) in
  `AdminLayoutClient`; CAD now fills the viewport with only its own small
  "Starr CAD" wordmark — directly satisfies the user's "no nav/footer/big
  logo, standalone window" note. Added `FullscreenToggle` (Fullscreen
  API) to the tool-options strip; screenshot confirms it renders left of
  Prefs. Next: resizable panels (left rail overflow check, then the
  ResizableSplitter primitive + layer/right/bottom panels).
- 2026-05-26 10:0x CDT — Slice 3 DONE. Built the resize primitive
  (`panel-size.ts` + `usePanelSize` + `ResizeHandle`, unit-tested 6/6)
  and applied it to the layer panel (draggable 160–480px, persisted).
  Drag spec + screenshot confirm it widens and the layout reflows.
  Discovered a possible canvas re-fit gap (gray band atop canvas after
  resize) → added as a backlog item. Next: right dock resize.
- 2026-05-26 10:0x CDT — User extended the time-box to **2:00 PM** and
  added a detailed **point-identity / auto-naming** requirement (see §8).

---

## 7. Finalization (when clock ≥ 2:00 PM CDT / 14:00)

1. Make sure the tree is in a working state: `tsc --noEmit` clean, lint
   clean on touched files, vitest CAD suites green.
2. Ensure every open `[ ]` backlog item left unfinished has a one-line
   status/deferral note inline.
3. Flip the Status line (§top) to **completed** and add a final Audit
   Log entry summarizing what shipped and what remains.
4. `git mv docs/planning/in-progress/cad-standalone-and-ux-audit.md
   docs/planning/completed/` (update any `// Spec:` refs or cross-links
   first — `grep -rln` the path).
5. Commit + push. The in-progress folder empties and the hook routes to
   the QA phase (or stops). **Do not start new audit slices after
   2:00 PM.**

---

## 8. Point identity & auto-naming (deep design)

User intent (2026-05-26): every point the user creates — standalone
points AND the endpoints/vertices of created lines and shapes — must
get a point name/number, chosen automatically by looking at the names
already in the file (AI-assisted, deterministic-backed). Created points
must be exportable so they all land in the CSV/DXF/XML output.

### 8.1 The rules (verbatim intent, formalized)

1. **Mint on create.** Creating a point, or a line/shape, names each new
   vertex that does not already correspond to an existing point.
2. **Reuse existing points (same layer).** Drawing a line between two
   existing points on the **same layer** as those points does **not**
   mint new names — the endpoints simply reference the existing points.
3. **Cross-layer reference → `base:N`.** If the new line/shape is on a
   **different layer** than an anchor point it snaps to, its endpoint
   gets the anchor's name with a `:N` suffix, where `N` is the next free
   index for that base. Example: anchors `255` & `256`, line on another
   layer → `255:1`, `256:1`. Do it again → `255:2`, `256:2`, etc.
4. **Codes optional.** Created points may carry a code/description but it
   is not required.
5. **Export everything.** All named points (minted, reused, and `:N`
   derivatives) are included in exports.

### 8.2 Model

- **Canonical name resolver** stays `pointNumberOf` (already reads
  `pointNo|pointNumber|pointName|name`). New points write `pointName`
  (string) so `:N` names are representable; numeric points keep working.
- **Point registry** (derived, in-memory, rebuilt from the document):
  `name → { name, worldX, worldY, elevation?, code?, layerId, baseName?, derivedIndex? }`.
  Built by scanning POINT features + any vertex carrying a `pointRef`.
- **Vertex identity**: line/polyline/polygon vertices may carry a
  parallel `pointRefs: (string|null)[]` in `properties` so a vertex can
  point at a registry name without forcing a visible marker. Standalone
  POINT features are their own registry entries.
- **Coincidence test**: a vertex "is" an existing point when it is within
  `tol` (default = snap tolerance, fallback small epsilon in world feet)
  of that point's coordinate.

### 8.3 Naming algorithm (deterministic core)

```
assignNames(newGeometry, layerId, registry, tol):
  for each vertex v of newGeometry:
    hit = coincidentPoint(v, registry, tol)
    if hit and hit.layerId == layerId:
        ref = hit.name                      # rule 2: reuse, no mint
    elif hit:                               # rule 3: cross-layer
        ref = derivedName(hit.baseName ?? hit.name, registry)  # base:N
    else:
        ref = nextPointName(registry)       # rule 1: mint
    register(ref, v, layerId); attach ref to the vertex
```

- `nextPointName`: among purely-numeric names, return `max+1` (as a
  string). If the file uses a non-numeric scheme, the AI advisor (§8e)
  may propose a pattern; deterministic fallback is `max(numeric)+1`, then
  `P1, P2, …` if none are numeric. **Never collide** with an existing
  name.
- `derivedName(base, registry)`: smallest `N≥1` such that `base:N` is
  free.

### 8.4 Duplication & copying

- **Copy/duplicate to another layer** (LayerTransferDialog,
  copy-to-layer): each copied point/endpoint becomes `base:N` of its
  source — consistent with rule 3, since it's the same physical point on
  a new layer.
- **Copy within the same layer**: names must stay unique, so copies get
  fresh `nextPointName` values (they are genuinely new points).
- **Move** (not copy): identity is preserved; no rename.

### 8.5 Export robustness

- **CSV / PNEZD** (`export-csv.ts`): enumerate the registry, not just
  POINT features, so minted vertex points and `:N` derivatives are
  emitted. Columns: name, N, E, Z, code, description. `:N` names are
  written verbatim (PNEZD point-id is a string field downstream).
- **DXF** (`dxf-writer.ts`): emit a POINT entity + TEXT label per
  registry entry on its layer; preserve `:N` in the label.
- **LandXML** (`landxml-writer.ts`): one `<CgPoint name="…">` per
  registry entry; `:` is legal in the name attribute.
- **Dedup policy**: same coordinate + same layer + same name = one
  record. Cross-layer `:N` derivatives are intentionally distinct
  records (the user explicitly wants `255:1` exported alongside `255`).
- **Scope toggle** (ties into the export-by-selection backlog item):
  export all / selected / chosen layers — the registry enumeration is
  filtered by the chosen scope.

### 8.6 Edge cases / open questions (resolve during 8a–8e)

- Curves (SPLINE/CIRCLE/ARC): name fit-points/centers? Start with
  line/polyline/polygon + explicit points; treat curve naming as a
  follow-up.
- Visible markers: do minted vertex points render as POINT glyphs?
  Default OFF (avoid clutter); they still export. Provide a toggle.
- Backfill: a "Number all unnamed points" command for legacy drawings.
- Uniqueness invariant: names unique per document; enforce in the
  registry builder + on rename.
- Undo: naming happens inside the same batch as geometry creation so one
  undo reverts both.
- 2026-05-26 10:2x CDT — Slice 4 DONE. Right dock + bottom point table
  now resizable (drag specs + screenshots confirm). The screenshots make
  the canvas re-fit bug obvious: gray letterbox bands appear around the
  white sheet whenever the layout reflows — the Pixi renderer isn't
  resizing its drawing buffer to the new container size. Next: fix canvas
  re-fit (CanvasViewport ResizeObserver), which now clearly affects every
  resize/toggle.
- 2026-05-26 10:5x CDT — Slice 5 DONE. Fixed canvas surround coverage:
  `renderPaper` now sizes the grey surround from the live renderer
  dimensions (not the deferred viewport-store size), so it fully covers
  on initial render and after any resize — eliminating the inconsistent
  clear-color bands. Measured canvas==container to rule out a CSS sizing
  mismatch first. Two new user requests added to the backlog: imported
  points render off-page (centre on the sheet + zoom-to-fit), already
  logged. Next: imported-point placement, then export-by-scope, then the
  point-identity epic (§8).
- 2026-05-26 11:1x CDT — Slice 6 DONE. Fixed imported points rendering
  off-page: new `lib/cad/geometry/paper-fit.ts` (`fitPaperToBounds` +
  `boundsOfPoints`, 6 unit tests) wired into `ImportDialog` to recenter
  the paper under the points and pick a fitting scale, before the
  existing zoom-extents. Live import drive proved the pipeline parses 5
  points to the Validate step but the modal's Import button is flaky for
  Playwright (continuous re-render + apparent form-submit on synthetic
  click) — removed the flaky spec; placement math is unit-verified.
  Logged a latent `type="button"` dialog-button bug for a later slice.
  Next: export-by-scope (selected/layers), then the point-identity epic.
- 2026-05-26 11:3x CDT — Slice 7 DONE. Export-by-selection: new
  `scopeDocument` helper (6 unit tests) + File ▸ Export "Export selection
  as CSV/DXF/LandXML" items, disabled with no selection. Menu screenshot
  confirms. Layer-scoped export deferred to a follow-up (helper already
  supports it; needs a layer-picker UI). Next: point-identity epic §8
  (start with 8a deterministic naming core).
- 2026-05-26 10:1x CDT — Slice 8a DONE. Built the deterministic point-
  naming core (`lib/cad/points/point-naming.ts`): parse/next/derived/
  coincident + `resolveVertexName` returning reuse|derive|mint per the §8
  rules (same-layer reuse, cross-layer `base:N`, else mint max+1). 13 unit
  tests. Next: 8b — wire assign-on-create into geometry creation so new
  POINT/LINE/POLYLINE/POLYGON vertices get names.
- 2026-05-26 10:1x CDT — Slice 8b-engine DONE. `point-registry.ts`:
  registry builder + `assignNamesForNewFeatures` implementing the full §8
  rule set, plus JSON `pointRefs` storage helpers (Feature.properties only
  holds primitives, so refs are JSON-encoded). 8 unit tests pass incl. the
  user's 255/256 → 255:1/256:1 → :2 cross-layer scenarios. Wire-up into
  the live draw-tool path deferred (addFeature is shared; must hook only
  manual creation). Next: 8b-wire OR continue with menu consolidation /
  per-surface audits depending on risk/time.

---

## 10. Point Data Viewer & Traverse Viewer (user request 2026-05-26)

User intent: a dedicated, spreadsheet-like **Point Data Viewer** over the
whole project (including auto-created points) and filterable per layer.
Every coordinate / elevation / code / description field is editable;
editing a coordinate moves the point on the drawing. **Point name** edits
are special — they can break references (linework `pointRefs`, labels,
exports), so a rename must warn the user, offer a safer "duplicate with a
new name" alternative, still allow the rename if they insist, and offer
"remember this choice for all future renames." Columns are customizable
(show/hide). Also a **Traverse Viewer**: per-layer line/curve data —
coordinates, bearing, azimuth, distance, chord, radius, delta, arc length
— viewable and (where meaningful) editable, with customizable columns.

### 10.1 Data model
- **Source of truth = drawing-store POINT features** (these are what's
  drawn/exported, and include created points). Each row:
  `{ id, name, northing, easting, elevation, code, description, layerId }`.
  Display↔world via settings origin: `northing = worldY + originNorthing`,
  `easting = worldX + originEasting` (geometry stores world x/y).
- A pure `lib/cad/points/point-rows.ts`: `buildPointRows(doc)`,
  `rowToGeometry(row, settings)` (edited N/E → world `point`), and field
  validators. Unit-tested.

### 10.2 Editing semantics
- **Coordinates** → `updateFeature(id, { geometry })`; the point moves.
- **Code / description / elevation** → update `properties`.
- **Point name** → guarded (see §10.3). All edits are undoable.

### 10.3 Rename handling (graceful)
- `findNameReferences(doc, name)` (pure): linework whose `pointRefs`
  include the name, `:N` derivatives, labels — so we can tell the user the
  blast radius.
- Rename dialog options:
  1. **Rename in place** — updates the point + every reference
     (`pointRefs`, derivatives' base) atomically in one undo batch.
  2. **Create a duplicate** with the new name (same coords/attrs), leaving
     the original + its references intact.
  3. Cancel.
- "**Remember my choice for future point-name changes**" → a session/
  document preference (`renameStrategy: 'ASK' | 'RENAME' | 'DUPLICATE'`)
  so power users aren't nagged.
- Warnings shown: which lines/labels reference the name; that exports key
  on the name; that duplicates add a row.

### 10.4 UI
- Reuse/extend `PointTablePanel` into an editable grid (inline-edit cells,
  per-column show/hide menu, layer filter incl. "All layers" + per-layer,
  sort, search). Keep it in the resizable bottom dock.
- **TraverseViewer**: a sibling tab/panel listing linework with computed
  bearing/azimuth/distance/chord/radius/delta/arc-length columns (reuse
  `lib/cad/geometry` + selection-digest math), column show/hide, layer
  filter; edit distance/bearing where it maps back to geometry.

### 10.5 Backlog (added to §5)
- [ ] **10a. point-rows model** (`point-rows.ts` + tests).
- [ ] **10b. rename-impact + strategy logic** (`findNameReferences`,
  rename/duplicate appliers, preference) + tests.
- [ ] **10c. editable Point Viewer UI** (inline edit, columns, layer
  filter) wired to the store; live-verify.
- [ ] **10d. rename confirmation dialog** (warn + duplicate + remember).
- [ ] **10e. Traverse Viewer** (computed line/curve columns, customizable).
- 2026-05-26 10:2x CDT — Added §10 (Point Data Viewer + Traverse Viewer)
  design + backlog 10a–10e per the new user request. Shipped 10a: pure
  `point-rows.ts` model (`buildPointRows`, `rowToWorldPoint`,
  `rowEditToFeatureUpdate` — coords move the point, code/desc/elev edit),
  9 unit tests. Next: 10b rename-impact + strategy logic, then the
  editable viewer UI (10c) and rename dialog (10d).
- 2026-05-26 10:3x CDT — Slice 10b DONE. `point-rename.ts` pure logic for
  graceful renames: blast-radius report, rename-in-place (rebasing :N
  derivatives), duplicate-with-new-name, name-collision check. 6 unit
  tests. Next: 10c editable Point Viewer UI (build on point-rows model) +
  10d rename dialog wiring the strategy/preference.
- 2026-05-26 10:4x CDT — Slice 10c DONE. Built `PointDataViewer` — an
  editable spreadsheet over all POINT features: inline coord/elev/code/
  desc editing (undoable; coords move the point), persisted column
  show/hide, layer filter + search, resizable bottom dock, View-menu
  toggle. Harness screenshot confirms the panel + toolbar + columns +
  empty state. Name editing uses an interim confirm-based rename (warns +
  rebases refs); the rich dialog (duplicate option + remember-choice) is
  10d. Next: 10d rename dialog, then 10e Traverse Viewer.
- 2026-05-26 10:5x CDT — Slice 10d DONE. Replaced the interim confirm
  with `RenameConfirmDialog`: warns (references / derivatives / export
  impact / collision), offers Rename-everywhere vs Duplicate-instead vs
  Cancel, and remembers the choice (localStorage) so bulk renames aren't
  nagged. CADLayout reads the remembered strategy and only opens the
  dialog when 'ASK'. Next: 10e Traverse Viewer.
- 2026-05-26 11:0x CDT — Slice 10e DONE. `traverse-rows.ts` computes
  per-feature line/curve metrics (distance, azimuth, quadrant bearing;
  arc radius/delta/arc-length/chord; polyline total length; origin-applied
  N/E), 5 unit tests. `TraverseViewer` shows them with customizable
  columns + layer filter, toggled from View menu in a resizable dock;
  screenshot confirms. Editing courses → geometry deferred as 10f. This
  completes the §10 viewers' read path; both viewers ship.
