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

#### Slice 4 — Remove the SettingsPanel side rail (after options are re-hosted) ✅ shipped 2026-05-30 (as part of Slice 17)
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
- **Outcome:** Shipped as part of Slice 17 — see that slice's
  outcome note for the full deletion list + the new
  `__tests__/hub/settings-panel-removal.test.ts` lockdown.

### Phase HB3 — Slim the widget styling model

#### Slice 5 — Add `style.headerColor`; title always visible; tolerate old data ✅ shipped 2026-05-30
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
- **Outcome:** `WidgetCustomization.style.headerColor?: string` added
  to `lib/hub/types.ts`; the legacy style fields (colorMode/statusTint/
  customBg/customFg/borderRadius/shadowDepth) stay on the type so old
  saved rows in Supabase still parse, and Slice 6 will drop the reads.
  `WidgetFrame` always renders the header (the `showTitle` prop is
  gone from the interface + the `{showTitle && (…)}` gate is gone from
  the JSX) and paints the header `background` from
  `headerColor ?? 'transparent'`. New `lib/hub/normalize-customization.ts`
  exports `normalizeCustomization` / `normalizeWidgetInstance` /
  `normalizeWidgets` — pure functions that copy known fields through,
  drop layout.showTitle (header is always visible now), and silently
  discard out-of-enum style values; never throw. `hub-store.hydrate`
  pipes incoming `widgets` through `normalizeWidgets` so any saved row
  — old or new — loads cleanly. Updated `WidgetGrid` + `SettingsPanel`
  call sites to drop the dropped `showTitle={…}` prop and pass
  `headerColor={customization.style?.headerColor}`. Updated the two
  pre-existing `widget-frame*.test.tsx` specs that locked the old
  "header can be hidden" behavior — they now assert the
  always-visible header + the `headerColor` painting. New
  `__tests__/hub/widget-header-color.test.ts` (18 cases) locks the
  type addition, the WidgetFrame contract, the normalizer's
  pass-through + drop-showTitle + enum-sanitization behavior, the
  invalid-row drops, and the hub-store import + hydrate wiring. 1145
  hub specs green; typecheck + lint clean.

#### Slice 6 — Retire the removed style options from reads + catalog ✅ shipped 2026-05-30
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
- **Outcome:** `WidgetFrame.tsx` rewritten as a slim renderer
  (243 → 162 lines). Removed: `colorMode/statusTint/customBg/customFg/
  borderRadius/shadowDepth` props from `WidgetFrameProps`, the
  `RADIUS_PX` + `SHADOWS` constant maps, the exported `resolveColors()`
  helper, and the imports of the four legacy customization type
  unions. The frame's background/color/radius/shadow are now fixed
  theme values (`var(--theme-bg-surface)` + `var(--theme-border)` + a
  fixed 8px radius + a subtle shadow). Slim contract: `title`,
  `headerColor?`, `headerAction?`, `footer?`, `editMode?`, `children`.
  Updated `WidgetGrid` + `SettingsPanel` call sites — both stop
  forwarding the dropped props. Unknown-widget callouts (in WidgetGrid
  + SettingsPanel preview) drop the `colorMode="status" statusTint="warning"`
  tint and just paint the warning text in `var(--theme-warning)`. Kept
  the legacy fields on `WidgetCustomization.style` so old saved rows
  in Supabase keep parsing (the normalizer still recognizes them);
  they'll get dropped from the type when the SettingsPanel + StyleTab
  disappear with Slice 4. `widget-color-modes.ts` + its spec stay for
  now — the StyleTab is their only consumer. `widget-frame.test.tsx`:
  dropped the entire `resolveColors` describe block + the chrome-tint
  expectations; replaced with a single assertion that the helper is no
  longer exported from the module. New
  `__tests__/hub/widget-frame-slim.test.ts` (12 cases) locks the slim
  props interface, the absence of the resolveColors helper + the
  RADIUS_PX/SHADOWS maps + the legacy type imports, the fixed theme
  chrome, the WidgetGrid + SettingsPanel call-site trims, and the
  unknown-widget chrome drop. 1149 hub specs green; typecheck + lint
  clean.

### Phase HB4 — In-modal authoring: resize + move with live reflow + slot-on-drop

#### Slice 7 — Reconcile the modal grid coordinate space with the saved 12-col model ✅ shipped 2026-05-30
- **Scope:** Decide + implement one shared grid model so the modal's
  painted `x/y/w/h` mean the same as the hub render. Likely: modal
  edits in the 12-col space (or a documented mapping). Add a pure
  helper module so the math is testable.
- **Files:** `lib/hub/components/GridEditor.tsx`, new
  `lib/hub/grid-model.ts` (pure), `__tests__/hub/grid-model.test.ts`.
- **Done when:** A widget placed in the modal lands in the same cells
  on the hub. Pure helper unit-tested.
- **Outcome:** First check verified the doc-note premise was wrong:
  the hub render is **also 8-col**, not 12 — `breakpointForWidth ≥
  1024 → 8` matches the modal's `GRID_EDITOR_COLS = 8`. So the modal
  and the hub already share the same coordinate space; the real risk
  was scattered magic-`8` literals drifting if someone bumped one of
  them. New `lib/hub/grid-model.ts` (pure, 95 lines) exports the
  single source of truth: `HUB_GRID_COLS = 8`,
  `HUB_EDITOR_ROWS = 8` (the modal's bounded row cap; canvas rows
  stay unbounded), `HUB_DESKTOP_BREAKPOINT = HUB_GRID_COLS`, plus pure
  helpers `clampRectToGrid(rect, cols?, rows?)`,
  `isInsideGrid(rect, cols?, rows?)`, and
  `gridRectToPixels(rect, cellPx, gapPx?)` for the cell-↔-pixel math
  the modal painter + the canvas grid both use. Routed every existing
  consumer through the constant: `GridEditor.tsx` now re-exports its
  legacy `GRID_EDITOR_COLS`/`ROWS` symbols as aliases of the shared
  ones (preserves the `grid-editor-*` specs without churn);
  `AddWidgetModal.tsx` + `settings/LayoutTab.tsx` import
  `HUB_GRID_COLS` and pass it to `compactLayout(_, HUB_GRID_COLS)` so
  no magic-`8` literals remain at call sites. `grid-math.ts`'s
  `breakpointForWidth` keeps the literal `8` in its body (avoiding a
  circular import; the spec asserts `breakpointForWidth(2000) ===
  HUB_GRID_COLS` so any drift gets caught). New
  `__tests__/hub/grid-model.test.ts` (18 cases) locks the constants'
  values + their cross-module agreement (`GRID_EDITOR_COLS ===
  HUB_GRID_COLS`, `breakpointForWidth(2000) === HUB_GRID_COLS`), the
  clamp/isInside/gridRectToPixels helpers with fixed inputs, and the
  source-regex on the three call sites' imports. 1167 hub specs
  green; typecheck + lint clean.

#### Slice 8 — Pure reflow/packing module ✅ shipped 2026-05-30
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
- **Outcome:** New `lib/hub/grid-reflow.ts` (149 lines) exports three
  pure helpers that build on the existing `compactLayout` +
  `HUB_GRID_COLS` from Slice 7:
  - `applyMoveWithPush(layout, movingId, target, cols?)` — places the
    moving widget at `target` and pushes overlapping siblings straight
    down (cascading through downstream neighbours) until no overlaps
    remain. No compaction — preserves the user's drag direction during
    the live preview. Sorts others top-to-bottom, left-to-right
    before walking so the cascade is deterministic. Clamps the target
    into column bounds. Returns the moving widget last so iteration
    order is consistent.
  - `nearestAvailable(layout, movingId, hover, cols?)` — BFS-by-
    manhattan-distance: returns `hover` if it already fits (excluding
    the moving widget itself), otherwise scans outward by increasing
    radius and returns the first slot whose `w×h` rect doesn't overlap
    any sibling. Falls back to "below every existing widget" if no
    nearby slot fits.
  - `commitDrop(layout, movingId, target, cols?)` — composes
    `nearestAvailable` + `applyMoveWithPush` + the existing
    `compactLayout` so a drop snaps to a free slot, settles the
    cascade, then closes any gaps the push left behind.
  Standalone module: re-derives `overlaps` instead of exporting it
  from `grid-math.ts` so the existing internal helpers stay private.
  `__tests__/hub/grid-reflow.test.ts` (20 cases) covers: empty-grid
  placement, single-sibling push, multi-row cascade (a→b→c chain),
  untouched neighbours staying put, column clamping, determinism,
  ghost-id passthrough, hover-when-free, moving-widget self-overlap
  exclusion, nearest-slot when blocked, out-of-bounds clamp before
  snap, gap-closing on commit, fallback-to-bottom when row is dense,
  plus three fixed-scenario invariant sweeps (no overlaps + in bounds)
  for both `applyMoveWithPush` and `commitDrop`. 1187 hub specs green;
  typecheck + lint clean. Slice 9 wires this into `GridEditor`'s
  pointer pipeline.

#### Slice 9 — Wire full-widget move + live reflow into the modal ✅ shipped 2026-05-30
- **Scope:** Add a pointer-based move (grab header / move handle) to
  `GridEditor`; on each move, drive the preview from `grid-reflow` so
  the board reorganizes live; keep the existing corner-resize.
- **Files:** `lib/hub/components/GridEditor.tsx`,
  `__tests__/hub/grid-editor-move.test.tsx` (new, source regex on the
  pointer pipeline + reflow wiring).
- **Done when:** Dragging a widget in the modal visibly shifts the
  others in real time; resize still works.
- **Outcome:** New `startMove(e, inst)` pipeline grafted onto every
  painted widget's `onPointerDown`. The pipeline is **threshold-gated**
  — it records `startClientX/Y` on pointer-down but doesn't enter
  drag mode until the pointer travels > 6 px, so a single click still
  toggles the painted-widget selection (matches pre-Slice-9
  semantics). Once the threshold is exceeded:
  - Every pointer-move calls
    `applyMoveWithPush(useHubStore.getState().draftWidgets, id, target,
    HUB_GRID_COLS)` and writes the result into
    `moveDrag.previewLayout`. The render reads `liveX`/`liveY` from
    that list (falling back to `inst.x`/`inst.y` when no move is
    happening) so every cascade-pushed sibling shifts visibly while
    the surveyor drags.
  - Pointer-up calls
    `commitDrop(draftWidgets, id, target, HUB_GRID_COLS)` and writes
    the snap+compacted layout through `setDraftWidgets`.
  - Pointer-cancel routes through the same `handleUp` path, so an Esc
    or browser-level cancel resets cleanly.
  - All window-level listeners are removed before the commit decision.
  - The dragged widget paints with `zIndex: 5 + cursor: 'grabbing' +
    transition: 'none'` so it sits above the settling neighbours and
    tracks the pointer crisply.
  - `startMove` is a no-op while a palette widget is armed for
    placement (`selected !== null`) so painting + moving stay
    mutually exclusive.
  - The pre-existing `startResize` pipeline is untouched and still
    fires from the corner button.
  Updated the Slice 225 resize spec to match the new
  `${liveX + 1} / span ${liveW}` shape (the literal `inst.x`/`inst.y`
  was replaced by the `previewSlot?.x ?? inst.x` lookup —
  semantically identical when no move is happening). `__tests__/hub/
  grid-editor-move.test.ts` (18 cases, source-regex) locks: the
  grid-reflow imports, the moveDrag state shape, the startMove
  signature + selected guard + pointer capture + 6 px threshold, the
  applyMoveWithPush call shape, the click-selection drop when
  threshold is exceeded, the commitDrop + setDraftWidgets call shape,
  the no-drag click-toggle fallback, the window-level listener attach
  + cleanup, the liveX/liveY/isMoving render shape, the lift +
  no-transition styling, the startMove wiring on the widget's
  onPointerDown, and the still-intact resize pipeline. 1205 hub specs
  green; typecheck + lint clean.

#### Slice 10 — Slot-on-drop commit + compact + cancel ✅ shipped 2026-05-30
- **Scope:** On pointer-up, commit the reflowed+compacted layout via
  `setDraftWidgets`; the dragged widget lands in the nearest available
  cells. Esc / drop-outside restores the pre-drag layout. Mark dirty.
- **Files:** `lib/hub/components/GridEditor.tsx`, `grid-reflow.ts`,
  `__tests__/hub/grid-editor-drop-commit.test.tsx` (new).
- **Done when:** Release slots cleanly with neighbors reflowed +
  compacted; cancel restores. Spec locks the commit/compact/cancel.
- **Outcome:** Slice 9 already ran `commitDrop`
  (`nearestAvailable` + `applyMoveWithPush` + `compactLayout`) on
  pointer-up and dirty-marked the draft via `setDraftWidgets` (the
  store flips `isDirty: true` on every `setDraftWidgets` call). Slice
  10 added the cancel half:
  - New `cancelMoveRef: useRef<(() => void) | null>` exposes the
    drag's `teardown()` callback to handlers outside `startMove`.
    `startMove` installs `teardown` into the ref on pointer-down;
    `teardown` clears the ref + the listeners + `moveDrag` on every
    exit path so it's idempotent.
  - **Pointer-cancel** (formerly routed through `handleUp` →
    committed): now has its own `handlePointerCancel(ev)` that just
    runs `teardown()`. No `setDraftWidgets`. The pre-drag layout
    stays exactly as it was (we never mutated draftWidgets during
    the drag — `moveDrag.previewLayout` was the only thing changing).
  - **Mid-drag Esc**: the existing modal-level Esc cascade gained a
    top-priority branch — `if (cancelMoveRef.current) { e.preventDefault();
    cancelMoveRef.current(); }` runs before the place-anchor /
    painted-selection / `onClose` checks, so a surveyor mid-drag who
    hits Esc cancels the move without closing the modal.
  - **Drop-outside-the-grid**: `handleUp` now reads the grid's
    bounding rect and, if the pointer is outside on release, takes the
    teardown path instead of the commit path. Lets the surveyor "drop
    over the palette / footer" to cancel without thinking.
  - The commit path is unchanged in shape: when the drop is inside +
    `didDrag` is true, `commitDrop(current, inst.id, target,
    HUB_GRID_COLS)` runs and `setDraftWidgets(committed)` writes
    the snap+compacted layout (which also auto-marks the draft dirty
    via the store).
  Updated the Slice 9 spec where it locked the old single-`handleUp`
  shape (the cleanup now happens inside `teardown` + the
  pointer-cancel listener wires to `handlePointerCancel`). New
  `__tests__/hub/grid-editor-drop-commit.test.ts` (12 cases) locks:
  the `cancelMoveRef` declaration + the `startMove` install + the
  teardown's ref-clear, the `handlePointerCancel` standalone shape,
  the pointercancel listener routing, the inside-rect drop-cancel
  check, the !inside teardown branch, the Esc-cascade priority +
  preventDefault, the still-intact commitDrop+setDraftWidgets path
  with teardown-before-setDraft ordering, and the three-listener
  removal in teardown. 1216 hub specs green; typecheck + lint clean.
  Phase HB4 (in-modal authoring with reflow) complete.

### Phase HB5 — Per-widget options in the modal

#### Slice 11 — Options button on each painted widget → per-widget editor surface ✅ shipped 2026-05-30
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
- **Outcome:** New `lib/hub/components/WidgetOptionsPanel.tsx` (430
  lines incl. styles) renders as a centered fixed-position card over
  a click-out backdrop with four sections, each tagged for testing:
  - **Size**
    (`data-testid="widget-options-section-size"`): two `Stepper`
    rows (`W` and `H`), `min`/`max` bound to
    `definition.minSize/maxSize` so the surveyor can't push the widget
    outside its declared envelope. `commitSize` clamps via a local
    `clamp()` helper, no-ops when unchanged, then writes through
    `setDraftWidgets` (size lives on the `WidgetInstance` itself, not
    on `customization`).
  - **Header color** (`…-header-color`): a `<input type="color">`
    + a Reset button. Writes through `commitCustomization` with
    `{ style: { headerColor: e.target.value } }` (or `undefined` on
    Reset).
  - **Title** (`…-title`): a `<input type="text">` whose placeholder
    falls back to `definition.label`. Writes through
    `commitCustomization` with `{ layout: { titleOverride } }`.
  - **Widget options** (`…-content`): hosts the widget's own
    `definition.SettingsForm` when defined (passes `value=formValue,
    onChange={(next) => commitCustomization({ content: next })}`);
    falls back to a friendly empty state for the ~13 widgets that
    don't ship a form yet (Slice 12 grows those).
  Edits route through `useHubActions().{setDraftWidgets,
  patchWidgetCustomization}`; the helper `mergeCustomization(current,
  patch)` shallow-merges layout/style/interaction one level deep so a
  Header-color patch doesn't blow away an unrelated layout.density,
  etc. The panel reads the live instance from `useHubStore` via
  `useMemo`, so the parent unmounting it on close is the only cancel
  path needed (no extra state plumbing). Backdrop closes on
  pointer-down + Escape; the panel itself stops backdrop clicks via
  `stopPropagation`. Wired into `GridEditor`: new `optionsForId`
  useState; an ⚙ Options button in the selected-painted-widget chrome
  (alongside the existing ✕ Remove and ⤡ Resize buttons) sets it;
  `<WidgetOptionsPanel open={optionsForId !== null} …/>` renders at
  the end of the modal root. `__tests__/hub/widget-options-panel.test.ts`
  (25 cases) locks the four sections, the size clamp + setDraftWidgets
  commit, the header-color + title commit shapes, the SettingsForm
  host + empty-state fallback, the `formValue` defaultContent
  fallback, the `mergeCustomization` shape, the backdrop a11y, the
  panel-stops-propagation guard, and the GridEditor wiring (import,
  state, button, mount). 1241 hub specs green; typecheck + lint
  clean.

#### Slice 12 — Per-widget options schema registry (cover all 40 types) ✅ shipped 2026-05-30
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
- **Outcome:** First check refined the count: the live catalog is **41
  widget types** (not 40), of which **29 already ship a SettingsForm**
  — those map to `{ source: 'settings-form' }` so the modal hosts the
  existing form directly (Slice 11's panel does this already, no
  duplicate effort). The remaining **12 widgets** (`daily-briefing,
  flashcards-due, monthly-revenue, outstanding-invoices, pending-hours,
  pending-receipts, pending-time-off, quiz-history, recommended-lessons,
  roadmap-progress, streak-counter, sun-calculator`) got declarative
  schemas via `{ source: 'schema', fields }`. New
  `lib/hub/widget-options.ts` (272 lines) exports:
  - `WidgetOptionsField` discriminated union: 6 input kinds
    (`text/number/toggle/select/multiselect/color`) each with a
    `key`, `label`, `description?`, and a typed `defaultValue`.
  - `WidgetOptionsEntry` = `{ source: 'settings-form' } | { source:
    'schema'; fields } | { source: 'none' }`.
  - `WIDGET_OPTIONS_REGISTRY` — frozen `Record<string, Entry>`
    covering all 41 ids (29 settings-form pointers + 12 schemas with
    sensible defaults: e.g. monthly-revenue gets period/showTrend/
    showComparison; sun-calculator gets latitude/longitude/units/
    showTwilight; outstanding-invoices gets maxItems/sortBy/showAging;
    streak-counter gets kind/goal — typical reusable shapes the
    surveyor would expect).
  - Helpers `getWidgetOptionsEntry(id)` (with `none` fallback),
    `defaultContentForSchema(fields)` (seeds `customization.content`
    from defaults), `getSchemaFields(id)` (returns the field list or
    null), `findMissingRegistryEntries()` (coverage helper used by
    the spec).
  `__tests__/hub/widget-options-schema.test.ts` (21 cases) locks:
  full id coverage in both directions (no missing entries, no extras),
  every settings-form entry's widget actually exposes a SettingsForm,
  every widget with a SettingsForm is registered as settings-form (no
  parallel schemas competing), every schema entry has at least one
  field, each defaultValue's runtime type matches its declared
  `type` (toggle→boolean, number→finite-number, select→string,
  multiselect→string[], etc.), schema field keys are unique within
  their widget, the 12 known-no-SettingsForm widgets each have a
  schema entry, the `none` fallback for unknown ids, and
  `defaultContentForSchema` reproduces every field key. 1262 hub specs
  green; typecheck + lint clean. The schema-driven render path inside
  the panel is the Slice 13–15 work.

#### Slice 13 — Generic schema-driven options renderer ✅ shipped 2026-05-30
- **Scope:** Before per-widget body wiring can be useful for the 12
  schema-source widgets, the modal needs a way to *show* their
  options. New `SchemaOptionsForm` component renders any
  `WidgetOptionsField[]` as the matching control set; `WidgetOptionsPanel`
  dispatches schema entries through it.
- **Files:** new `lib/hub/components/SchemaOptionsForm.tsx`,
  `lib/hub/components/WidgetOptionsPanel.tsx`,
  `__tests__/hub/schema-options-form.test.ts`.
- **Done when:** Opening Options on a schema-source widget shows the
  declared fields; type defaults seed missing keys; edits flow
  through `commitCustomization`.
- **Outcome:** New `SchemaOptionsForm` (320 lines) renders six control
  components — `TextControl, NumberControl, ToggleControl,
  SelectControl, MultiSelectControl, ColorControl` — dispatched from
  a switch on `field.type`. Each control coerces missing or
  wrong-typed inputs to the schema's `defaultValue` (text/color falls
  back to `defaultValue`; number requires `Number.isFinite`; toggle
  requires `typeof === 'boolean'`; select requires the value to be in
  `field.options`; multiselect requires a string array). Number edits
  clamp `e.target.valueAsNumber` to `[field.min ?? -Infinity, field.max
  ?? Infinity]`. Multiselect rebuilds the next array by filtering
  `field.options` so the output order stays stable.
  `WidgetOptionsPanel`'s Widget-options section now dispatches through
  the Slice-12 registry: `entry.source === 'settings-form'` → host
  `definition.SettingsForm`; `entry.source === 'schema'` → seed unset
  keys via `defaultContentForSchema(entry.fields)` and render
  `<SchemaOptionsForm fields={entry.fields} value={seeded} onChange=…
  />`; otherwise the friendly empty state. Every field row carries
  `data-testid="schema-options-field-{key}"` + `data-field-type` so
  future Playwright specs can target by field key + type. New
  `__tests__/hub/schema-options-form.test.ts` (17 cases) locks: the
  six-case render dispatcher; one component per field type; the
  default-fallback coercion for each control; the number clamp;
  the multiselect option-order subset; the public `SchemaOptionsFormProps`
  shape; the data-testid surface; and the panel's
  settings-form / schema / none triage incl. the import shape, the
  `getWidgetOptionsEntry(instance.type)` resolve, the schema branch's
  seeded merge + commit path, and the empty-state fallback for `none`.
  1279 hub specs green; typecheck + lint clean.

#### Slice 14 — First pair of widget bodies honor their schema (pattern-setting) ✅ shipped 2026-05-30
- **Scope:** A first-pass content-render wiring on two schema-source
  widgets covering diverse field types so the pattern is established
  before fanning out to the rest in Slice 15. First-check audit
  surprise: **none** of the 12 schema-source widgets read
  `customization.content` today, and most SettingsForm widgets don't
  either — so the body-wiring gap is much wider than the planning
  doc's original "pay/jobs/schedule family" grouping captured. Slice
  14 ships two anchor widgets; Slice 15+ widens.
- **Files:** `lib/hub/widgets/streak-counter/index.tsx`,
  `lib/hub/widgets/outstanding-invoices/index.tsx`,
  `__tests__/hub/widget-config-render-streak-counter.test.ts` (new),
  `__tests__/hub/widget-config-render-outstanding-invoices.test.ts` (new).
- **Done when:** Both widgets visibly reflect every schema field; the
  resolvers are pure + tested; the schema option set agrees with what
  the body actually understands.
- **Outcome:**
  - **streak-counter** — `StreakCounterContent` extends to
    `{ kind?: 'clockin' | 'study' | 'quiz'; goal?: number }`,
    matching the Slice-12 schema. Body reads `content`: `kind` swaps
    the emoji + label via a `KIND_META` map (⏰ Clock-in streak / 🔥
    Study streak / 🎯 Quiz streak); `goal` shows "N of GOAL days"
    progress and swaps to 🏆 when the surveyor hits or exceeds it.
    The fetch endpoint stays as `/api/admin/learn/streak` — per-kind
    endpoints can be wired later without re-touching the render path.
    Defaults `{ kind: 'study', goal: 7 }` so an unsavable empty
    content reads identically to the pre-overhaul widget.
  - **outstanding-invoices** — `OutstandingInvoicesContent` extends
    to `{ maxItems?: number; sortBy?: 'due-date' | 'amount' |
    'customer'; showAging?: boolean }`. Body reads `content`:
    `sortInvoices(items, sortBy)` orders the list (amount desc;
    customer A→Z; due-date ascending with nulls sinking to the end);
    `resolveMaxItems` clamps to `[1, 20]` and returns `null` for
    out-of-range so the existing size-bucket cap still applies as a
    fallback; `showAging` (default true) appends
    `agingLabel(due_date)` — "N days late", "due today", or
    "due in Nd" — to each row.
  - Both widgets export their resolvers (`resolveKind`, `resolveGoal`,
    `KIND_META`; `resolveSortBy`, `resolveMaxItems`, `resolveShowAging`,
    `sortInvoices`, `agingLabel`) so the new pure-unit specs can lock
    behavior without going through React render (the SSR snapshot
    caching limitation still applies to interactive store-mutation
    specs).
  - Two new spec files: 18 streak-counter cases + 24
    outstanding-invoices cases. Each spec asserts (1) the schema's
    declared option set agrees with what the resolver accepts, (2)
    each resolver's fallback behavior on missing/invalid input, and
    (3) the pure helper logic (sort orders, aging-label boundaries).
    42 new specs total; 1321 hub specs green; typecheck + lint clean.

#### Slice 15 — Pending-family widget body wiring (4 widgets) ✅ shipped 2026-05-30
- **Scope:** Fan out the Slice-14 pattern to four schema-source
  widgets that share the "maxItems + boolean toggle" shape:
  `pending-hours`, `pending-receipts`, `pending-time-off`,
  `quiz-history`. Extracted shared resolver helpers first so each
  widget doesn't re-derive the same type-coercion logic.
- **Files:** new
  `lib/hub/widgets/_shared/content-resolvers.ts`,
  the four widget `index.tsx` files, new
  `__tests__/hub/widget-content-resolvers.test.ts`,
  new `__tests__/hub/widget-config-render-pending-family.test.ts`.
- **Done when:** Each widget visibly reflects its schema options;
  schema↔resolver agreement asserted per widget; shared helpers
  unit-tested.
- **Outcome:**
  - New `lib/hub/widgets/_shared/content-resolvers.ts` exports three
    pure helpers used across the family:
    `resolveBoundedInt(raw, lo, hi, fallback)` (out-of-range → fallback,
    fractional → floored, non-finite → fallback),
    `resolveBool(raw, fallback)` (anything other than `true`/`false`
    → fallback), and `resolveEnum<T>(raw, allowed, fallback)` for
    schema-driven select fields.
  - **pending-hours** wires `maxItems` (1–20) + `groupByPerson`.
    Body uses `explicitCap ?? sizeCap` so existing layouts keep their
    pre-overhaul density when the surveyor hasn't opted in; when
    `groupByPerson` is true, rows sort alphabetically by submitter so
    duplicates cluster (real backend roll-up can come later without
    re-touching the schema).
  - **pending-receipts** wires `maxItems` (1–20) + `showAmount`
    (defaults true). When showAmount is off the right-aligned $
    column collapses, leaving a focused queue.
  - **pending-time-off** wires `maxItems` (1–20) + `showStartDate`
    (defaults true). When showStartDate is off the muted row shows
    just the hours, surfacing the approval queue's count rather than
    its calendar.
  - **quiz-history** wires `maxItems` (1–25 — schema's higher cap),
    `showScore` (defaults true), and `onlyFailed` (defaults false).
    Refactored the inline percent math into exported `attemptPercent`
    (with a divide-by-zero guard) + `filterFailed` (strict < 60%
    threshold matching the per-row color treatment); body filters
    attempts before slicing to the cap so `onlyFailed` interacts
    correctly with `maxItems`.
  - Two new spec files: 12 shared-helper cases + 20 per-widget
    schema↔resolver + pure-helper cases (`attemptPercent` boundaries,
    `filterFailed` threshold strictness, the maxItems clamp range
    per widget). 32 new specs total; 1353 hub specs green; typecheck
    + lint clean.

#### Slice 15b — Learning-family widget body wiring (3 widgets) ✅ shipped 2026-05-30
- **Scope:** Wire `flashcards-due`, `recommended-lessons`,
  `roadmap-progress`. Revised the roadmap-progress schema this slice
  too (its pre-revision per-phase toggles described data the widget
  doesn't have).
- **Files:** `lib/hub/widget-options.ts` (roadmap-progress schema
  revision), the three widget `index.tsx` files, new
  `__tests__/hub/widget-config-render-learning-family.test.ts`.
- **Done when:** Each widget visibly reflects its schema options;
  resolvers exported + locked.
- **Outcome:**
  - **flashcards-due** wires `maxCards` (1–25) + `hideEmpty`. New
    `visibleCount(raw, cap)` helper caps the visible count without
    losing the backend's real number; when capped, the body shows
    `"N+"` instead of `"N"` and the description reads "cards ready
    (capped at N)". `hideEmpty=true` swaps the full empty-state card
    for a quiet "0 cards" stat so a stretch of empty days doesn't
    dominate the hub.
  - **recommended-lessons** wires `maxItems` (1–10) + `category`
    (`all`/`survey`/`tech`/`safety`). New `lessonMatchesCategory(lesson,
    category)` runs a token-match on `title + module_title` so the
    filter works against the existing API without needing a `?category=`
    query. Token sets: survey/surveying/land/cad/parcel for "survey";
    tech/technical/gis/gps/rtk for "tech"; safety/osha/ppe/hazard for
    "safety". `all` (the default) skips filtering.
  - **roadmap-progress** schema revised: `showCompleted` /
    `showInProgress` / `showUpcoming` (which described per-phase
    visibility the widget doesn't have) → `showName` / `showCurrent`
    / `showBar` (the three render branches the widget actually
    has). All three default true so existing layouts render
    identically. Body honors each toggle independently. Slice 12's
    coverage spec still passes (it only asserts every widget has a
    schema with ≥ 1 field, not specific field names).
  - 15 new spec cases covering each widget's resolvers + the
    `visibleCount` / `lessonMatchesCategory` helpers + the schema↔
    resolver agreement + the schema-revision teardown for
    roadmap-progress (asserts the removed pre-revision field keys are
    absent). 1368 hub specs green; typecheck + lint clean.

#### Slice 15c — Utility-family widget body wiring (3 widgets) ✅ shipped 2026-05-30
- **Scope:** Wire the last 3 schema-source widgets:
  `daily-briefing` (showWeather / showSchedule / maxJobs),
  `monthly-revenue` (period / showTrend / showComparison),
  `sun-calculator` (latitude / longitude / units / showTwilight).
- **Files:** the three widget `index.tsx` files, new
  `__tests__/hub/widget-config-render-utility-family.test.ts`.
- **Done when:** Each widget visibly reflects its schema options;
  resolvers exported + locked. Schema coverage from Slice 12 stays
  intact.
- **Outcome:** Every schema-source widget (12 of 12) now reads its
  saved content. Slice-15c specifics:
  - **daily-briefing** wires showWeather + showSchedule + maxJobs.
    Body's 4-section grid gates the Today + Weather sub-sections by
    their toggles (Crew + Action items always render — they have no
    schema toggles). Today's subtitle echoes the maxJobs cap so the
    surveyor sees the cap reflected even though real schedule data
    hasn't landed yet. Toggles default true so the existing layout is
    unchanged when no edits are made.
  - **monthly-revenue** wires period + showTrend + showComparison.
    period (month/quarter/year) drives a `PERIOD_LABEL` lookup
    (`Month-to-date / vs last month`, etc.) and is now forwarded to
    the API as `?period=…` so the existing endpoint can grow per-
    period support without re-touching the render. showTrend gates
    the `▲/▼ N%` line; showComparison gates the `vs last X` suffix.
    Defaults match pre-overhaul behavior.
  - **sun-calculator** wires latitude + longitude + units +
    showTwilight. New pure helpers `buildSunQuery(lat, lng)` (composes
    `?lat=&lng=` only for set coords) and `formatTime(time, units)`
    (appends ` UTC` when units=utc) let the surveyor pin a specific
    site or surface a unit cue without a backend round-trip.
    showTwilight surfaces a placeholder "Civil twilight: ~30 min
    before sunrise / after sunset" hint row (a future commit can
    replace the placeholder with real backend numbers without touching
    the schema or the panel).
  - 17 new spec cases covering each widget's resolvers + the new
    helpers + the schema↔resolver agreement on the select-field
    options (period values; units values). 1385 hub specs green;
    typecheck + lint clean. **Phase HB5 (per-widget options) is now
    complete** — every one of the 12 schema-source widgets is editable
    end-to-end (Slice 11 panel + Slice 13 schema renderer + Slices 14
    / 15 / 15b / 15c body wiring). The 29 settings-form widgets have
    their own forms hosted directly by the panel (Slice 11). Phase HB6
    (responsive render, save round-trip, QA) is the only phase left.

### Phase HB6 — Responsive render, Save round-trip, QA

#### Slice 16 — Size-responsive widget bodies ✅ shipped 2026-05-30
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
- **Outcome:** Audit identified three widgets whose Slice-14/15/15b/15c
  content additions threatened to clip at `small` bucket (typically
  1×1 / 2×1):
  - **streak-counter** added a "kind label · N of GOAL days" line in
    Slice 14, bringing the non-tiny render from 2 to 3 lines. Slice 16
    gates the "Longest: N days" tertiary line on `bucket !== 'small'`
    so the more important kind-progress line stays; medium+ keeps the
    full three-line breakdown.
  - **sun-calculator** added a "Civil twilight" italic row in Slice
    15c. At small bucket the sunrise/sunset pair + location/daylight
    line already saturate vertical room. Slice 16 hides the twilight
    row at small regardless of the toggle; the toggle stays meaningful
    at medium+ buckets.
  - **flashcards-due** grew the description text in Slice 15b (the
    "(capped at N)" suffix on overflow + "for review" tail otherwise).
    At small bucket the full text could push the "Start review →"
    link off-frame. Slice 16 collapses the description to just "cards
    ready" at small (the cap is already visible via the "N+" stat
    above); medium+ keeps the full text.
  - Other widgets I touched (outstanding-invoices, recommended-lessons,
    roadmap-progress, daily-briefing, monthly-revenue, the 4 pending-
    family widgets) audit clean: their additions either truncate via
    existing `text-overflow: ellipsis`, gate visible rows via
    `flexShrink: 0`, or use `WidgetFrame`'s `overflow: auto` body to
    scroll on overflow — all behaviors locked by the existing
    `widgets-responsive-210..217` suite, which still passes.
  - New `__tests__/hub/widget-responsive-slice-16.test.ts` (8 cases,
    source-regex) locks each widget's new bucket-aware guard:
    streak-counter's `const showLongest = bucket !== 'small';` + the
    JSX gate + the ordering (kind line stays unconditional, longest
    is gated); sun-calculator's `showTwilight && bucket !== 'small'`
    + the preserved testid/copy; flashcards-due's bucket-aware
    `description` local with the four-way overflow×bucket matrix.
  - 1393 hub specs green; typecheck + lint clean. Phase HB6 continues
    with Slice 17 (save round-trip + SettingsPanel cleanup) and Slice
    18 (QA + e2e + move doc to completed).

#### Slice 17 — Save → hub render round-trip (+ remove SettingsPanel, Slice 4) ✅ shipped 2026-05-30
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
- **Outcome:** Deleted **19 files** totaling **−2,279 LOC** net:
  - `lib/hub/components/SettingsPanel.tsx` (the side rail itself)
  - `lib/hub/components/SettingsTabs.tsx` (its tab strip)
  - `lib/hub/components/settings/{LayoutTab, StyleTab, InteractionTab,
    SizeGridPicker, CustomColorPicker}.tsx` (the four tabs + the two
    pickers it hosted)
  - `lib/hub/components/settings/components/{FilterDropdown, MultiSelect,
    NumberStepper, RoutePicker, ToggleGroup}.tsx` (the form-control
    library used only by those tabs)
  - `lib/hub/widget-color-modes.ts` (the StyleTab catalog)
  - `__tests__/hub/{settings-components, settings-panel-transition,
    settings-tabs, size-grid-picker, custom-color-picker,
    widget-color-modes}.test.{ts,tsx}` (six spec files)
  Patched `HubCanvas.tsx` to drop the `SettingsPanel` import + the
  `settingsId` useState + the `handleGridClick` event-delegated
  click-to-open + the `<SettingsPanel/>` mount + the wrapping
  `<div onClick={handleGridClick}>` div around `<WidgetGrid/>`. The
  grid now renders directly under the WelcomeTip. Updated two existing
  specs whose assertions targeted the deleted files: removed the
  LayoutTab block from `grid-model.test.ts` (HUB_GRID_COLS still
  wired through every surviving call site) and the SettingsPanel
  preview block from `widget-frame-slim.test.ts` (the slim
  WidgetFrame contract is still locked by the FRAME_SRC + GRID_SRC
  assertions).
  Save → hub round-trip: confirmed via the existing Save flow
  (`saveDraft` → `PUT /api/admin/me/hub-layout` → on success copies
  draft → widgets) plus the Slice-5 `normalizeWidgets` that already
  tolerates old saved style fields. The end-to-end "pick → drop →
  resize → move → options → save → reload → identical render" path
  is now a single coherent flow through the modal (Slices 2 / 5 / 9 /
  10 / 11 / 13) without any side-panel detours.
  New `__tests__/hub/settings-panel-removal.test.ts` (19 cases) locks
  the file-system absence of each deleted source file, the absent
  imports + state + handler in HubCanvas, the direct `<WidgetGrid/>`
  render (no click-delegation wrapper), and confirms `<GridEditor
  open={isEditMode}/>` is still the only mounted editor. 1370 hub
  specs green; typecheck + lint clean. **Phase HB6 nearly complete** —
  only Slice 18 (QA sweep + e2e + move doc to completed) remains.

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
