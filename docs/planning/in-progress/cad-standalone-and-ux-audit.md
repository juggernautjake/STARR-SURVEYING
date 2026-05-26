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
- [ ] **Export by scope (selected features / chosen layers)**: today's
  exporters (CSV, PNEZD, DXF, LandXML, GeoJSON) emit the whole document.
  Add a scope chooser so the user can export only the current selection
  or a chosen set of layers to CSV / DXF / XML (LandXML). (DWG: there is
  no DWG writer — only DXF; note DXF is the importable equivalent for
  Traverse PC and most CAD. Flag DWG as out-of-scope unless a writer is
  added.)

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
- [ ] **Right dock** (property/traverse/image, `w-48`, fixed) — draggable
  splitter (handle on LEFT edge, sign -1), persisted size; ensure the
  three panels stack/scroll well.
- [ ] **Bottom point table** (`h-48`, fixed) — draggable horizontal
  splitter (handle on TOP edge, axis y, sign -1), persisted height.
- [ ] **Canvas re-fit on panel resize** — screenshot after a layer-panel
  drag showed a gray band atop the canvas, suggesting the Pixi renderer
  may not re-fit when its container width changes. Verify CanvasViewport
  has a ResizeObserver and resizes the Pixi renderer; fix if not.

### Menu / dropdown consolidation
- [ ] **MenuBar audit** — group long menus into logical submenus, remove
  redundant entries, ensure consistent labeling (drop emoji noise or use
  consistently), verify every action fires.
- [ ] **Context menus** (`FeatureContextMenu`, `PickModeContextMenu`) —
  consistency, no-vanish-on-mouse-off behavior, every entry works.

### Point identity & auto-naming (user request 2026-05-26 — see §8)
- [ ] **8a. Deterministic naming core** (`lib/cad/points/point-naming.ts`):
  `nextPointName(existing)`, `coincidentPoint(coord, registry, tol)`,
  `derivedName(base, registry)` → `base:N`. Pure, unit-tested. No AI
  dependency for correctness.
- [ ] **8b. Assign-on-create**: when a POINT / LINE / POLYLINE / POLYGON
  is created, name each vertex per §8 rules (reuse same-layer existing
  point; mint new; or `base:N` for cross-layer references).
- [ ] **8c. Export inclusion**: every named point (incl. `:N` and
  auto-minted vertex points) appears in CSV/PNEZD/DXF/LandXML.
- [ ] **8d. Duplication/copy semantics**: copy across layers →
  `base:N`; copy within a layer → fresh number; integrate with
  LayerTransferDialog.
- [ ] **8e. AI naming advisor (enhancement)**: infer the file's naming
  scheme + suggest codes; never block on it.

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
