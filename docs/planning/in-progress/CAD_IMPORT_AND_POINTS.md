# CAD Import & Point Management

Make CSV/ASCII point import actually usable for drawing a survey:
points must render, default to a single layer, be reviewable in a
point viewer, movable between user-named layers, removable, and all
undoable. Grid + snap default off.

## 1. Findings (current behaviour)

- Import builds POINT features with correct geometry
  (`{ type:'POINT', point:{x,y} }`, ImportDialog.tsx:653) and adds
  them via `drawingStore.addFeatures`. Geometry, bounds, the
  visible-features filter, and the POINT draw all look correct in
  isolation.
- **Layer explosion:** on import, *all 23* `PHASE3_DEFAULT_LAYERS`
  are added (ImportDialog.tsx:628) and each point is assigned a
  layer by its code (`codeDef.defaultLayerId ?? 'MISC'`). That's the
  "whole bunch of layers" the user sees.
- **No canvas refresh:** `handleExecuteImport` never dispatches
  `cad:zoomExtents` (or any render kick) after `addFeatures`. Likely
  why points don't visibly register even though the view scales (the
  scale comes from a separate path).
- Grid + snap default **on** (`constants.ts` `gridVisible:true`,
  `snapEnabled:true`).
- A point table (`showPointTable`) and a Layer Transfer dialog
  already exist — items 3/4/5 below may partly reuse them.

## 2. Slices

| Slice | Description | Status |
|-------|-------------|--------|
| **1** | **Single-layer default + render fix (PRIMARY).** Import all points + linework into one visible layer ("Survey Points") by default; do NOT add the 23 default layers in that mode. Add an opt-in "Auto-generate layers by code" checkbox (default off) that keeps the old per-code behaviour AND ensures every referenced layer exists. After `addFeatures`, dispatch `cad:zoomExtents` so the points render immediately. | ✅ Shipped — `handleExecuteImport` now creates one visible `SURVEY-POINTS` layer by default and assigns every point + line feature to it via `targetLayerId`; only the referenced default layers (not all 23) are added in auto-generate mode. New "Auto-generate layers by code" footer checkbox (default off). A `cad:zoomExtents` is dispatched 50ms after `addFeatures` to force the canvas to render + frame the new points. Typecheck clean. (Render fix is high-confidence but unverified locally — no running CAD here; user to confirm.) |
| **2** | **Grid + snap off by default** — `gridVisible:false`, `snapEnabled:false` in `DEFAULT_DRAWING_SETTINGS`. | ✅ Shipped — both flipped to `false` in `DEFAULT_DRAWING_SETTINGS`. |
| **8** | **Undo granularity bug** — placing one point then Ctrl+Z removes two. Review the undo hotkey + how each tool pushes undo entries; ensure one placement = one undoable entry for points, lines, and shapes. | ⏳ |
| **3** | **Point viewer** — review every imported point + attributes (name, N/E/Z, code, layer). Verify/extend the existing point table; ensure it lists imported points with their attributes and can select/zoom to a point. | ⏳ |
| **4** | **Layer assignment from selection / viewer** — create + name a new layer and move/copy selected points into it (via the point viewer or canvas selection → "copy/move to layer"). Reuse the Layer Transfer dialog if it fits. | ⏳ |
| **5** | **Remove points from a layer** — quick multi-select delete of points from a layer, undoable. | ⏳ |
| **6** | **Undo/redo coverage** — confirm every operation above (import, layer create, move/copy, delete) pushes an undo entry so the event history round-trips. | ⏳ |
| **7** | **Audit** — verify import → render → review → layer ops → undo end to end; summary table. | ⏳ |

## 3. Risks

| Risk | Sev | Mitigation |
|------|-----|------------|
| Single-layer default hides code-based styling users relied on | Low | It's the requested default; auto-layer toggle restores per-code layers + colors. |
| zoomExtents after import fights the existing auto-origin logic | Low | Dispatch after the origin offset is set; zoomExtents reads feature bounds, which are unaffected by the display-only origin. |
| Can't reproduce the render bug locally (no running CAD here) | Med | Ship the high-confidence fixes (single layer + refresh); ask the user to confirm against their instance. |

## 4. Audit (end)

| Slice | Shipped? | Commit | Notes |
|-------|----------|--------|-------|
| 1 | — | — | — |
| 2 | — | — | — |
| 3 | — | — | — |
| 4 | — | — | — |
| 5 | — | — | — |
| 6 | — | — | — |
| 7 | — | — | — |
