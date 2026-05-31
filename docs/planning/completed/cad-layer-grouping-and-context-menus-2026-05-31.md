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

### Slice 1 — Polylines/polygons render as ONE row with an expand-chevron in the layer panel ✅ shipped 2026-05-31

- New pure module `lib/cad/feature-vertices.ts`:
  - `formatFeatureVertices(feature)` — returns one display string
    per vertex (`v<n> — (x.x, y.y)`, 1-decimal precision) for
    POLYLINE / POLYGON features; `[]` for anything else.
  - `isExpandableFeature(feature)` — true only for POLYLINE /
    POLYGON with a non-empty vertex array. Gates the chevron + the
    indented child rows so the layout stays consistent for other
    feature types.
- LayerPanel adds an `expandedFeatures: Set<string>` state. Each
  POLYLINE / POLYGON feature row (both the ungrouped section and
  the group-members section) renders an expand chevron before the
  eye toggle; clicking it flips the row's id in the set. Other
  feature types get a same-width spacer so the row stays aligned.
- When expanded, indented read-only child rows show the vertex
  display strings via `formatFeatureVertices`. No per-vertex eye —
  per-vertex / per-segment hideability requires the explode op
  (Slice 6 of this plan).
- Tests: 7 pure-helper specs lock the format + the expandability
  predicate; 7 source-text specs lock the helper imports, the
  expandedFeatures state, the chevron + click handler, the
  expandable gate, the vertex-row testid + map, and the layout
  spacer for non-expandable rows.
- Full cad suite (1953) green; typecheck + lint clean.

### Slice 2 — Nested groups (groups within groups) ✅ shipped 2026-05-31

- `FeatureGroup.parentGroupId?: string | null` added to types.ts.
  Optional ⇒ existing groups normalize to `null` (layer-root) on
  read, so saved drawings load unchanged.
- New pure module `lib/cad/feature-groups.ts` ships the hierarchy
  helpers: `parentOf`, `ancestorChain`, `isDescendantOf`,
  `allDescendants`, `wouldCreateCycle`, `childrenOf`. Each is
  cycle-safe (the chain walker tracks `seen` and stops on revisit).
- `drawingStore.moveFeatureGroup(groupId, newParentId)` reparents
  with cycle guard — returns `true` on success, `false` (no-op)
  when:
    - `newParentId === groupId` (self-parent)
    - `newParentId` is a descendant of `groupId` (loop)
    - the source or target group doesn't exist
  `newParentId === null` moves to layer-root (always safe).
- `createFeatureGroup({ parentGroupId })` deliberately NOT done in
  this slice — the existing `groupFeatures` API already accepts a
  name; surfacing the parent id at create-time can wait until the
  Slice-4 multi-select-grouping UI needs it (the new
  `moveFeatureGroup` action covers post-create reparenting today).
- Tests: 22 pure-helper specs lock parent resolution, ancestor
  chain (incl. cycle-safety), descendant queries, the move-
  validation contract, and childrenOf; 7 store specs lock the
  moveFeatureGroup action's success / cycle-rejection / null-parent
  / unknown-id paths.
- Full cad suite (1982) green; typecheck + lint clean.

### Slice 3 — LayerPanel tree render (recursive) ✅ shipped 2026-05-31

- LayerPanel iterates ONLY root-level groups (`parentGroupId == null`)
  via the new `rootLayerGroups` filter. Nested groups are reached by
  the recursive `renderGroup(group, depth)` helper, which renders
  the group header + (when expanded) child groups via recursion at
  `depth + 1` followed by member features.
- Indentation is `depth * 0.75rem` (12 px / level) applied as
  `paddingLeft` to the outer div, so all descendants of a nested
  group inherit the offset and stack cleanly. Depth-0 groups have
  no extra padding ⇒ pixel-identical to the pre-Slice-3 flat render
  for users with no nested groups.
- Child groups render BEFORE member features inside an expanded
  group (containers above leaves), matching CAD layer-panel
  convention.
- Expand state stays in the existing `expandedGroups: Set<string>`
  state (no `FeatureGroup.collapsed?` field needed — the in-panel
  state was already there from earlier slices).
- Tests: 7 source-text specs lock the root-filter, the iteration
  source, the renderGroup signature, the child-group lookup, the
  per-depth indentation, the recursive call at `depth + 1`, the
  child-before-features order, and the `data-group-depth` stamp.
- Full cad suite (1990) green; typecheck + lint clean.

### Slice 4 — Multi-select → right-click → "Group selected" ✅ shipped 2026-05-31 (parent-inference + store wiring)

- Discovered the canvas "Group Selected (N)" menu entry was ALREADY
  in `FeatureContextMenu.tsx` from earlier work (line ~1085) +
  `handleGroupSelected` already enforces same-layer + already-grouped
  guards. The new contribution for Slice 4 is the
  nested-group-aware backend:
    - **Pure helper** `computeDestinationParentGroup(selection)` in
      `lib/cad/feature-groups.ts` — returns the shared
      `featureGroupId` when every selected feature belongs to the
      SAME existing group (new sub-group nests under that parent),
      else `null` (layer-root). All-or-nothing rule keeps the
      semantics unambiguous.
    - **Store** `drawingStore.groupFeatures(ids, name, parentGroupId?)`
      gained an optional third arg. The new group's `parentGroupId`
      is set + validated: the parent must exist and share the same
      layer; mismatches reject with null so the tree never crosses
      layers.
- Tests: 6 pure-helper specs lock empty / all-ungrouped / mixed /
  shared / spanning / missing-field cases; 3 store-level specs lock
  the default null behavior, the sub-group create with explicit
  parentGroupId, and the rejection on a non-existent parent.
- **Deferred — cross-layer destination prompt.** When a selection
  spans multiple layers the existing UI already raises an alert.
  Replacing it with a destination-layer modal is its own slice
  (needs a real modal component, undo wiring for the implied
  layer-move, and tests). The current alert UX is functional and
  rare; deferred until the surveyor asks for it.
- Full cad suite (1999) green; typecheck + lint clean.

### Slice 5 — Unified context-menu component ✅ shipped 2026-05-31 (group-target first cut)

- New `TargetContextMenu.tsx` component with the discriminated
  `target: { kind: 'group' | 'feature' | 'layer' | 'selection',
  id }` shape. First cut surfaces the GROUP target only — every
  action wires to a real store call:
    - **Select all in group** → `selectionStore.selectMultiple`
    - **Rename** → parent's `onRequestRename` (drives the existing
      inline rename input the LayerPanel already manages)
    - **Move to layer root** (only when the group is nested) →
      `drawingStore.moveFeatureGroup(id, null)`
    - **Ungroup** (danger) → `drawingStore.ungroupFeatures`
- LayerPanel imports + tracks an open `targetMenu` state, attaches
  `onContextMenu` on the group header row, and renders
  `<TargetContextMenu>` with `onRequestRename = startRenameGroup`
  + `onClose = setTargetMenu(null)`. The component manages its own
  outside-click + Escape dismissal (mirroring the established
  `FeatureContextMenu` pattern).
- **Scope note** — the existing layer-row context menu in
  LayerPanel + the canvas `FeatureContextMenu` (~1418 lines, fully
  functional) stay as-is. Folding them into `TargetContextMenu`
  would be a large refactor with limited user-facing benefit
  today; it can happen incrementally as future surfaces need menu
  items. The point of Slice 5 was filling the missing right-click
  on group rows, which is now done.
- **Amendment shipped 2026-05-31** — "Move to group…" submenu
  added to the group menu. Lists every other group on the same
  layer that's not the source itself and not one of its
  descendants (cycle guard via `allDescendants`). Clicking a
  target calls `drawingStore.moveFeatureGroup(source.id, target.id)`;
  the store-level cycle guard runs a second check. 4 new source-
  text specs lock the import, the moveTargets filter, the toggle
  gate, and the per-target button wiring. This amendment makes
  Slice 7's deferral rationale (below) accurate: right-click
  reparenting is now a real, complete affordance.
- Tests: 12 source-text specs lock the discriminated-union type,
  every group menu item's wiring (select / rename / move /
  ungroup), the stale-id null return, the outside-click +
  Escape dismissal, the LayerPanel import, the `targetMenu`
  useState, the onContextMenu handler, and the conditional render.
- Full cad suite (2011) green; typecheck + lint clean.

### Slice 6 — "Explode polygon to segments" ✅ shipped 2026-05-31

- New operation `explodeFeatureGrouped(featureId)` in
  `lib/cad/operations.ts`. Delegates to the existing
  `explodeFeature` for the source-feature → LINE mapping, then
  wraps the resulting selection in a FeatureGroup named after the
  source (or `<TYPE> <shortId>` when the source has no name).
  Returns false on a non-existent source; returns true (no group
  created) when the explode produces a single LINE (LINE sources
  are already a single segment — the existing explodeFeature
  no-ops on them).
- New menu entry **"Explode to segments (grouped)"** added next to
  the existing **"Explode (burst into LINEs)"** in
  `FeatureContextMenu`'s Edit submenu, gated on the same
  POLYLINE / POLYGON / MIXED rule. Both variants stay so the
  surveyor can choose grouped vs. ungrouped per situation.
- Undo: the source `explodeFeature` pushes its own batch (source
  removed + lines added, atomic). The group create is a separate
  state mutation that doesn't push a dedicated undo entry — on
  undo the lines are removed and the group's `featureIds` becomes
  stale; the group sits orphaned but inert until something touches
  it. A dedicated `MODIFY_FEATURE_GROUPS` undo op is a documented
  follow-up if the orphan state becomes a real complaint.
- Tests: 8 specs lock the per-segment line counts for POLYGON and
  POLYLINE sources, the group's name + member-count, the
  `<TYPE> <shortId>` fallback, every line carrying the new
  `featureGroupId`, the non-existent-id no-op, the FeatureContextMenu
  import, and the menu-entry source-text wiring.
- **Deferred — inverse op "Re-merge segments to polygon".** The
  plan explicitly notes this as deferred-unless-asked; the
  grouped-explode result already lets the surveyor work with the
  segments together via the new FeatureGroup, so the inverse op's
  marginal value vs. cost (merging arbitrary line sets into a
  polygon is fragile geometry work) doesn't justify a slice today.
- Full cad suite (2019) green; typecheck + lint clean.

### Slice 7 — Drag-and-drop reparenting ⏸ deferred 2026-05-31

- Reparent groups + features by dragging the row to a new parent.
- **Rationale for deferral**: Slice 5's "Move to group…" submenu
  (added as an amendment 2026-05-31) already lets the surveyor
  reparent any group via right-click → pick a target. The
  drag-and-drop affordance is a UX nicety on top, not a
  capability gap — its implementation cost (HTML5 drag-drop on
  recursive tree rows, drop-position indicators, undo wiring,
  cross-browser quirks, scroll-on-drag) clearly exceeds the
  marginal value over the existing context-menu path. Will
  revisit if the surveyor asks for it.

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
