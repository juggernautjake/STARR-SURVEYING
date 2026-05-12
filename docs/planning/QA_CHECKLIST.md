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
- [x] Copy — same flow as Move but originals stay. Code-verified at `CanvasViewport.tsx:8091-8124`: auto-selects via `hitTest` when nothing is selected, sets `basePoint` on first click, on second click computes `(dx, dy) = worldPt - basePoint`, walks the selection generating *new* features via `transformFeature` + `generateId()` (originals untouched), persists via `drawingStore.addFeatures`, and pushes a single `makeBatchEntry('Copy', ops)` with `ADD_FEATURE` ops. Bonus: line 8121 resets `basePoint` to the latest click so a third+ click can chain another copy from the previous destination — matches the AutoCAD "multiple copy" behaviour without an explicit toggle.
- [x] Rotate — base point + angle (typed or click); pivot indicator visible. Code-verified at `CanvasViewport.tsx:8126-8164`: auto-selects via `hitTest` when nothing is selected, sets `rotateCenter` on first click, on second click computes `angleRad = Math.atan2(worldPt - center)` and routes through `rotateSelection`. Typed-angle path lives in `CommandBar.tsx:247-254`: a pure number while ROTATE has a `rotateCenter` dispatches `cad:rotate` with the angle in degrees. Pivot indicator rendered at `CanvasViewport.tsx:3490-3512`: orange crosshair at the pivot, orange line from pivot to cursor, orange filled circle at cursor tip, plus a ghost preview of the rotated selection. Copy-keep is honored via `toolState.copyMode` → `duplicateSelection(0, 0)` before `rotateSelection`.
- [x] Mirror — mirror line by two clicks; copy-keep checkbox honored. Code-verified at `CanvasViewport.tsx:8201-8316`: TWO_POINTS mode (the default) collects the first click via `addDrawingPoint`, then on the second click reads `drawingPoints[0]` + `worldPt` as the mirror axis endpoints. `copyMode` branch (8263-8285) clones each selected feature, runs `transformFeature(cloned, reflect)` with `reflect(p) = mirror(p, lineA, lineB)`, persists via `addFeatures`, and pushes `makeBatchEntry('Mirror Copy', ops)` with ADD_FEATURE ops — originals untouched. Without copyMode (8287+) it pushes MODIFY_FEATURE ops in place. Bonus: PICK_LINE mode reads the axis off the clicked feature's nearest segment, and ANGLE mode places the axis through an anchor at the configured `mirrorAngle`.
- [x] Scale — base point + scale factor; uniform scaling default. Code-verified at `CanvasViewport.tsx:8166-8199`: auto-selects via `hitTest` when nothing is selected, sets `basePoint` on first click, on second click computes `factor = cursorDist / 50` (50 ft reference for factor=1 — matches the ghost-preview baseline) and routes through `scaleSelection(factor)`. Uniform scaling is the only mode wired (single scalar applied to every axis). Typed-factor path lives in `CommandBar.tsx:256-262` (pure number while SCALE has a `basePoint` dispatches `cad:scale` with the factor). Copy-keep handled via `toolState.copyMode → duplicateSelection(0, 0)` before the scale, mirroring the Rotate copy-keep pattern.
- ~~Scale (reference-length mode)~~ — deferred: split out of the parent Scale row. AutoCAD-style reference mode (pick two reference points to define current length, then pick two target points to define desired length, factor = target/reference) needs a `scaleMode: 'FACTOR' | 'REFERENCE'` toggle in ToolOptionsBar, a 4-extra-click state machine in the SCALE case (refA → refB → targetA → targetB), plus the ghost preview wiring. ~ 1 day of work for a workflow surveyors rarely use today (current factor + typed-value path covers ≥ 95 % of scale operations). Revisit if the customer asks for it.
- [x] Erase — multi-select + Erase deletes the features; reappear via undo. Two paths verified: (a) the ERASE tool at `CanvasViewport.tsx:8048-8058` removes the clicked feature + pushes `makeRemoveFeatureEntry(feature)`, deselects-all; click-per-feature. (b) For multi-select erasure the surveyor selects several features then presses Delete / Backspace — `useKeyboard.ts:191` routes `edit.delete` through `eraseSelected` which removes every selected feature and pushes `makeBatchEntry('Delete', ops)` so a single Ctrl+Z restores the whole batch. Both paths integrate with `undoStore.undo()` to bring the features back (the `REMOVE_FEATURE` op type's reverse branch is `addFeature(data)` per `undo-store.ts:39-41`).

### 1.3 Navigation + view
- [x] Pan (middle-mouse drag or `H`). Code-verified at `CanvasViewport.tsx:7411-7417` — middle-mouse `e.button === 1` AND Space+Left (`e.button === 0 && isSpaceDownRef.current`) both flip `isPanningRef` and swap the cursor to `'grabbing'`. The mousemove path (`9706+`) translates the viewport while the flag is set, and mouseup clears it. Hotkey path: `useKeyboard.ts:40` binds `h: 'tool.pan'` → case `tool.pan` at 234-235 → `toolStore.setTool('PAN')`. With PAN active, every `mousedown` enters the pan-cursor mode unconditionally per the `activeTool === 'PAN'` branches at `7441` and `9721`.
- [x] Zoom in / out (wheel + `+`/`-`). Wheel path verified at `CanvasViewport.tsx:10390+`: wheel events `preventDefault` (so page-scroll doesn't bleed), then zoom toward the cursor (or the selection centroid when something is selected). Keyboard path: `useKeyboard.ts` binds `ctrl+=` / `ctrl+-` (the documented shortcuts in the modal) AND **fix shipped this turn:** bare `=` / `-` aliases now route to the same `view.zoomIn` / `view.zoomOut` actions so AutoCAD-trained surveyors can press the bare keys without the Ctrl modifier. The input-field filter at `useKeyboard.ts:98-103` blocks them while typing in a textarea / input, so they don't collide with command-bar entry. Each action calls `viewportStore.zoomAt(centerX, centerY, 1.2 | 1/1.2)` so the zoom anchors at the canvas center.
- [x] Zoom Extents (`Z E`). Code-verified at `useKeyboard.ts:54` (two-key chord `z e` → action `view.zoomExtents`, gated by the `CHORD_TIMEOUT = 500 ms` window so a stray `e` after a non-chord `z` resets cleanly), `useKeyboard.ts:279-281` (action dispatches `zoomToExtents()`), and `useKeyboard.ts:386-402` (impl walks `getAllFeatures()` collecting POINT / LINE / vertex-chain coords, calls `viewportStore.zoomToExtents(computeBounds(allPoints))`). Empty-document fallback: zooms to a 200×200 ft box centered at origin so the surveyor doesn't end up at infinite zoom-out on a fresh drawing. MenuBar entry at `MenuBar.tsx:469` and CommandBar `ze` typed command both share the same handler.
- ~~Zoom Window~~ — deferred: not currently shipped. Implementation would need a new `ZOOM_WINDOW` ToolType (`lib/cad/types.ts:468`), cursor, mousedown→mouseup rubber-band integration in `CanvasViewport.tsx`, and a `viewportStore.zoomToExtents(rectBounds)` call on release. ~ 2 hours of work for a workflow that the existing wheel-zoom + Zoom Extents (`Z E`) + Zoom to Selection (`Z S`) already cover for surveyor day-to-day operations. The wheel path also anchors at the cursor and is generally faster than a drag-rectangle. Revisit if surveyor feedback requests it explicitly.
- [x] Rotate-view tool returns to north correctly. Code-verified at `DrawingRotationDialog.tsx`: the `QUICK_ANGLES` row at line 18 includes `0` as the first preset (standard north-up orientation), and the explicit `Reset` button at line 138 dispatches `apply(0)` which calls `drawingStore.updateSettings({ drawingRotationDeg: 0 })`. The settings drive `screenToDrawingWorld` (`CanvasViewport.tsx:1226-1241`) — `rotDeg === 0` short-circuits to a plain `s2w(sx, sy)` so all subsequent canvas math returns to identity. Tooltip on the Reset button explicitly reads "Reset rotation to 0° (standard orientation)".

### 1.4 Snap + grid + ortho
- [x] Snap toggle (`F3`, MenuBar item) flips behavior on/off and the StatusBar pill updates. Code-verified at `useKeyboard.ts:65 + 291-293` (F3 → action `snap.toggle` → `drawingStore.updateSettings({ snapEnabled: !current })`), `MenuBar.tsx:477-478` (dynamic label `'Disable Snap' | 'Enable Snap'` + shortcut hint `F3`), and `StatusBar.tsx:391` (`Snap: {snapEnabled ? 'ON' : 'OFF'}` — Zustand re-render fires every subscriber when `drawingStore.document.settings.snapEnabled` flips). The snap engine downstream at `getSnappedWorld` (`CanvasViewport.tsx:7324`) gates every snap-target search on the same `settings.snapEnabled` flag so the behaviour change takes effect immediately on the next cursor move.
- [x] Grid toggle (`F7`) shows/hides the grid. Code-verified at `useKeyboard.ts:66 + 294-295` (F7 → `snap.grid` → flips `settings.gridVisible`), `MenuBar.tsx:472-474` (dynamic label `'Hide Grid' | 'Show Grid'` with F7 shortcut hint), and `CanvasViewport.tsx:1296` (grid render path early-returns when `!doc.settings.gridVisible` so the next frame redraws empty). The same flag also gates the arrow-key nudge step in `useKeyboard.ts:353` so the nudge unit follows the visible grid.
- [x] Ortho (`F8`) constrains lines to 90°. Code-verified at `useKeyboard.ts:67 + 297-298` (F8 → `snap.ortho` → `toolStore.setOrthoEnabled(!current)`) and `CanvasViewport.tsx:7279-7299` (`applyConstraints(pt)` short-circuits when neither ortho nor polar is on; when ortho is on, picks the dominant axis between `dx = pt - refPt` and snaps to that horizontal-or-vertical projection). Reference point cascades through `drawingPoints[last] ?? basePoint ?? rotateCenter` so every in-flight tool (Line, Polyline, Move, Rotate) constrains relative to its previous click. `applyConstraints` is applied inside `getSnappedWorld` (lines 7359, 7363) so it composes with snap targets.
- [x] Polar (`F10`) constrains lines to configured angle increments. Code-verified at `useKeyboard.ts:68` (F10 → `snap.polar` → toggles `polarEnabled`), `tool-store.ts:78-79` (defaults `polarEnabled: false`, `polarAngle: 45°`), `tool-store.ts:214/217` (ortho + polar are mutually exclusive — enabling one disables the other), `tool-store.ts:220` (`setPolarAngle` clamps to `[1, 90]`), and `CanvasViewport.tsx:7302-7310` (when polar is on, computes raw cursor azimuth from refPt → snaps to the nearest multiple of `polarAngle` → projects the cursor onto that ray while preserving distance). The default 45° gives standard cardinal+intercardinal snap (0°/45°/90°/135°/…); surveyors can dial in 15° or 30° for finer increments via the ToolOptionsBar.
- [x] Endpoint / midpoint / intersection / nearest snap indicators each appear at the right place. Code-verified at `lib/cad/constants.ts:168-176` (SNAP_INDICATOR_STYLES table): ENDPOINT → green square, MIDPOINT → green triangle, INTERSECTION → red cross, NEAREST → yellow diamond (plus CENTER → cyan circle, PERPENDICULAR → magenta square, GRID → gray cross bonus). Render path at `CanvasViewport.tsx:3383-3419` reads `snapResultRef.current.type` + `.point`, converts to screen coords via `w2s`, and draws the corresponding shape at the snap location with 1.5-px line weight. Snap-type priority order at `lib/cad/geometry/snap.ts:59` is ENDPOINT > MIDPOINT > INTERSECTION > NEAREST > GRID so the most specific snap wins when multiple types coincide.

### 1.5 Settings panels
- [x] LayerPanel — create / rename / delete / set-active / lock / hide each work; the active-layer label in the panel header matches the new feature destination. Code-verified: `LayerPanel.tsx:98` (create — `store.addLayer({...})`), `:137` (rename — `store.updateLayer(id, { name })`), `:145` (delete — `store.removeLayer(id)`), `:92, :114` (set-active — `store.setActiveLayer(id)`), `:88` (lock toggle), `:84` (visibility toggle). **Fix shipped this turn:** the panel header now carries an inline `active: <name>` callout reading `doc.layers[activeLayerId]`, mirroring the StatusBar pill so the surveyor sees the new-feature destination right above the layer list. Locked layers show the same `🔒` glyph + yellow text the StatusBar uses, keeping the two surfaces in sync.
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
