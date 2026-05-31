# CAD layer hierarchy + grouping + context menus — 2026-05-31

*Opened 2026-05-31 in response to a multi-part user ask about the
layer panel + right-click menus:*

1. *Drop the "hide each constituent line segment" toggles for a
   polygon — if I want to hide a segment I'll right-click the line or
   use the layer eye. The polygon should be ONE entry in the panel.*
2. *Polylines / polygons should ACT AS a group: the constituent
   segments live nested under the polyline/polygon entry, expandable
   on demand.*
3. *Within a layer I can have individual line segments, points,
   shapes, or groups. Groups can contain other groups (nested).*
4. *Multi-select on the canvas → right-click → "Group" makes a custom
   group of the selected elements (which may span feature types).*
5. *Right-click anywhere — group, layer, individual element — should
   show ONLY the actions that make sense for that target, and every
   listed action must actually work.*

## Today's reality (audit, 2026-05-31)

- `FeatureGroup` (lib/cad/types.ts:104) already exists with
  `featureGroups: Record<string, FeatureGroup>` on the drawing doc +
  `featureGroupId?: string | null` on each Feature. Same-layer only;
  one-level deep — no nested groups.
- `Feature.type === 'POLYLINE' | 'POLYGON'` is a single feature with
  a vertex array in `geometry`. There are NO per-segment Feature
  records: segments are computed by iterating vertices. So the
  "every segment has its own eye" symptom isn't real for vanilla
  polygons — but the recently-added per-feature eye does add one row
  per Feature. If the user is seeing "many segments under a polygon"
  it's likely:
    (a) a `MIXED_GEOMETRY` feature whose internal pieces render as
        separate rows, OR
    (b) the polygon was built from N independently-drawn LINE
        features that were not merged.
  Verify before refactoring.
- `LayerPanel.tsx` (~1107 lines) groups by `featureGroupId` ⇒ ungrouped
  features. Renders a flat list of group entries + a flat list of
  ungrouped features. No tree, no nesting.
- Several context-menu surfaces exist (PickModeContextMenu,
  LayerTransferDialog right-click, PointDataViewer row right-click,
  ToolBar variant flyouts on right-click) but each is its own
  bespoke menu. There's NO single "context menu component" reused
  across layer-panel / canvas / group rows.
- The canvas-side right-click "hide element" already works via
  PickModeContextMenu → drawingStore.hideFeature(id).

## Slices

### Slice 1 — Polylines/polygons render as ONE row with an expand-chevron in the layer panel

- LayerPanel feature rows for POLYLINE / POLYGON gain an expand-
  chevron. Collapsed (default) shows just the polygon row with its
  eye + name. Expanded shows the constituent vertices as read-only
  child rows ("Vertex 1: N…, E…", "Vertex 2: …") indented under it.
- No per-vertex eye toggle (vertices aren't independently hideable
  — that requires fracturing the polygon, which is a separate op).
- Right-click on the polygon row offers "Explode to segments" which
  IS the way to get per-segment hideability (creates N LINE features
  + deletes the polygon).
- Tests: source-text spec on the chevron + indented vertex rows;
  pure helper that maps a POLYGON Feature → vertex display strings.

### Slice 2 — Nested groups (groups within groups)

- `FeatureGroup` gains `parentGroupId?: string | null`. Existing
  groups normalize to `parentGroupId: null` (back-compat).
- `drawingStore.createFeatureGroup({ parentGroupId? })` honors the
  parent; `drawingStore.moveFeatureGroup(id, newParentId)` reparents.
- Cycle-prevention: a group can't become a descendant of itself.
- Tests: pure helpers for "is descendant", "all descendants of group",
  cycle-detection on reparent.

### Slice 3 — LayerPanel tree render (recursive)

- LayerPanel renders a true tree:
    Layer
      ↳ Group (expandable)
        ↳ Nested group
          ↳ Feature row (polygon with its own chevron, or line, or
            point, etc.)
- Indentation 12px per depth level. Expand state persisted on the
  group itself (`FeatureGroup.collapsed?: boolean`).
- Drag-and-drop (deferred to Slice 7) — for now reparenting is via
  right-click → "Move to group…".

### Slice 4 — Multi-select → right-click → "Group selected"

- New context-menu entry on the canvas right-click when ≥ 2 features
  are selected: "Group selected (N)". Creates a new FeatureGroup
  with the selection as members; if all selected features share a
  parent group, the new group becomes a child of that parent; else
  layer-root.
- The new group is added to the active layer ⇒ if selection spans
  multiple layers, prompt the user to pick the destination layer
  (single-line modal, layer dropdown).
- Tests: pure helper that computes the destination parentGroupId
  from a selection set + spec on the new context-menu entry.

### Slice 5 — Unified context-menu component

- New `<TargetContextMenu target={…} x y onClose />` that takes a
  discriminated `target` ({ kind: 'layer' | 'group' | 'feature' |
  'selection', id }) and returns the relevant menu items, each with
  a click handler that calls into drawingStore / selectionStore.
- Reuse from LayerPanel rows + canvas right-click (when an element
  is clicked). Each action wires to a real store call — no
  placeholder "TODO" entries.
- Tests: source-text spec on every (target.kind, action) pair;
  smoke tests that each handler calls the expected store method.

### Slice 6 — "Explode polygon to segments"

- Right-click on a POLYLINE / POLYGON feature gains an "Explode" item
  that:
    1. Creates one LINE feature per segment (N - 1 for polyline,
       N for closed polygon).
    2. Wraps the new lines in a FeatureGroup named after the source
       (so the surveyor can still treat them as a unit OR drill in
       and hide a single segment).
    3. Deletes the original feature in the same undo step.
- Inverse op ("Re-merge segments to polygon") deferred to a later
  slice if asked.

### Slice 7 — Drag-and-drop reparenting (deferred unless requested)

- Reparent groups + features by dragging the row to a new parent.
- Implementation-cost-vs-value: the right-click "Move to group…"
  from Slice 5 already covers the use case. Defer until the user
  asks for it explicitly.

## Out of scope / placeholder

- Per-segment STYLE override on a polygon (different color on
  segment 3) — surveyors who need that should explode first.
- Cross-layer grouping (a single group with features on multiple
  layers) — same-layer-only invariant kept for now; the multi-layer
  prompt in Slice 4 nudges the user toward consolidating.

## Guardrails

- Every new field optional with a baseline default; existing
  drawings load unchanged.
- Group-nesting depth is unbounded but a runtime cycle-check guards
  against malformed docs.
- Per slice: typecheck + lint + commit + push + annotate this doc.

## TL;DR

Seven slices. The first four are the most useful — polygons as
single rows with a drill-in chevron (1), nested groups in the data
model (2), tree-rendered layer panel (3), multi-select grouping via
right-click (4). Slice 5 unifies context menus. Slice 6 lets users
explode a polygon when they DO need per-segment control. Slice 7
(drag-and-drop) is deferred unless explicitly requested.
