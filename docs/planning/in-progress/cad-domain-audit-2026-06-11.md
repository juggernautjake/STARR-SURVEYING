# CAD domain audit — layer / point / hotkey passes — 2026-06-11

*User request:*
> "I want you to make three full passes on layer handling, point
> handling, and hot key handling and make sure they are all intuitive
> and consistent and there isn't weird behavior. Any changes that
> would improve these things please implement."

Three Explore agents surveyed the live code in parallel; this doc
bundles their findings, ranks each, and slices the fixes for the
stop-hook to ship one-by-one. **Every change is AI-controllable**:
new actions register as `BindableAction`s, new flags ride in
`doc.settings` / `layer.*`, all dispatchers fire `cad:*` events so
the AI tool registry can drive them.

The ux-cleanup-pass plan still has these slices in flight (do not
overlap): 9 (label drag grouping), 10 (display-prefs sync), 11
(regenerate + lag), 13 (Scale tool). Those stay where they are.

## Findings — ranked

### LAYER (file:line · severity)

1. **L-1 HIGH — Feature groups orphaned on layer delete.** Removing a
   layer migrates features but leaves any `FeatureGroup` whose
   `layerId` points at the deleted layer in place. Same hole exists
   in the AI sandbox draft-promotion path
   (`lib/cad/ai/sandbox.ts:116`). Source: `lib/cad/store/drawing-store.ts:226`.
2. **L-2 HIGH — `getVisibleFeatures()` ignores `locked` + `frozen`.**
   Snap and selection consume this list and can therefore pick
   features on frozen layers, contradicting
   `canFeatureBeRendered()` in `lib/cad/styles/style-cascade.ts:50`.
   Source: `lib/cad/store/drawing-store.ts:727`.
3. **L-3 HIGH — Layer name uniqueness inconsistent.** LayerPanel's
   `commitRename()` doesn't enforce uniqueness while the AI's
   `createLayer` tool does (`lib/cad/ai/tool-registry.ts:373`).
   Identical names confuse the LayerTransferDialog search.
4. **L-4 HIGH — `setActiveLayer` accepts any string.** No validation
   against `doc.layers`; a deleted layer's id can remain active and
   feature creation paths silently orphan their features. Source:
   `lib/cad/store/drawing-store.ts:281`.
5. **L-5 HIGH — `LayerPreferencesPanel.resetToDefaults` skips label
   regen.** Resetting display prefs writes the layer but doesn't run
   `regenerateLayerLabels`, so the canvas keeps stale labels until
   the surveyor toggles something else. Source:
   `LayerPreferencesPanel.tsx:274` vs the `update()` companion at
   L243.
6. **L-6 MED — Hardcoded `'ANNOTATION'` / `'TITLE-BLOCK'` layer
   targets in label / recon code.** Those layers are no longer
   pre-seeded, so generated annotations land on a missing layer and
   silently fail to render. Source: `lib/cad/labels/area-label.ts:68`,
   `lib/cad/labels/bearing-dim.ts:47`, `lib/cad/recon-to-cad.ts:47`.
7. **L-7 MED — `Object.values(layers)` iteration instead of
   `layerOrder`.** Tool registry name-collision checks + sandbox
   helpers ignore the canonical order. Cosmetic today, fragile when
   anything starts depending on bottom-to-top ordering.
8. **L-8 MED — `newDocument()` leaves `activeLayerId = ''`.** First
   feature drawn lands on the empty string until the surveyor picks a
   layer; `loadDocument()` already sets it to `layerOrder[0]`.
9. **L-9 MED — `Layer.displayPreferences` reset spread is fragile.**
   Spread order risks losing nested `pointLabelOffset` fields when new
   nested keys are added later.
10. **L-10 LOW — No `getActiveLayer(): Layer | null` selector.** Every
    caller does `document.layers[activeLayerId]` by hand.

### POINT (file:line · severity)

1. **P-1 HIGH — `LayerTransferDialog` source list NOT filtered for
   master vs mirror/derived.** Slice 3's `filterMovePointRows` is
   only wired into `NewLayerDialog`; the transfer dialog iterates
   `Object.values(doc.features).filter(f => f.type === 'POINT')`
   directly. Source: `LayerTransferDialog.tsx:228–241`.
2. **P-2 HIGH — Inconsistent point-name property keys.**
   `pointNumberOf` reads `pointNo` → `pointNumber` → `pointName` →
   `name` in that order. TRV stamps `pointName`; manual draw stamps
   nothing; AI `addPoint` stamps whatever the caller passes. Source:
   `lib/cad/feature-fields.ts:16–21` vs callers.
3. **P-3 HIGH — Inconsistent property stamping across point
   creation paths.** Symbol assignment is TRV-only; the Draw Point
   tool stamps no code; AI `addPoint` doesn't run the symbol
   lookup. Sites:
   `lib/cad/io/trv-to-drawing.ts:276`,
   `lib/cad/ai/tool-registry.ts:126`,
   `CanvasViewport.tsx:8572`.
4. **P-4 MED — Point-name collision check is rename-only.**
   `nameIsTaken()` in `point-rename.ts:120` catches duplicates on
   rename, but AI / draw-tool point creation doesn't call it.
5. **P-5 MED — Point CODE edit doesn't trigger label regen.**
   `rowEditToFeatureUpdate` writes the property but no
   `regenerateLayerLabels()` follow-up runs, so the label text lags.
   Source: `lib/cad/points/point-rows.ts:104` + caller
   `PointDataViewer.tsx`.
6. **P-6 MED — `POINT_NAME == POINT_CODE` (or `== POINT_DESCRIPTION`)
   not deduped.** Slice 6 only deduped CODE/DESCRIPTION; the other
   pairings still render duplicates. Source:
   `lib/cad/labels/generate-labels.ts:186–241`.

### HOTKEY (file:line · severity)

1. **H-1 HIGH — Context filtering is wired but never narrowed.**
   `useHotkeysStore.activeContext` defaults to CANVAS and no caller
   ever switches it to `DIALOG` / `COMMAND_BAR`. So canvas hotkeys
   fire inside dialogs and through the command bar. Source:
   `lib/cad/store/hotkeys-store.ts:69` (setter exists, zero usages).
2. **H-2 HIGH — AutoCAD preset rebinds Select → Escape, which now
   collides with the Slice-5 chord-dismiss handler.** Pressing Esc
   during a buffered chord clears the buffer, so under the AutoCAD
   preset the surveyor has to press Esc *twice* to actually select.
   Source: `lib/cad/hotkeys/presets.ts:53` + the dismiss handler
   added in `useHotkeys.ts`.
3. **H-3 MED — ChordHUD index ignores user bindings.** A surveyor who
   rebinds `p l` → `p x` still sees `[L] Polyline` in the HUD because
   the index `useMemo` reads only `defaultKey`. Source:
   `ChordHUD.tsx:46–64`.
4. **H-4 MED — AI Chat / CommandBar Escape leakage.** Without context
   narrowing, pressing Esc inside the AI chat dock fires
   `edit.deselect` instead of letting the dock handle it.
5. **H-5 LOW — Bindable ↔ AI tool registry parity unverified.** No
   automated check; some `tool.*` entries have no AI tool counterpart
   (e.g. `tool.smooth`, `tool.simplify`, `tool.divide`).

## Slices

Risk-ordered: pure helpers → store changes → UI wiring.

### Slice A — Master-source filter for the Layer Transfer dialog (P-1)
> **DONE (2026-06-11).** Extracted a Feature-level
> `isMasterPointFeature(feature, layers)` helper into
> `lib/cad/points/move-points-filters.ts` and refactored
> `isMasterPointRow` to delegate to it (single source of truth). The
> dialog now keeps a `pointPoolMode: MovePointsSourceMode` state
> (default `MASTER_ONLY`) and routes the pointCatalog through the new
> helper, so duplicate-layer copies + TRV mirror twins drop out of
> the catalog by default. A `Master file` / `All layers` toggle
> mirrors the NewLayerDialog control so the choice is identical
> everywhere points get moved. 7 unit + source-lock cases in
> `__tests__/cad/ui/layer-transfer-dialog-master-pool.test.ts`. Suite
> 2743 green.

### Slice B — Layer-name uniqueness on rename (L-3)
> **DONE (2026-06-11).** `LayerPanel.commitRename` now case-insensitive
> checks every other layer's name (`l.id !== renamingId`) before
> committing. On collision it dispatches a `cad:commandOutput` toast
> — `Layer named '<name>' already exists (id=<id>). Rename cancelled.`
> — and clears the rename UI without writing. A no-op rename (typing
> the same name back) commits silently. Mirrors the exact predicate
> the AI `createLayer` tool uses (`tool-registry.ts:374`) so the rule
> is identical regardless of who creates the name. 4 source-lock
> cases in `__tests__/cad/ui/layer-rename-uniqueness.test.ts`. Suite
> 2747 green.

### Slice C — Validate `setActiveLayer` against `doc.layers` (L-4)
> **DONE (2026-06-11).** `drawingStore.setActiveLayer` now checks
> `state.document.layers[layerId]`; unknown ids fall back to
> `layerOrder[0]` (or `''` when there are zero layers) and log a
> non-prod-only `console.warn`. Same fallback logic the
> `addLayer` / `removeLayer` / `loadDocument` paths already use, so a
> deleted layer can never linger as the active id and downstream
> feature creation can't silently orphan its features. 5 unit cases
> in `__tests__/cad/store/set-active-layer.test.ts` cover the
> accept / unknown-id-fallback / empty-layers / warning fires /
> idempotent-noop paths. Suite 2752 green.

### Slice D — `getActiveLayer()` selector + `newDocument` activeId (L-8 + L-10)
> **DONE (2026-06-11).** New `getActiveLayer(): Layer | null` selector
> on the drawing store — returns the live Layer (or null when
> `activeLayerId` is empty or stale) so every caller can stop
> re-implementing the lookup. `getActiveLayerStyle` rewires through
> it, falling back to the historical safe defaults. `newDocument()`
> now seeds `activeLayerId = doc.layerOrder[0] ?? ''` (mirrors
> `loadDocument`), so the first piece of geometry the surveyor places
> on a fresh drawing actually lands on a real layer instead of being
> orphaned on `layerId: ''`. The Slice-C validator keeps any
> downstream `setActiveLayer` call honest. 6 unit cases in
> `__tests__/cad/store/get-active-layer.test.ts` cover live / empty /
> stale / fallback / newDocument paths. Suite 2758 green. (Migrating
> the ~30 `doc.layers[activeLayerId]` call sites is deferred — the
> selector is in place and call sites can switch incrementally as
> they're touched, but a single mass rewrite risks regressions
> across unrelated paths.)

### Slice E — `getVisibleFeatures` honors `locked` + `frozen` (L-2)
> **DONE (2026-06-11).** `getVisibleFeatures` now delegates to
> `canFeatureBeRendered(layer)` from `style-cascade` (the documented
> "visible AND not frozen" predicate), so frozen layers stop leaking
> into snap / hit-testing / render walks — the documented "frozen
> layers are completely excluded from rendering, selection, and
> snap" intent is finally enforced. New `getSelectableFeatures()`
> companion delegates to `canFeatureBeEdited(layer)` (additionally
> excludes `locked`) so hit-testing / selection candidates have a
> single-source policy without forcing every visible-feature consumer
> to do its own filter. Orphaned features (whose layer is missing)
> drop out of both. 7 unit cases in
> `__tests__/cad/store/visible-vs-selectable-features.test.ts` cover
> the visible / frozen / locked / hidden / orphan paths. Suite 2765
> green. (Migrating the ~14 `getVisibleFeatures()` call sites to the
> new `getSelectableFeatures()` companion is deferred — they can
> switch incrementally as snap / selection sites are touched.)

### Slice F — Feature-group cleanup on layer delete + draft promote (L-1)
> **DONE (2026-06-11).** `removeLayer` now walks `featureGroups`
> alongside `features`: non-last-layer delete migrates groups on the
> deleted layer to the same `safeTarget` the features migrate to (so
> the "group moves / scales together" intent survives the delete);
> last-layer delete drops them since there's no target. `promoteDraftLayer`
> delegates back to `removeLayer`, so the AI sandbox draft path picks
> up the same cleanup automatically — no group orphans across either
> path. 4 unit cases in
> `__tests__/cad/store/remove-layer-feature-groups.test.ts` cover the
> migrate / other-layer-untouched / last-layer-drop / no-group paths.
> Suite 2769 green. (The shared `pruneOrphanGroups(doc)` helper for
> `loadDocument` is deferred — `loadDocument`'s existing cleanup
> already prunes by feature-id membership, so the orphan-by-layerId
> case only fires inside `removeLayer` which is now correct in-place.)

### Slice G — Reset-prefs runs label regen (L-5)
> **DONE (2026-06-11).** `LayerPreferencesPanel.resetToDefaults` now
> writes `DEFAULT_LAYER_DISPLAY_PREFERENCES`, then re-runs
> `regenerateLayerLabels` against the merged-reset prefs and pipes
> the result through `store.setFeatureTextLabels` — the exact same
> sequence the `update()` companion uses. The "reset doesn't visibly
> do anything" UX hole is closed: existing labels redraw with the
> default text + visibility the moment the surveyor clicks reset.
> 3 source-lock cases in
> `__tests__/cad/ui/layer-prefs-reset-regen.test.ts`. Suite 2772 green.

### Slice H — Hardcoded `'ANNOTATION'` / `'TITLE-BLOCK'` targets fall
back gracefully (L-6). Label + recon writers check
`doc.layers[targetId]`; when missing, create the layer lazily
through `addLayer` with the canonical template OR route the
annotation to the active layer. No silent data loss.

### Slice I — Hotkey context narrowing (H-1, H-4)
Wire `useHotkeysStore.setActiveContext('DIALOG')` to every modal
mount path (`ModalFrame.tsx` covers most). The command bar focus
handler sets `'COMMAND_BAR'`. Add a `useHotkeyContext(context)`
helper so other surfaces can opt in without boilerplate. Tests:
`__tests__/cad/hotkeys/context-narrowing.test.ts`.

### Slice J — Chord HUD respects user bindings (H-3)
Replace ChordHUD's `useMemo` index with one that reads
`useHotkeysStore.userBindings` (subscribed). The list now reflects
the live binding set.

### Slice K — Esc twice under AutoCAD preset (H-2)
When the user is on the AutoCAD preset AND Escape is bound to
`tool.select`, the chord-dismiss handler fires both: clears the
buffer AND dispatches `tool.select`. Detect via
`useHotkeysStore.userBindings.find(...)`.

### Slice L — Point-name collisions on creation (P-4)
`AI addPoint` + the Draw Point tool route through a shared
`createPointSafe()` helper that runs `nameIsTaken` and applies the
same `:K` rename rule the TRV importer uses. Surfaces a
`cad:commandOutput` notification on rename.

### Slice M — Symbol lookup on every point creation path (P-3)
Extract the TRV symbol lookup (`getSymbolsByAssignedCode(code)[0]`)
into a `assignSymbolForCode()` helper and call it from AI `addPoint`,
the Draw Point tool, and CSV import.

### Slice N — Single point-name resolver (P-2)
Codify `pointNumberOf` semantics: read ONE key (`pointName`) with a
final fallback chain only for legacy data, AND have every creation
path stamp `pointName`. Migration: an import-time pass copies
`pointNo` / `pointNumber` / `name` → `pointName` if missing.

### Slice O — Label dedup expanded to NAME ↔ CODE / DESCRIPTION (P-6)
Generalize the Slice-6 dedup so any pair of point labels that would
render identical text is suppressed (lower kinds win:
NAME > CODE > DESCRIPTION priority). Same case-insensitive trim
rule.

### Slice P — Point CODE edit regenerates labels (P-5)
`rowEditToFeatureUpdate` returns a `regenerateLabels: boolean` flag
when the edit touches `code` / `description`; the caller (PointDataViewer
+ AI tool registry) runs `regenerateLayerLabels` on true.

## TL;DR
Sixteen slices spanning layer / point / hotkey hygiene. The HIGH
items (L-1…L-5, P-1, P-2, P-3, H-1, H-2) eliminate real silent bugs
(orphaned groups, frozen-layer snap, duplicate names, master/mirror
leak, hotkey context bleed). The MED items are consistency cleanups
that reduce future regressions. AI-controllable end to end. Risk-
ordered so the stop-hook can chew through them small first.
