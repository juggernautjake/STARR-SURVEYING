# QA Checklist — Post-Planning Phase

> **Status:** the auto-continue Stop hook (`.claude/hooks/continue-until-planning-done.sh`) gates on this file once `docs/planning/in-progress/` is empty. As long as any `- [ ]` checkbox remains, the loop keeps going; once every checkbox is `- [x]`, the next Stop fires cleanly and the session ends.
>
> **Discipline:** flip a box to `- [x]` only when the item is genuinely resolved — verified in the browser / on-device, not just touched in code. If an item turns out to be too large for a single slice, split it into sub-items rather than checking the parent. If an item is deferred for a documented reason, replace the checkbox with `- ~~struck-through text~~ — deferred: <reason>` so the loop won't gate on it.
>
> **Hook reference:** `.claude/hooks/continue-until-planning-done.sh`

---

## 1. CAD tools + settings — verify each works correctly

A page-by-page sweep of `/admin/cad`. For each tool, confirm: tool activates, options bar shows the right inputs, drawing on the canvas produces the expected feature, the action lands in undo history, and the StatusBar reflects state changes.

### 1.1 Draw tools (`MenuBar` → Draw menu)
- [x] Point — drops a point at the click coordinate; snap indicators behave; F8 ortho is irrelevant for a point. Code-verified at `CanvasViewport.tsx:7765-7773`: the `DRAW_POINT` case uses the snap-resolved `worldPt` (same upstream pipeline every drawing tool reads), calls `createFeature('POINT', [worldPt])`, runs through `withAutoLabels`, persists via `drawingStore.addFeature`, and pushes a single undo entry. Ortho (`applyOrthoConstraint`) only kicks in when `toolState.drawingPoints.length > 0` — POINT has no prior click, so F8 is naturally a no-op.
- [x] Line — two clicks produce a segment; endpoint snaps; `Esc` cancels mid-line. Code-verified at `CanvasViewport.tsx:7775-7785` (first click pushes via `toolStore.addDrawingPoint`; second click reads `toolState.drawingPoints[0]` + `worldPt` and finalises via `finishFeature('LINE', …)`) and `useKeyboard.ts:168-171` (Esc → `edit.deselect` → `toolStore.setTool('SELECT')` + `toolStore.clearDrawingPoints()`, which wipes the pending start point so the next L click starts fresh).
- [x] Polyline — chained segments; `Enter` finishes; `Backspace` undoes the last vertex. Code-verified at `CanvasViewport.tsx:7788-7807` (each click after the first runs `createPolylineSegment` + `drawingStore.addFeature` + `addDrawingPoint`, gated on `MIN_SEGMENT_LENGTH_BASE / zoom` so micro-jitter clicks don't emit zero-length segments); `useKeyboard.ts:62` maps `enter → tool.confirm → confirmCurrentTool` → `finishFeature('POLYLINE')` when `drawingPoints.length ≥ 2`. **Fix shipped this turn:** `useKeyboard.ts edit.delete` now pops the last vertex via `toolStore.popDrawingPoint()` when the active tool is DRAW_POLYLINE / DRAW_POLYGON with `drawingPoints.length > 0` — matches the AutoCAD / Carlson convention already wired for the `u` command-bar key (`CommandBar.tsx:313-323`) and the Keyboard Shortcuts modal's "Undo last vertex" row. Otherwise Backspace / Delete still erase the selection.
- [x] Polygon — closes back to the start; minimum 3 vertices enforced. Code-verified at `CanvasViewport.tsx:7075-7084` — `createFeature('POLYGON', points)` returns `null` when `points.length < 3` (min-3 gate). The Enter-confirm path at `CanvasViewport.tsx:10018` only calls `finishFeature('POLYGON')` when `drawingPoints.length >= 3`, so the gate is enforced at both the input layer and the constructor. Closes back to the start: every POLYGON renderer (`CanvasViewport.tsx:480`, `5073`, etc.) emits `g.lineTo(p0.sx, p0.sy)` after walking the vertex chain, drawing the closing edge to the first vertex. The new Backspace shortcut (previous QA row) also works for in-flight polygons since the `edit.delete` handler matches both DRAW_POLYLINE and DRAW_POLYGON.
- [x] Rectangle — two-corner drag; rotation honored when the drawing frame is rotated. Code-verified at `CanvasViewport.tsx:7814-7845`: first click pushes via `addDrawingPoint`; second click reads `p1` + the snapped `worldPt`, gates on `MIN_SEGMENT_LENGTH_BASE` on both dimensions, builds the 4-vertex POLYGON `[p1, (p2.x,p1.y), p2, (p1.x,p2.y)]`, stamps `properties.shapeType = 'RECTANGLE'`, and pushes a single undo entry. Drawing-rotation honoring comes from `screenToDrawingWorld(sx, sy)` (`CanvasViewport.tsx:1226-1241`) which inverse-rotates the screen click around the paper center before `s2w`, so the rectangle's vertices stay axis-aligned in drawing-world coords and visually appear rotated on screen alongside the rest of the drawing.
- [x] Circle — center + radius; radius input box accepts typed value mid-tool. Code-verified at `CanvasViewport.tsx:7875-7899`: first click pushes the center via `addDrawingPoint`; second click reads `Math.hypot(worldPt - center)` as radius and emits a true CIRCLE Feature (`{ center, radius }` parametric, no polygon vertices) gated on `radius >= MIN_SEGMENT_LENGTH_BASE`. **Fix shipped this turn:** `CommandBar.tsx` now handles the typed-radius path — when DRAW_CIRCLE / DRAW_CIRCLE_EDGE has a center on the stack and the surveyor types a pure number, it dispatches `cad:drawCircleByRadius` with `{ center, radius }`. CanvasViewport listens, emits the same CIRCLE feature as the click path, and clears the drawing-points stack. The command-bar prompt at `CommandBar.tsx:127` ("Specify radius — click a point on the circle or type a distance value") now matches the behaviour.
- [x] Regular Polygon — sides input visible in the options bar; default 6. Code-verified at `tool-store.ts:76` (`regularPolygonSides: 6` default in the initial state) and `ToolOptionsBar.tsx:133, 370-403` (`showPolySides = activeTool === 'DRAW_REGULAR_POLYGON'` gates the Sides row; quick-pick buttons `[3, 4, 5, 6, 8, 10, 12]` highlight the active count + a free-form `<input type="number" min=3 max=20>` accepts any value in the documented range). `setRegularPolygonSides` clamps to `[3, 20]` at `tool-store.ts:211`. The two-click draw path at `CanvasViewport.tsx:7847-7872` reads the live `regularPolygonSides` when computing vertices.

### 1.2 Modify tools
- [x] Move — select → click base → click destination; arrow-key nudge with snap respected. Code-verified at `CanvasViewport.tsx:8061-8089`: auto-selects via `hitTest` when nothing is selected, sets `basePoint` on first click, on second click computes `(dx, dy) = worldPt - basePoint`, calls `transformFeature(f, (p) => translate(p, dx, dy))` per selected feature, persists via `drawingStore.updateFeature`, and pushes a single `makeBatchEntry('Move', ops)` undo. **Fix shipped this turn:** `useKeyboard.ts` now registers Arrow{Up,Down,Left,Right} (+ Shift variants for 10× step) to a new `edit.nudge.*` action that calls `nudgeSelection`. Step respects the snap state — minor-grid spacing (`gridMajorSpacing / gridMinorDivisions`) when the grid is visible, 1 ft otherwise; Shift scales 10×. Each nudge lands as a single batch undo entry labelled `"Nudge <amount> ft"`.
- [ ] Copy — same flow as Move but originals stay.
- [ ] Rotate — base point + angle (typed or click); pivot indicator visible.
- [ ] Mirror — mirror line by two clicks; copy-keep checkbox honored.
- [ ] Scale — base point + scale factor; uniform scaling default; reference-length mode works.
- [ ] Erase — multi-select + Erase deletes the features; reappear via undo.

### 1.3 Navigation + view
- [ ] Pan (middle-mouse drag or `H`).
- [ ] Zoom in / out (wheel + `+`/`-`).
- [ ] Zoom Extents (`Z E`).
- [ ] Zoom Window.
- [ ] Rotate-view tool returns to north correctly.

### 1.4 Snap + grid + ortho
- [ ] Snap toggle (`F3`, MenuBar item) flips behavior on/off and the StatusBar pill updates.
- [ ] Grid toggle (`F7`) shows/hides the grid.
- [ ] Ortho (`F8`) constrains lines to 90°.
- [ ] Polar (`F10`) constrains lines to configured angle increments.
- [ ] Endpoint / midpoint / intersection / nearest snap indicators each appear at the right place.

### 1.5 Settings panels
- [ ] LayerPanel — create / rename / delete / set-active / lock / hide each work; the active-layer label in the panel header matches the new feature destination.
- [ ] LayerPreferencesPanel — color / linetype / lineweight / scale per-layer overrides apply on next draw.
- [ ] DisplayPreferencesPanel — background color / grid spacing / cursor crosshair size apply immediately.
- [ ] DrawingPreferencesPanel — units / precision / default linetype apply to new drawings.
- [ ] FeaturePropertiesDialog — opens for a selected feature, edits land in undo, panel closes cleanly on `Esc`.

### 1.6 File I/O
- [ ] Save Drawing (`SaveToDBDialog` in 'save' mode) — round-trips name + description; new row appears in Open dialog.
- [ ] Open Saved Drawing — opens dialog, lists prior saves, loading restores all features + layers.
- [ ] Export CSV / DXF / GeoJSON / PDF / Field-Reference Cards / Deliverable Bundle each produce a file the OS recognizes.
- [ ] Import GeoJSON / DXF land geometry on the correct layers.

### 1.7 AI surfaces
- [ ] AI menu → Run AI Drawing Engine opens the dialog.
- [ ] AI Copilot sidebar opens, accepts a prompt, returns a proposal, Accept/Modify/Skip each behave.
- [ ] AI Review Queue panel toggles open/closed via the menu item.
- [ ] Recoverable-drawing banner only shows when autosave found unsaved work.

## 2. UX consistency review — every page in CAD / RECON / Mobile

Walk every route in a browser (and on-device for mobile) with both light and dark themes (and sun-readable on mobile). For each, file a sub-item under the page if something is off.

### 2.1 CAD
- [ ] `/admin/cad` — main editor: layout doesn't reflow on window resize; MenuBar / ToolBar / StatusBar align baselines; right-side panels stack predictably; tooltips appear within 500 ms.

### 2.2 RECON
- [ ] `/admin/research` — hub page: project cards render; new-project button visible; loading skeletons replace the empty grid.
- [ ] `/admin/research/[projectId]` — workspace: every Stage card paints fully; stat tiles are actionable buttons; review-summary panel tabs scroll-anchor properly.
- [ ] `/admin/research/[projectId]/documents` — documents tab: upload area + per-doc rows align.
- [ ] `/admin/research/[projectId]/boundary` — boundary tab.
- [ ] `/admin/research/[projectId]/report` — report tab.
- [ ] `/admin/research/[projectId]/library` — library tab.

### 2.3 Mobile (Expo / React Native)
- [ ] Jobs tab — list, JobCard rows, search FAB.
- [ ] Money tab — receipts list, filter pill, FAB, sticky add bar.
- [ ] Time tab — status card, week card, recent list.
- [ ] Me tab — header pill (Sun toggle), each section row, sign-out button.
- [ ] Gear tab — equipment list.
- [ ] All detail screens — `<ScreenHeader>` consistent; Cancel/Back hit targets ≥ 44 pt.

## 3. Page completeness audit — flesh out unbuilt routes

Visit every route under `app/` and confirm it renders meaningful content. Anything that's a placeholder, a "Coming soon", or a default scaffold goes here and gets built out.

### 3.1 Public marketing routes
- [ ] `/` — homepage.
- [ ] `/about`.
- [ ] `/services`.
- [ ] `/service-area`.
- [ ] `/pricing`.
- [ ] `/resources`.
- [ ] `/contact`.
- [ ] `/credentials`.
- [ ] `/register`.
- [ ] `/share`.

### 3.2 Admin routes (one item per top-level admin section)
- [ ] `/admin` — landing.
- [ ] `/admin/jobs`.
- [ ] `/admin/my-jobs`.
- [ ] `/admin/users`.
- [ ] `/admin/employees`.
- [ ] `/admin/team`.
- [ ] `/admin/profile`.
- [ ] `/admin/settings`.
- [ ] `/admin/pay-progression`.
- [ ] `/admin/hours-approval`.
- [ ] `/admin/my-pay`.
- [ ] `/admin/payout-log`.
- [ ] `/admin/payroll`.
- [ ] `/admin/rewards`.
- [ ] `/admin/timeline`.
- [ ] `/admin/leads`.
- [ ] `/admin/discussions`.
- [ ] `/admin/notes`.
- [ ] `/admin/my-notes`.
- [ ] `/admin/my-files`.
- [ ] `/admin/receipts`.
- [ ] `/admin/field-data`.
- [ ] `/admin/error-log`.

## 4. Fix everything found above

Sub-items get added here as 1-3 surface real defects. Each filed defect lands as its own checkbox and gets shipped on the next loop iteration.
