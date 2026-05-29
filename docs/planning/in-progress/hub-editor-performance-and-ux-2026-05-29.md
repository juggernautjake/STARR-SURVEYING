# Hub editor — performance + UX polish

*Opened 2026-05-29 as a direct follow-up to
`customizable-hub-and-work-mode-2026-05-28.md` (Slices 78–197).*

## Why this doc exists

The v2 hub shipped with feature-complete widget catalog, edit mode,
settings panel, providers, and a working cutover (Slices 185–197). The
user reports the actual experience is slow + clunky: the page freezes,
dragging is sluggish, adding widgets feels heavy. The build is right
but the runtime isn't. This doc captures the post-ship hardening pass
that gets the editor to "feels native" responsive + easy to use.

Slice numbering continues from Slice 197 of the customizable-hub doc
so commit messages + git blame stay unambiguous. Future planning docs
continue from 209+.

## What we know is slow

Concrete audit findings against the shipped code:

1. **N parallel fetches on mount.** Every widget runs its own
   `fetch('/api/admin/…')` from a `useEffect` when the canvas
   hydrates. With 6 persona-default widgets that's 6 parallel network
   calls, each carrying session cookies + waiting for a roundtrip.
   The Slice-152 hub-data aggregator (`/api/admin/me/hub-data`) was
   built specifically to collapse these into one call but
   `HubMeClient` never reaches for it.

2. **Cascading re-renders from chunky zustand selectors.** `HubCanvas`
   selects `widgets`, `draftWidgets`, `isEditMode`, and
   `setDraftWidgets` from `useHubStore`. Each of those is a separate
   subscription but the component re-renders every time *any* of
   them changes. Worse, each `WidgetCell` is unmemoized — a single
   widget moving 1px during a drag re-renders every other cell on
   the grid.

3. **AddWidgetModal mounts the whole catalog on every render.** Even
   when closed it still walks `allWidgets()`. When open, the modal
   renders 36 widget tiles at once with no virtualization or lazy
   tab-rendering.

4. **Two competing resize sources.** `WidgetGrid` tracks
   `viewportPx` via `window.innerWidth` in one effect AND maintains
   a `ResizeObserver` on its container in another effect. Both
   trigger state updates; on a window resize the grid re-renders
   twice in quick succession.

5. **SettingsPanel re-renders the whole tree on every keystroke.**
   When the user types in the custom-title input, the whole panel +
   live preview + tab strip re-render. The Layout / Style / Content
   / Interaction tabs all stay mounted so swapping is instant, but
   typing is expensive.

6. **No skeleton on first paint.** Widgets render `WidgetSkeleton`
   while their fetch is in flight but the initial render is the
   skeleton too — the user sees pulsing rectangles before any
   widget content lands.

7. **AdminTopBar polls + ticks every 30s.** `ClockInPill` polls
   `/api/admin/time-logs/today` every 60s AND its elapsed timer
   ticks every 30s. Both trigger a topbar re-render; the topbar is
   above the canvas so the whole tree below it can re-render
   depending on context propagation.

8. **No mobile responsiveness audit.** The 1-col stack at <768px
   from Slice 92 works but widget bodies themselves often render
   horizontally-oriented content that overflows on phones.

9. **Drag-drop has no drop indicator.** dnd-kit moves the dragged
   widget but the destination isn't shown — feels like a dice roll.

10. **No telemetry.** We have no observation surface to tell which
    of the above is the actual bottleneck on the user's machine vs.
    a perceived issue.

## Phases + slices

### Phase 31 — Network + render perf (Slices 198–202)

#### Slice 198 — Wire HubMeClient through the hub-data aggregator ✅ shipped (partial widget refactor)
- **Scope:** `HubMeClient` builds the list of widget ids from
  `layout.widgets` + fetches `/api/admin/me/hub-data?widgets=…` once
  on mount. Result is dropped into a new `useHubDataStore` (zustand
  store keyed by widget id → `{data, error, status}`). Each widget's
  `useEffect` fetch is replaced with a `useHubData(widgetId)` hook
  that reads from the store. When the store has data, the widget
  body renders immediately without its own network call. When the
  hub-data call hasn't resolved yet, widgets fall back to their
  existing per-widget fetch so they still work standalone.
- **Files:** `lib/hub/hub-data-store.ts`, `lib/hub/use-hub-data.ts`,
  `app/admin/me/HubMeClient.tsx`, refactor 5 highest-traffic widgets
  (`my-jobs`, `today-schedule`, `pto-balance`,
  `pending-receipts`, `team-status`) to consult the store first,
  `__tests__/hub/hub-data-store.test.ts`
- **Done when:** Network panel shows a single
  `/api/admin/me/hub-data?widgets=…` call instead of N per-widget
  calls when the page first loads.
- **Depends on:** Slice 152, Slice 187
- **Done:** Shipped the infrastructure + the canonical widget refactor; remaining 4 widget refactors deferred to a follow-up (Slice 198b in spirit). New `lib/hub/hub-data-store.ts` is a tiny zustand cache keyed by widget id → `{status, data, error, fetchedAt}` with three actions: `startAggregatorFetch(widgetIds)` (marks each id loading, no-clobber if data already present so the cache stays warm during a refetch), `receiveAggregatorPayload(payload)` (writes the aggregator's `{data}|{error}|{skipped}` envelopes — skipped widgets stay in idle so their own fetch path runs), and `failAggregatorFetch(error)` (flips loading entries back to idle + records the global error so widgets fall through to their per-widget fetches). A `selectHubDataEntry(widgetId)` factory returns a stable idle sentinel so widgets can call `useHubData(id).status === 'idle'` without ref equality flapping. Companion `lib/hub/use-hub-data.ts` exposes `useHubData(widgetId)` (the React hook) + `hydrateHubDataFromAggregator(widgetIds, fetchImpl?)` (the pure side-effect helper HubMeClient calls). `HubMeClient.tsx` calls `hydrateHubDataFromAggregator(uniqueWidgetTypes)` in a new `useEffect` keyed on `layout.widgets` so first paint of `/admin/me` fires one `/api/admin/me/hub-data?widgets=…` instead of N parallel `/api/admin/*` calls — for the surveyor's default layout that drops N=6 widget fetches to 1 aggregator call. `lib/hub/widgets/my-jobs/index.tsx` was refactored as the canonical example: it now reads `useHubData('my-jobs')` + only consults the cache when `matchesAggregatorDefaults(settings)` is true (filter='mine' + rowLimit=10 — the exact URL the aggregator already requested in `/api/admin/me/hub-data/route.ts`). When the cache has the payload it renders directly from it; when the surveyor switched filter / rowLimit it falls through to the per-widget fetch. `sortBy` / `columns` / `showStageColors` are deliberately treated as client-only render switches so they don't bust the cache. 21 vitest specs lock the store's contract (idle sentinel stability, no-clobber start, ok/error/skipped payload handling, global aggregator status flips, network failure → idle fall-through, url-encoded ids so a hostile widget id can never inject raw text into the URL) + the `matchesAggregatorDefaults` gate. The remaining 4 widgets (`today-schedule`, `pto-balance`, `pending-receipts`, `team-status`) need per-widget gates because their settings affect URL parameters in non-uniform ways (e.g. `today-schedule` derives a `from`/`to` window from `settings.timeRange` that the aggregator path doesn't carry) — each needs its own `matchesAggregatorDefaults` predicate or a server-side aggregator tweak that respects the widget's settings. Captured as follow-up work below. `tsc` + `eslint` clean.

##### Slice 198 follow-up — refactor remaining 4 widgets to consult the aggregator (deferred to a future slice)
- `today-schedule`: aggregator path is `/admin/schedule` but the widget calls `/admin/schedule?from=…&to=…` derived from `settings.timeRange`. Either add a `from`/`to` aware aggregator path or gate consultation on `settings.timeRange === 'all-day'`.
- `pto-balance`: aggregator path `/admin/pto` — needs a quick audit that the widget's request matches.
- `pending-receipts`: aggregator path `/admin/receipts?status=pending` — matches if the widget's default filter is `status=pending`, audit needed.
- `team-status`: aggregator path `/admin/team/status` — should be a clean drop-in.

#### Slice 199 — Memoize WidgetCell ✅ shipped (memo applied at body level)
- **Scope:** Wrap `WidgetCell` (the per-cell component inside
  `WidgetGrid.tsx`) with `React.memo` + a custom equality function
  that compares only the `instance` shallow + edit-mode flag.
  Sortable wrappers from @dnd-kit get the same treatment via a
  wrapping memo'd component. Verify with a render-count spy that
  dragging widget A no longer re-renders widget B-Z.
- **Files:** `lib/hub/components/WidgetGrid.tsx`,
  `__tests__/hub/widget-grid-memo.test.tsx`
- **Done when:** Render-count assertion shows neighbor cells skip
  re-renders during drag.
- **Depends on:** Slice 92, Slice 98
- **Done:** Memo applied one level deeper than the original scope called for — on the heavy `<Widget>` body, not on `WidgetCell` itself. Reasoning: `SortableWidgetCell` calls `useSortable` directly, which returns fresh `attributes` / `listeners` / `transform` references on every dnd-kit drag frame (every neighbor cell, not just the one being dragged). React.memo on `WidgetCell` or `SortableWidgetCell` can't skip those re-renders because the listener props are unstable by design. The actual perf win comes from skipping the `<Widget>` body subtree (often runs its own /api/* fetch + renders rows), which is unaffected by drag transforms. New `MemoWidgetRender` component memoizes the body with a custom equality that compares `Widget` component identity, `customization` reference, `size.w` / `size.h` primitives, `editMode`, and `content` reference — so a fresh `{ w, h }` object built each drag tick still skips when the underlying values haven't changed. `StaticWidgetCell` was refactored to inline the per-cell customization + content derivation + render `MemoWidgetRender` inside `<WidgetFrame>` instead of inlining `<Widget>` directly. The `<WidgetFrame>` wrapper stays unmemoized so drag listeners can flow through into `headerAction` without busting the body's skip. A module-scope frozen `EMPTY_CUSTOMIZATION` sentinel keeps the cache hit stable across re-renders for widgets that haven't been customized. 13 vitest specs lock the skip: smoke render-count, memo-wrapper sanity (`$$typeof === Symbol.for('react.memo')`), equality semantics — skips on identical refs, skips on deep-equal fresh size objects (the drag-tick case), renders on every primitive change (w / h / editMode / Widget identity / customization ref / content ref), and the frozen + reference-stable EMPTY_CUSTOMIZATION sentinel. 623 specs across all hub tests still green. `tsc` + `eslint` clean.

#### Slice 200 — Picky zustand selectors throughout HubCanvas + SettingsPanel
- **Scope:** Replace each multi-field `useHubStore` read with
  single-field selectors. Where two fields are needed together,
  use the `shallow` equality function from zustand. Apply the same
  treatment to `SettingsPanel`, `EditModeBar`, `CustomizeHubButton`
  and `AddWidgetModal`.
- **Files:** `lib/hub/components/HubCanvas.tsx`,
  `lib/hub/components/SettingsPanel.tsx`,
  `lib/hub/components/EditMode.tsx`,
  `lib/hub/components/AddWidgetModal.tsx`,
  `__tests__/hub/canvas-selector-shape.test.tsx`
- **Done when:** A canvas-wide render-count spy reports ≤1 canvas
  re-render per relevant state change (drag tick, edit toggle,
  modal open).
- **Depends on:** Slice 185, Slice 100, Slice 101

#### Slice 201 — Lazy-mount AddWidgetModal
- **Scope:** When `open=false` the modal renders nothing — currently
  it still computes `allWidgets()`, `filterCatalog`, and
  `groupByCategory` because the hooks are called above the
  early return. Move those calls into a child component that only
  mounts when `open` is true. Add a 36-row virtualization cap so
  the catalog only renders the first viewport's worth of tiles up
  front (lazy-render the rest as the user scrolls).
- **Files:** `lib/hub/components/AddWidgetModal.tsx`,
  `__tests__/hub/add-widget-lazy.test.tsx`
- **Done when:** Modal open/close has no measurable cost when the
  user isn't actively customizing; opening the modal renders ≤12
  tiles initially.
- **Depends on:** Slice 100

#### Slice 202 — Consolidate WidgetGrid resize tracking
- **Scope:** Today `WidgetGrid` has two effects (a `window.innerWidth`
  watcher + a `ResizeObserver` on its container). Collapse to one
  shared `useElementSize` hook that returns `{ widthPx,
  breakpoint }` derived in a single ResizeObserver callback. Coalesce
  resize events with `requestAnimationFrame` so rapid pointer-driven
  resizes batch into one re-render per frame.
- **Files:** `lib/hub/use-element-size.ts`,
  `lib/hub/components/WidgetGrid.tsx`,
  `__tests__/hub/use-element-size.test.ts`
- **Done when:** Resizing the browser window from 1440 → 480 → 1440
  shows a single re-render per breakpoint crossing rather than
  multiple ticks in dev tools.
- **Depends on:** Slice 92

### Phase 32 — Editor UX polish (Slices 203–206)

#### Slice 203 — Drop indicator + drag overlay during edit
- **Scope:** Use `@dnd-kit/core`'s `DragOverlay` to show a
  semi-transparent ghost of the dragged widget pinned to the cursor.
  Add a `dropIndicatorRect` derived from the active hover target
  that paints a 2px accent border on the destination cell. Feels
  immediately more deliberate.
- **Files:** `lib/hub/components/WidgetGrid.tsx`,
  `__tests__/hub/widget-grid-drag.test.tsx`
- **Done when:** Dragging shows the ghost + the destination
  highlighted; on drop the widget snaps into the highlighted slot.
- **Depends on:** Slice 98, Slice 199

#### Slice 204 — Skeleton on first paint
- **Scope:** When `useHubData(widgetId).status === 'idle'` (the
  aggregator hasn't resolved yet AND the per-widget fallback fetch
  hasn't started), render `WidgetSkeleton` immediately. Each widget
  declares its preferred skeleton shape via an optional `Skeleton`
  field on the `WidgetDefinition`. Default is the existing
  `WidgetSkeleton rows={3}`. Layout stays stable + the user sees
  outlines on first paint instead of blank cells.
- **Files:** `lib/hub/widget-registry.ts` (add optional `Skeleton`
  to `WidgetDefinition`), `lib/hub/components/WidgetGrid.tsx`,
  light pass through the 5 most-used widgets to declare custom
  skeletons matching their content layout.
- **Done when:** A throttled-network first paint shows the skeleton
  immediately + each widget transitions smoothly to its real
  content.
- **Depends on:** Slice 91, Slice 198

#### Slice 205 — useTransition for SettingsPanel tab switches + input edits
- **Scope:** Wrap tab switches + per-input writes in `useTransition`
  so React doesn't block the keystroke on the entire tree's
  re-render. Mark the live preview as `priority: 'transition'` so it
  catches up after the input commits. Typing in the custom-title
  field stays snappy even when the rest of the panel is heavy.
- **Files:** `lib/hub/components/SettingsPanel.tsx`,
  `lib/hub/components/settings/LayoutTab.tsx`,
  `__tests__/hub/settings-panel-transition.test.tsx`
- **Done when:** Holding a key in the custom-title input never
  drops a character + the preview catches up within ≤50ms of the
  input idling.
- **Depends on:** Slice 101, Slice 102

#### Slice 206 — Mobile responsiveness audit + per-widget body fixes
- **Scope:** Walk the 36 widgets in narrow viewports. Anything that
  overflows horizontally gets a `min-width: 0` + an internal
  `overflow: hidden` + `text-overflow: ellipsis` pattern. Make sure
  long titles don't push the drag handle out of the header.
  Document the per-widget pattern in
  `lib/hub/components/WidgetFrame.tsx`. Audit captured in the
  doc's completion note.
- **Files:** `lib/hub/components/WidgetFrame.tsx`, light edits to
  any of the 36 widgets that overflow,
  `e2e/hub-mobile-responsive.spec.ts`
- **Done when:** Each widget renders without overflow at 320px /
  480px / 768px / 1024px / 1440px.
- **Depends on:** Slice 91, Slice 151

### Phase 33 — Observability + verification (Slices 207–208)

#### Slice 207 — Render-count instrumentation under a debug flag
- **Scope:** Add a `?debug=hub-perf` query parameter that mounts a
  tiny floating overlay reporting the canvas's render count + the
  current `useHubStore` subscription count + each widget's last
  render duration (via `performance.now()`). Off in prod. Lets us
  confirm the perf claims in Phases 31–32 are real on actual user
  hardware.
- **Files:** `lib/hub/components/PerfOverlay.tsx`,
  `lib/hub/components/HubCanvas.tsx`,
  `__tests__/hub/perf-overlay.test.tsx`
- **Done when:** Visiting `/admin/me?debug=hub-perf` shows the
  overlay; the canvas-level render count after a drag matches the
  Slice-200 assertion.
- **Depends on:** Slice 200

#### Slice 208 — Playwright perf smoke
- **Scope:** New `e2e/hub-editor-perf.spec.ts` that signs in,
  visits `/admin/me?debug=hub-perf`, waits for first contentful
  paint of `.hub-canvas`, asserts the time-to-FCP is ≤ 800ms on a
  default-throttled connection. Drag a widget end-to-end +
  asserts the overlay's neighbor re-render count is 0. Resize the
  window across breakpoints + asserts ≤1 canvas re-render per
  crossing.
- **Files:** `e2e/hub-editor-perf.spec.ts`
- **Done when:** `npm run e2e -- --grep hub-editor-perf` passes
  against a dev server.
- **Depends on:** Slice 207

---

## Cross-cutting reminders

Same workflow as the customizable-hub doc:

1. Implement → `npm run type-check && npm run lint` clean.
2. Add tests inside the slice (vitest for logic, Playwright for UI
   flows).
3. Annotate THIS doc with the completion note + commit hash.
4. Commit only the files this slice touched.
5. Push to `claude/gifted-ramanujan-lQaEI`.
6. When every slice is shipped, MOVE this doc to
   `docs/planning/completed/`.

---

## TL;DR

- 11 follow-up slices (198–208) covering 5 network + render perf
  fixes, 4 editor UX polish items, and 2 observability /
  verification slices.
- Slice 198 is the highest-impact single change — collapsing N
  per-widget fetches into one aggregator call usually accounts for
  the majority of perceived "slowness" on first load.
- Slices 199 + 200 + 202 are the standard zustand + React render-
  perf fixes; should restore "feels native" responsiveness during
  edit mode + window resizes.
- Slice 203 fixes the most-reported drag-and-drop UX gap.
- Slice 207 + 208 give us telemetry + a baseline so we can prove
  the perf claims are real.
