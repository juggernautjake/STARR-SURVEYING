# Employee Hub overhaul — one modal editor, slim styling, drag-to-move reflow, per-widget options

*Opened 2026-05-30. Builds on the shipped `STARR_HUB` work (see
`docs/planning/completed/STARR_HUB/`). Focus: make the main employee
hub (`/admin/me`) highly customizable + genuinely helpful. Covers the
Work-Mode button restyle, collapsing the two editing surfaces down to
the single centered-modal editor, a slimmed widget-styling model, true
drag-to-move with live reflow + slot-on-drop, and a per-widget options
system that renders responsively at every widget size.*

## What the user asked for (verbatim)

> Please make the "Enter Work Mode" Have white text and a white
> border. If you can do a cool spinning radial animation effect on the
> border with red white and blue on mouse hover, that would be cool.
> Also, it seems like we have two grid editing systems, and we don't
> need both. Just have the one grid editor that is linked from the
> button on the page. It's the one that is like a modal in the middle
> of the page. Get rid of the side panel grid editor. Also, we don't
> need all the style options for the widget. I just want the size
> options, and we can at least have a color picker for the header of
> each widget. The label header title for the widget should always be
> visible. Also, In the main grid editor that we will be keeping, I
> like how we can drag the widget side to be smaller or bigger. We
> also need to be able to grab the full widget and move it around in
> the grid and all of the widgets need to dynamically shift depending
> on where the user is holding the widget, then when the user lets go
> of the widget, it should slot into the most immediately available
> grid slots. Any of the options that we should be able to edit for
> each widget should have their own interface. So, we can choose which
> widgets we want on the hub, then we can drag them into the grid and
> drop them. Then we can resize them. Then we can drag them wherever we
> actually want them. Then we can click on an options button on the
> widget and have a menu or options so that we can specially gear the
> widget for our preferences. Then we hit save and all of the
> customized widgets will render on the hub page. This means we will
> need to explore what all of the options need to be based on what
> widget we are customizing, and we need to make sure they all work.
> Then we need for those customizations to render and be well
> formatted for the specific size of the widget. Please make this a
> reality.

> [follow-up] We are focusing on building and perfecting the main
> employee hub. I want to make it very customizable and helpful.

## Distilled asks

1. **Work Mode button** — white text, **solid** white border, and a
   spinning conic/radial border animation cycling **red·white·blue**
   on hover.
2. **One editor** — keep the centered **modal** grid editor opened
   from the page button; **remove the side-panel editor**. Everything
   (add, place, resize, move, per-widget options, save) happens in the
   one modal.
3. **Slim widget styling** — keep only **size** + a **header color**
   picker; the header **title is always visible**. Drop the rest
   (colorMode, statusTint, custom bg/fg, border radius, shadow depth,
   the showTitle toggle).
4. **Drag-to-move + live reflow** — keep edge-resize; add: grab the
   whole widget, drag it, the others **shift live** to make room, and
   on release it **slots into the nearest available cells**.
5. **Per-widget options interface** — an **Options** button on each
   widget opens controls tailored to that widget type. Full flow:
   pick widgets → drop into grid → resize → move → Options → **Save**
   → renders on the hub.
6. **Per-widget option sets + responsive render** — define the options
   each widget type needs, wire them all, and make each widget render
   well at its specific **w × h**.

## Verified state of the code (2026-05-30)

> These facts were read from the live source. Each slice should still
> re-open its target region to confirm exact line numbers before
> editing (the hub is under active development).

### Hub page composition

- **`app/admin/me/page.tsx`** — server component. Fetches the saved
  layout (`fetchHubLayoutForUser`) and renders `<HubGreeting />` +
  `<HubMeClient layout … roles … />`.
- **`app/admin/me/HubMeClient.tsx`** — client wrapper; hydrates the
  hub store, side-effect-imports `@/lib/hub/widgets/register-all`,
  renders `<HubProviders><HubCanvas/></HubProviders>`.
- **`app/admin/me/AdminMe.css`** — hub + greeting styles.

### Work Mode button

- **`app/admin/me/components/HubGreeting.tsx`** — `WorkModeButton()`
  (≈ lines 68–82) renders an `<a href="/admin/work-mode/start"
  className="hub-greeting__work-mode-btn">` with a `⚡` icon span.
  Gated by `isWorkModeEligible(roles)`.
- **CSS** `AdminMe.css` ≈ lines 69–102 (`.hub-greeting__work-mode-btn`
  + `:hover/:active/:focus-visible` + icon). Already white text
  (`color:#fff`) and a **translucent** white border
  (`rgba(255,255,255,0.45)`). Needs: solid white border + the spinning
  tri-color hover border + `prefers-reduced-motion` fallback.

### The two editing surfaces (the "two grid editing systems")

Orchestrated by **`lib/hub/components/HubCanvas.tsx`**:

- **System A — in-canvas edit + side panel (REMOVE as a separate
  surface).** `CustomizeHubButton` (`lib/hub/components/EditMode.tsx`)
  → `enterEditMode()` → `WidgetGrid editMode` renders **dnd-kit**
  drag + pointer-resize directly on the live canvas; clicking a widget
  → `openSettings(id)` → **`SettingsPanel`** (a 360 px right-side
  **rail**) with tabs **Layout / Style / Content / Interaction**
  (`lib/hub/components/settings/{LayoutTab,StyleTab,ContentTab,InteractionTab}.tsx`).
- **System B — the modal (KEEP + enhance).** In edit mode the header
  shows a **"▦ Grid editor"** button → opens
  **`lib/hub/components/GridEditor.tsx`**, a centered modal 8×8 grid
  painter (left palette + grid). Exported pure helpers:
  `rectFromAnchors`, `clampRectToEnvelope`, `overlapsAny`,
  `cellUnderPointer`, `computeResizedRect`, `cellsUsed`. Two-click
  placement + corner-drag resize today; **no free move + reflow yet**.
- Also in the header: **"+ Add widget"** → `AddWidgetModal`.

**Plan:** make the page button open the modal directly; the modal
becomes the *only* editor. Remove System A's in-canvas drag/resize +
the `SettingsPanel` rail, **but preserve each widget's `SettingsForm`**
(they live on the widget definitions, not on the panel) so per-widget
options can be re-hosted inside the modal (Phase HB5).

### Widget data model — `lib/hub/types.ts`

```
WidgetInstance { id, type, x, y, w, h, customization? }
WidgetCustomization {
  layout?:      { showTitle?, titleOverride?, density? }
  style?:       { colorMode?, statusTint?, customBg?, customFg?,
                  borderRadius?, shadowDepth? }
  content?:     Record<string, unknown>   // per-widget options bag
  interaction?: { clickAction?, clickTarget?, refreshIntervalSec?,
                  showSeeAllLink?, showRowActions? }
}
```

- **Keep:** size (`w/h`), `layout.titleOverride`, `content`.
- **Add:** `style.headerColor?: string`.
- **Always-on:** title (drop the `showTitle` toggle UI; render header
  always).
- **Remove (UI + reads):** `style.colorMode/statusTint/customBg/
  customFg/borderRadius/shadowDepth`. The generic `interaction` tab is
  dropped; any genuinely useful bits fold into per-widget options.
- **Migration:** old saved layouts in Supabase carry the removed
  fields — the loader/render must **ignore unknown style fields** and
  default `headerColor`. Never drop user layouts.

### Widget catalog

- **~42 widget types** (41 widget dirs under `lib/hub/widgets/` + the
  `_shared` helpers dir) registered in `lib/hub/widgets/register-all.ts`
  via `lib/hub/widget-registry.ts` (`defineWidget` / `getWidget`):
  `pinned-pages, quick-actions, my-pay, my-jobs, messages,
  class-assignments, today-schedule, pto-balance, hours-this-week,
  recent-activity, bookmarks, open-discussions, recent-announcements,
  team-status, mentions-inbox, crew-calendar, field-data-pending,
  job-activity-feed, equipment-out, maintenance-due, low-consumables,
  vehicles-status, recent-drawings, drawings-in-progress,
  active-research-projects, pipeline-status, roadmap-progress,
  flashcards-due, quiz-history, recommended-lessons, pending-receipts,
  pending-time-off, pending-hours, monthly-revenue, outstanding-invoices,
  weather, mileage-tracker, sun-calculator, streak-counter,
  daily-briefing`.
- Each `WidgetDefinition`: `id, label, description, category, iconName,
  defaultSize, minSize, maxSize, defaultContent, allowedRoles,
  requiresBundle?, Widget, SettingsForm?, Skeleton?`.
- **29 widgets already ship a `SettingsForm`** (verified via
  `grep -rl SettingsForm lib/hub/widgets`): `active-research-projects,
  assignments-due, bookmarks, class-assignments, crew-calendar,
  drawings-in-progress, equipment-out, field-data-pending,
  hours-this-week, job-activity-feed, low-consumables, maintenance-due,
  mentions-inbox, messages, mileage-tracker, my-jobs, my-pay,
  open-discussions, pinned-pages, pipeline-status, pto-balance,
  quick-actions, recent-activity, recent-announcements, recent-drawings,
  team-status, today-schedule, vehicles-status, weather`. Only the
  remaining ~13 (e.g. `daily-briefing, monthly-revenue,
  outstanding-invoices, flashcards-due, quiz-history,
  recommended-lessons, roadmap-progress, pending-hours, pending-receipts,
  pending-time-off, streak-counter, sun-calculator, my-pay`-adjacent)
  need option sets defined (Phase HB5) — so HB5 is mostly *re-hosting*
  existing forms into the modal, not authoring from scratch.
- Per-widget options persist in `customization.content`.
- A reusable settings-control library already exists under
  `lib/hub/components/settings/`: `NumberStepper, ToggleGroup,
  MultiSelect, FilterDropdown, RoutePicker, SizeGridPicker,
  CustomColorPicker` (+ `LayoutTab/StyleTab/InteractionTab`). Reuse
  these controls when building the modal's per-widget options surface.

### Store + persistence

- **`lib/hub/hub-store.ts`** (zustand) + **`lib/hub/use-hub-actions.ts`**:
  `enterEditMode, exitEditMode, setDraftWidgets, addWidget,
  removeWidget, patchWidgetCustomization, saveDraft, cancelEdit,
  openSettings, closeSettings`. `widgets` (saved) vs `draftWidgets`
  (edit session).
- **Save:** `saveDraft()` → `PUT /api/admin/me/hub-layout` → Supabase
  `user_hub_layouts`; on success commits draft → widgets, exits edit.

### Render path (read-only hub)

- `HubCanvas` → `WidgetGrid` (12-col responsive, square cells,
  breakpoint collapse) → `WidgetCell`/`StaticWidgetCell` →
  `WidgetFrame` (title + chrome) → memoized widget body.
- **NOTE:** the modal `GridEditor` paints on an **8×8** grid while the
  hub renders **12-col**. Reconcile the coordinate space in HB4 (the
  saved `x/y/w/h` must mean the same thing in both, or the modal must
  map to the 12-col model). Confirm before building reflow.

### Tests

- **70+ specs** in `__tests__/hub/` (plus a `__tests__/hub/widgets/`
  subdir) incl. `grid-editor-{shell,place,selection,resize}.test.tsx`,
  `settings-{panel-transition,tabs,components}.test.tsx`,
  `widget-grid-{drag,edit-affordances,memo}.test.tsx`,
  `widget-frame{,-truncation}.test.tsx`, `widget-resize-handle`,
  `hub-store`, `use-hub-actions`, `widget-registry`,
  `widget-color-modes`, `grid-math`, `grid-resize`, `grid-8x8`,
  `validate-layout`, `size-bucket`, `widgets-responsive-210..217`, …
  Many widget specs exist per type (e.g. `weather`, `my-pay`,
  `today-schedule`). Changing shared chrome (WidgetFrame, WidgetGrid,
  settings) will ripple into several — budget for spec updates.
- **e2e** `e2e/hub-customize.spec.ts` drives the **SettingsPanel** flow
  → must be rewritten for the modal flow (HB6). `e2e/hub-editor-perf.spec.ts`
  too.
- Per the standing zustand + React `useSyncExternalStore` SSR
  snapshot-caching limitation, prefer **pure-unit tests** (extract
  logic into pure helpers) and **`fs.readFileSync` source-level regex**
  tests over interactive store-mutation render assertions.

## Guardrails

- Don't drop user data: migrate/tolerate old `customization` shapes on
  load; default `headerColor`; keep saved `content`.
- Each slice: typecheck + lint clean, its own test, commit + push,
  annotate this doc. List touched files explicitly (no `git add -A`).
  No `--no-verify`, no force-push.
- Don't touch `components/hub/WorkModeApp.tsx` (unrelated) or the
  12,000+ stray `.claude/settings.local.json.backupN` files (pre-
  existing noise, out of scope).
- Removing System A may delete `SettingsPanel.tsx`, `SettingsTabs.tsx`,
  `SettingsPanelMobile.tsx`, `settings/{LayoutTab,StyleTab,ContentTab,
  InteractionTab}.tsx` + their 3 specs — but only after the per-widget
  `SettingsForm`s are re-hosted in the modal (HB5). Sequence the
  deletes so the tree stays green.

---

## Phases + slices

### Phase HB1 — Work Mode button restyle

#### Slice 1 — White text + solid white border + spinning red·white·blue hover border ✅ shipped 2026-05-30
- **Scope:** In `AdminMe.css`, set the rest-state border to solid
  white. Add a hover-only animated conic-gradient border that spins
  red → white → blue around the perimeter (e.g. a wrapper/pseudo layer
  with `conic-gradient` + `@property --angle` or a rotating
  `::before`, masked so only the border shows). Keep text white. Add a
  `@media (prefers-reduced-motion: reduce)` branch that shows a static
  white (or static tri-color) border — no spin. No JS/markup change if
  achievable in pure CSS; otherwise minimal wrapper in
  `HubGreeting.tsx`.
- **Files:** `app/admin/me/AdminMe.css` (+ maybe `HubGreeting.tsx`),
  `__tests__/hub/work-mode-button-style.test.ts` (new, source regex on
  the CSS: solid white border, conic-gradient, `@keyframes`, the three
  colors, reduced-motion guard).
- **Done when:** Rest = white text + solid white border; hover =
  spinning tri-color border; reduced-motion = static. Spec green.
- **Outcome:** Pure-CSS, no markup change. Rest state now uses
  `border: 2px solid #FFFFFF` (replacing `border-color: transparent`)
  with white text retained. Added an `@property --wm-angle` +
  `@keyframes wm-spin` (drives the angle 0→360deg) and a masked
  `::before` (`mask-composite: exclude`, `inset: -3px`, `padding: 3px`)
  painting a `conic-gradient(from var(--wm-angle), #E11D2A, #FFFFFF,
  #2447D6, #FFFFFF, #E11D2A)` rim that's `opacity: 0` at rest and
  fades + spins (`2.4s linear infinite`) only on `:hover`. The masking
  approach shows only the 3px rim so the green face + label are
  untouched (sidesteps z-index pitfalls). The hover rule keeps
  `border-color: #FFFFFF` so the white border persists under the ring.
  A `@media (prefers-reduced-motion: reduce)` block sets
  `animation: none` on hover so the ring still reveals but doesn't
  spin. Browsers without `@property` get a static tri-color ring (same
  as reduced-motion). 10 source-regex specs green; typecheck + lint
  clean.

### Phase HB2 — Consolidate to the single modal editor

#### Slice 2 — Page button opens the modal directly ✅ shipped 2026-05-30
- **Scope:** Re-point the on-page entry so one click opens the modal
  editor. Either repurpose `CustomizeHubButton` to
  `enterEditMode()` + open the `GridEditor` modal, or make the modal
  self-contained (enter edit on open / save on close). Keep the modal
  centered. Remove the now-redundant in-header "▦ Grid editor" /
  "+ Add widget" duplication (Add moves inside the modal palette).
- **Files:** `lib/hub/components/HubCanvas.tsx`,
  `lib/hub/components/EditMode.tsx`, `GridEditor.tsx`,
  `__tests__/hub/single-editor-entry.test.tsx` (new).
- **Done when:** Exactly one button on the hub opens the modal; spec
  asserts the single entry point + that the modal mounts from it.
- **Outcome:** `HubCanvas` now renders a single `✏️ Customize Hub`
  button (`data-testid="open-grid-editor"`, hidden while editing) whose
  `openEditor` handler calls `enterEditMode()` in one click — so the
  modal opens with `draftWidgets` already populated. The old two-step
  "Customize Hub → ▦ Grid editor" flow, the in-header "+ Add widget"
  button + `AddWidgetModal` mount, and the floating `EditModeBar` mount
  are all removed from the canvas (the modal's own footer
  `handleSave`/`handleCancel` — which already call `saveDraft`/`cancelEdit`
  + `onClose` — are the commit surface). A `closeEditor` handler runs
  `cancelEdit()` if the store is still mid-edit (covers backdrop/Esc
  closes). This also delivers most of **Slice 3** (the in-canvas edit
  surface is no longer reachable since `editMode` only turns on with
  the modal open). Note: `EditMode.tsx`
  (`CustomizeHubButton`/`EditModeBar`) + `AddWidgetModal` remain as
  standalone components with their own passing specs — their file
  deletion is folded into Slice 3/4 cleanup.
  **Follow-up fixup (2026-05-30):** the initial Slice 2 mirrored modal
  visibility in a local `useState` `gridEditorOpen`, which meant the
  AdminTopBar "✏️ Customize Hub" menu link (which deep-links to
  `/admin/me?edit=1` and only calls `enterEditMode()` via HubMeClient)
  flipped edit mode without opening the modal — the user reported the
  resulting "click the menu link, then click another button to actually
  open the editor" two-step. Rewired so the GridEditor mounts with
  `open={isEditMode}` directly (single source of truth in the store);
  the local `gridEditorOpen`/`setGridEditorOpen` state is gone. Now
  every path that flips edit mode — in-canvas button OR the
  `?edit=1` deep-link OR any future entry — opens the modal in one
  click. Spec updated to lock the `open={isEditMode}` wiring + the
  absence of a `gridEditorOpen` mirror. 1144 hub specs green; typecheck
  + lint clean.

#### Slice 3 — Remove the in-canvas drag/resize edit surface ✅ shipped 2026-05-30
- **Scope:** Strip System A's live-canvas editing: `WidgetGrid` stops
  rendering dnd-kit drag + pointer-resize affordances (it becomes
  view-only / read-only render). Keep `WidgetGrid` for the hub render.
  Remove now-dead edit props/handlers. Update/trim
  `widget-grid-resize.test.tsx`.
- **Files:** `lib/hub/components/WidgetGrid.tsx`, `WidgetCell.tsx`,
  affected specs.
- **Done when:** The live canvas no longer drags/resizes; the modal is
  the only place to edit layout. Typecheck/lint green; specs updated.
- **Outcome:** `WidgetGrid.tsx` rewritten as a pure view-only renderer
  (612 → 195 lines). Removed: the entire dnd-kit
  (`@dnd-kit/{core,sortable,utilities}`) wiring + sensors +
  drag-start/over/end handlers + `DragGhost` + `SortableWidgetCell`,
  the `WidgetResizeHandle` import + cell wrapper, the in-cell
  `CellEditActions`/`DragHandle`/`RemoveButton` chrome, and the
  edit-mode dashed-outline cell styling. `WidgetGridProps` is now just
  `{ widgets, rowHeight?, gap? }` — `editMode`/`onReorder`/`onResize`
  gone. Kept: the `useElementSize`/`collapseLayout`/`layoutBounds`
  flow, the `WidgetFrame` chrome, `MemoWidgetRender` + its
  `__MemoWidgetRender` test-export + `EMPTY_CUSTOMIZATION`. HubCanvas
  trimmed: dropped `handleReorder`/`handleResize`, the `compactLayout`
  + `GridSize` imports, the `setDraftWidgets` destructure, and the
  edit-prop wiring on `<WidgetGrid widgets={displayWidgets} />`.
  Deleted: `lib/hub/components/WidgetResizeHandle.tsx` (186 lines) +
  three orphan specs (`widget-grid-drag`,
  `widget-grid-edit-affordances`, `widget-resize-handle`). New spec
  `widget-grid-readonly.test.ts` (20 cases) locks the absent imports
  + slim props + missing affordance components + the HubCanvas trim.
  Live click-delegation handler that opened `SettingsPanel` is kept
  for now — the modal covers the grid in edit mode so it's not
  reachable; `SettingsPanel` itself is sequenced for deletion in
  Slice 4 after HB5 re-hosts per-widget options. 1126 hub specs green
  (down 18 from the 4-file delete + the 20 added back). Typecheck +
  lint clean. The path forward: every authoring interaction (drag,
  resize, options, save) now flows through the modal alone.

#### Slice 4 — Remove the SettingsPanel side rail (after options are re-hosted)
- **Scope:** *Sequenced after HB5 lands per-widget options in the
  modal.* Delete `SettingsPanel.tsx`, `SettingsTabs.tsx`,
  `SettingsPanelMobile.tsx`, `settings/{LayoutTab,StyleTab,ContentTab,
  InteractionTab}.tsx` + `settings/components/*` that only served the
  rail, plus `settings-{panel-transition,tabs,components}.test.tsx`.
  Remove `openSettings/closeSettings/settingsId` usage from
  `HubCanvas` if fully unused. (Listed here for plan completeness;
  **execute last** in HB5/HB6.)
- **Files:** the above.
- **Done when:** No side-rail code remains; tree green; no dead imports.

### Phase HB3 — Slim the widget styling model

#### Slice 5 — Add `style.headerColor`; title always visible; tolerate old data
- **Scope:** Add `headerColor?: string` to
  `WidgetCustomization.style`. Update `WidgetFrame` to always render
  the header + title (using `titleOverride` or the definition label)
  and to paint the header background from `headerColor` (default to a
  theme value). Make the customization loader **ignore** the removed
  style fields so old layouts still open.
- **Files:** `lib/hub/types.ts`, `lib/hub/components/WidgetFrame.tsx`,
  the load/normalize path (`hub-store.ts` or a normalizer),
  `__tests__/hub/widget-header-color.test.ts` (new).
- **Done when:** Header+title always show; `headerColor` paints the
  header; old customizations load without error. Spec locks the field
  + always-on header + the tolerant load.

#### Slice 6 — Retire the removed style options from reads + catalog
- **Scope:** Remove reads of `colorMode/statusTint/customBg/customFg/
  borderRadius/shadowDepth` from `WidgetFrame`/render. Keep the type
  fields optional-for-back-compat OR drop them (decide in-slice; if
  dropped, the loader strips them). Trim/retire
  `widget-color-modes.ts` usage + `widget-color-modes.test.ts` to
  match. (`StyleTab.tsx` itself goes with Slice 4.)
- **Files:** `lib/hub/components/WidgetFrame.tsx`,
  `lib/hub/widget-color-modes.ts`, affected specs.
- **Done when:** Widgets render with only header color + title styling;
  no references to the removed style options remain in the render path.

### Phase HB4 — In-modal authoring: resize + move with live reflow + slot-on-drop

#### Slice 7 — Reconcile the modal grid coordinate space with the saved 12-col model
- **Scope:** Decide + implement one shared grid model so the modal's
  painted `x/y/w/h` mean the same as the hub render. Likely: modal
  edits in the 12-col space (or a documented mapping). Add a pure
  helper module so the math is testable.
- **Files:** `lib/hub/components/GridEditor.tsx`, new
  `lib/hub/grid-model.ts` (pure), `__tests__/hub/grid-model.test.ts`.
- **Done when:** A widget placed in the modal lands in the same cells
  on the hub. Pure helper unit-tested.

#### Slice 8 — Pure reflow/packing module
- **Scope:** Extend the existing grid math (`lib/hub/grid-math.ts`
  already exports `compactLayout`; `lib/hub/grid-resize.ts`,
  `lib/hub/grid-8x8.ts`, `lib/hub/validate-layout.ts` also exist —
  reuse, don't duplicate). Add `lib/hub/grid-reflow.ts` pure helpers
  for the *move* interaction specifically: given the current layout, a
  moving widget's hovered cell + its `w×h`, compute a layout where the
  others **shift to make room** (push-down/aside, no overlap, stay
  within column count); a `nearestAvailable()` that snaps a drop to the
  closest free cells; then finish with the existing `compactLayout` to
  remove avoidable gaps. Deterministic, fully unit-tested.
- **Files:** `lib/hub/grid-reflow.ts` (new) building on
  `lib/hub/grid-math.ts`, `__tests__/hub/grid-reflow.test.ts`.
- **Done when:** Helpers return overlap-free, in-bounds layouts with
  stable ordering; spec covers push, compact, and nearest-slot at fixed
  fixtures.

#### Slice 9 — Wire full-widget move + live reflow into the modal
- **Scope:** Add a pointer-based move (grab header / move handle) to
  `GridEditor`; on each move, drive the preview from `grid-reflow` so
  the board reorganizes live; keep the existing corner-resize.
- **Files:** `lib/hub/components/GridEditor.tsx`,
  `__tests__/hub/grid-editor-move.test.tsx` (new, source regex on the
  pointer pipeline + reflow wiring).
- **Done when:** Dragging a widget in the modal visibly shifts the
  others in real time; resize still works.

#### Slice 10 — Slot-on-drop commit + compact + cancel
- **Scope:** On pointer-up, commit the reflowed+compacted layout via
  `setDraftWidgets`; the dragged widget lands in the nearest available
  cells. Esc / drop-outside restores the pre-drag layout. Mark dirty.
- **Files:** `lib/hub/components/GridEditor.tsx`, `grid-reflow.ts`,
  `__tests__/hub/grid-editor-drop-commit.test.tsx` (new).
- **Done when:** Release slots cleanly with neighbors reflowed +
  compacted; cancel restores. Spec locks the commit/compact/cancel.

### Phase HB5 — Per-widget options in the modal

#### Slice 11 — Options button on each painted widget → per-widget editor surface
- **Scope:** Each widget in the modal gets an **Options** button
  opening a per-widget editor (popover or in-modal pane) showing:
  **Size** (w/h steppers clamped to the definition envelope),
  **Header color** (picker → `style.headerColor`), **Title** (text →
  `layout.titleOverride`), and a slot that hosts the widget's own
  `SettingsForm` (writes `customization.content`). Edits go through
  `patchWidgetCustomization`/`setDraftWidgets`.
- **Files:** `lib/hub/components/GridEditor.tsx` (+ a new
  `WidgetOptionsPanel.tsx`), `__tests__/hub/widget-options-panel.test.tsx`.
- **Done when:** Clicking Options on any widget shows Size + Header
  color + Title + (if defined) its content form; edits update the
  draft live. Spec locks the four sections + the commit path.

#### Slice 12 — Per-widget options schema registry (cover all 40 types)
- **Scope:** New `lib/hub/widget-options.ts`: a registry mapping each
  widget `type` → its editable content options (key, label, control
  kind [text/number/select/toggle/color/multiselect], default,
  size-aware hints). Reuse existing `SettingsForm`/`defaultContent`
  where present; define sensible options for the ~28 without one.
  Layout primitives (e.g. dividers/headings if any) get minimal sets.
- **Files:** `lib/hub/widget-options.ts`,
  `__tests__/hub/widget-options-schema.test.ts`.
- **Done when:** Every one of the 40 types has a schema (or an explicit
  "no extra options" entry) with defaults; spec asserts full coverage.

#### Slice 13–15 — Render each widget from its options (grouped by family)
- **Scope:** Make each widget body honor `customization.content`
  (e.g. weather location/units; my-pay stats/privacy/amount style;
  today-schedule source/range; bookmarks/pinned-pages/quick-actions
  items; monthly-revenue metric; counts/`see-all` toggles; etc.). Ship
  one commit per widget family to keep each green:
  - **13** pay/jobs/schedule/hours/pto family,
  - **14** lists/links/messages/announcements/activity family,
  - **15** field/equipment/research/learning/finance/utility family.
- **Files:** the per-widget `index.tsx` files,
  `__tests__/hub/widget-config-render-*.test.ts` (per family).
- **Done when:** Each widget visibly reflects its options; specs lock
  each family's config→render wiring.

### Phase HB6 — Responsive render, Save round-trip, QA

#### Slice 16 — Size-responsive widget bodies
- **Scope:** Each widget adapts content to its `w×h` — compact at small
  sizes (e.g. 1×1/2×1), expanded at larger (more rows/labels/detail),
  no clipping/overflow at any supported size. **`lib/hub/size-bucket.ts`
  already exists** (the `size-bucket.test.ts` + the
  `widgets-responsive-210..217.test.ts` suite drove a prior responsive
  pass) — reuse its size-tier helper and the `useElementSize` hook
  (`use-element-size.test.ts`) rather than adding a parallel one. This
  slice audits which widgets still clip/overflow at small/large sizes
  after the slim-styling + options changes and fixes them.
- **Files:** existing `lib/hub/size-bucket.ts` (extend if needed) +
  per-widget bodies, `__tests__/hub/widget-responsive.test.ts` (new,
  alongside the existing responsive specs).
- **Done when:** Widgets look intentional at small/medium/large; spec
  locks the tier helper + a sample of widget branching.

#### Slice 17 — Save → hub render round-trip (+ remove SettingsPanel, Slice 4)
- **Scope:** Confirm Save persists the slim model (size, headerColor,
  titleOverride, content) and the read-only hub renders every widget at
  its size with header+title+headerColor+options applied. Execute the
  **Slice 4** SettingsPanel removal now that options live in the modal.
  End-to-end: pick → drop → resize → move → options → save → reload →
  identical render.
- **Files:** `lib/hub/hub-store.ts`/normalizer, deletions from Slice 4,
  `__tests__/hub/hub-render-roundtrip.test.ts`.
- **Done when:** A dashboard saved in the modal renders identically on
  reload; no SettingsPanel code remains; tree green.

#### Slice 18 — QA sweep + e2e + move doc to completed
- **Scope:** Full typecheck + lint + the hub unit suite green. Rewrite
  `e2e/hub-customize.spec.ts` (and check `hub-editor-perf.spec.ts`) for
  the modal flow. Manual checklist: button animation, drag-reflow feel,
  options per widget, responsive sizes. Then `git mv` this doc to
  `docs/planning/completed/`.
- **Done when:** All checks green; e2e updated; doc moved to completed.

---

## TL;DR

- **HB1** restyles the Work Mode button (white text/solid border +
  spinning red·white·blue hover border, reduced-motion safe).
- **HB2** collapses the two editors to the single centered modal and
  removes the in-canvas + side-rail editing surface.
- **HB3** slims the widget model to **size + header color +
  always-visible title** and tolerates old saved layouts.
- **HB4** reconciles the grid model and adds true drag-to-move with a
  pure, unit-tested reflow/packing engine (`lib/hub/grid-reflow.ts`):
  live shift while dragging + slot-into-nearest on drop.
- **HB5** builds per-widget options inside the modal (Options button →
  Size/Header/Title + the widget's own content form) with a schema
  registry covering all 40 widget types, and wires each widget's render
  to its options.
- **HB6** makes widgets render responsively per `w×h`, proves Save →
  hub round-trips, removes the last of the side panel, runs QA + e2e,
  and moves this doc to completed.
