# Foundation 02 — Shared widget infrastructure

*Part of the Hub Widget Excellence plan (`…-00-master-…`). Builds the
reusable pieces every per-category widget doc depends on, so the
per-widget work is consistent + DRY. Do this BEFORE the per-category
docs (its slices are foundational).*

## Why

The user wants (a) most widgets to gain a "Go to…" link, (b) a
consistent specialized editor per widget, (c) size-aware field
priority everywhere, and (d) row-level deep links. Rather than
re-implement those 41 times, build shared primitives first.

## Verified current state

- `WidgetFrame` (`lib/hub/components/WidgetFrame.tsx`) already supports
  a `footer` slot + a `headerAction` slot + always-visible title +
  `headerColor`. The "Go to…" link should live in the footer slot via
  a shared component so it looks identical across widgets.
- `lib/hub/size-bucket.ts` gives `sizeBucket(w,h)` → tiny / small /
  medium / large / xlarge; `useElementSize` gives live cell size.
- `WidgetOptionsPanel` (`lib/hub/components/WidgetOptionsPanel.tsx`)
  hosts Size + Header color + Title + the widget's content controls
  (either a `SettingsForm` or the schema-driven `SchemaOptionsForm`).
- `lib/hub/widgets/_shared/` already holds `stat-bucket.ts` +
  `content-resolvers.ts`.

## Slices

### Slice 1 — `WidgetGoToLink` shared footer link ✅ shipped 2026-05-30
- **Scope:** New `lib/hub/widgets/_shared/WidgetGoToLink.tsx` — a
  consistently-styled "Go to {label} →" `next/link` for the
  `WidgetFrame` footer. Accepts `href`, `label`, optional `iconName`.
  Accessible (real anchor, aria-label). One look for every widget.
- **Files:** the component + `__tests__/hub/widget-go-to-link.test.tsx`.
- **Done when:** renders an anchor to `href` with "Go to {label} →";
  spec locks the markup + a11y.
- **Shipped:** `WidgetGoToLink({ href, label, icon })` renders a real
  `next/link` anchor (keyboard-reachable, open-in-new-tab works) with
  `aria-label="Go to {label}"`, the visible "Go to {label} →" text, an
  optional decorative leading icon, and a `widget-go-to-link` class +
  `data-widget-go-to` hook for styling/selection. Themed via
  `--theme-accent` / `--hub-font-xs` tokens (no hard-coded brand
  color). 5 SSR specs green: anchor → href, the Go-to text + arrow, the
  aria-label, the class/data hook, and icon present-when-provided /
  absent-otherwise. typecheck + lint clean. (`next/link` renders cleanly
  under `renderToStaticMarkup`, so no mock needed.)

### Slice 2 — Widget→route link registry ✅ shipped 2026-05-30
- **Scope:** New `lib/hub/widgets/_shared/widget-links.ts` — a pure
  map from widget id → its canonical "Go to…" destination (label +
  href) using the verified routes (jobs → `/admin/jobs`, my-pay →
  `/admin/my-pay`, monthly-revenue/outstanding-invoices →
  `/admin/finances`, today-schedule → `/admin/schedule`, messages →
  `/admin/messages`, etc.). Also row-level href builders:
  `jobHref(id)` → `/admin/jobs/{id}`, `cadJobHref(id)` →
  `/admin/cad?job={id}`, `conversationHref(id)`, `lessonHref(moduleId,
  lessonId)`, `equipmentHref(id)`, `teamMemberHref(email)`,
  `researchProjectHref(id)`. Centralizing means a route change is
  one edit. Includes an explicit "no footer link" set for the widgets
  that shouldn't have one (per the user, "not all widgets").
- **Files:** `widget-links.ts`, `__tests__/hub/widget-links.test.ts`
  (every mapped href is non-empty + matches the expected pattern;
  the row-builders produce the right shape; coverage vs. the catalog).
- **Done when:** the registry covers every widget that should have a
  link; builders unit-tested; a coverage test asserts no widget that
  the spec says "should link" is missing.
- **Shipped:** `WIDGET_LINKS` maps 34 domain widgets to a verified
  `{ href, label }` (all hrefs re-checked against real route dirs:
  e.g. equipment-out-today → `/admin/equipment/today`, low-consumables
  → `/admin/equipment/consumables`, maintenance-due →
  `/admin/equipment/maintenance`, outstanding-invoices →
  `/admin/billing/invoices`, recent-activity → `/admin/timeline`,
  pipeline-status → `/admin/research/pipeline`, recent/in-progress
  drawings → `/admin/cad`). `WIDGETS_WITHOUT_LINK` is the explicit
  7-widget link-less set (quick-actions, pinned-pages, bookmarks,
  weather, sun-calculator, daily-briefing, streak-counter — launchers,
  ambient tools, pure stats). `widgetGoToTarget(id)` → target | null.
  Seven row-builders (`jobHref`, `cadJobHref`, `conversationHref`,
  `lessonHref`, `equipmentHref`, `teamMemberHref`, `researchProjectHref`)
  with URL-encoding on the free-form ones (cadJob query, team email).
  8 specs green: the local 41-id catalog is complete + unique, the
  link/no-link sets **partition** it (every widget classified exactly
  once, none forgotten), no entry references an unknown id, every
  mapped href matches `^/admin/[a-z0-9/-]+$` with a non-empty label,
  and the builders produce the right shapes incl. encoding. typecheck +
  lint clean. (Per-category Round-2 audits may retarget a specific
  widget's link — e.g. mentions-inbox currently → messages — but the
  registry is the one place to change it.)

### Slice 3 — `field-priority` size helper ✅ shipped 2026-05-30
- **Scope:** New `lib/hub/widgets/_shared/field-priority.ts` —
  `pickFields(allFields, bucket, priorityOrder)` returns the subset of
  fields to render at a given bucket, given a priority-ordered list +
  a per-bucket cap. This standardizes "tiny = top 1, small = top 2–4,
  medium+ = more" so every widget's field-priority logic reads the
  same way. Pure + unit-tested.
- **Files:** `field-priority.ts`,
  `__tests__/hub/field-priority.test.ts`.
- **Done when:** deterministic field subsets per bucket; spec covers
  the tiny→xlarge progression + the cap behavior.
- **Shipped:** `pickFields<T>(fields, bucket, caps?)` takes the
  priority-ordered prefix that fits the bucket. `DEFAULT_FIELD_CAPS` =
  tiny 1 / small 3 / medium 5 / large 8 / xlarge ∞; `fieldCountForBucket`
  exposes the cap (clamped ≥ 0, ∞ passthrough). Generic over the item
  type (works for field-name strings or richer field descriptors), and
  returns a copy so callers can't mutate the source. 12 specs green:
  the exact prefixes per bucket, the **monotonic + nested** invariant
  (each larger bucket's list ⊇ the smaller one as a prefix, so the
  single most-important field survives to tiny), never-exceeds-length,
  copy-not-reference, and custom-cap + zero-cap overrides. typecheck +
  lint clean.

### Slice 4 — Editor section primitives audit ✅ shipped 2026-05-30
- **Scope:** Audit `lib/hub/components/settings/` + `SchemaOptionsForm`
  + `WidgetOptionsPanel`. Ensure the building blocks a "specialized,
  good-looking, easy" per-widget editor needs all exist + look good:
  labeled groups, number steppers, toggles, selects, multi-selects,
  color pickers, a reorderable list control (for quick-actions /
  bookmarks ordering), and a "preview" affordance. Add any missing
  primitive (most likely: a reorderable multi-select / chip-picker for
  the actions+bookmarks editors). Keep them theme-consistent.
- **Files:** `lib/hub/components/settings/*` (+ maybe a new
  `ReorderableList` / `ChipMultiSelect`), source-regex + render specs.
- **Done when:** the editor primitive set is complete + consistent;
  the per-category docs can assume these exist.
- **Audit result:** there is no `lib/hub/components/settings/` dir — the
  schema-driven editor is `SchemaOptionsForm.tsx`, which already ships
  six theme-token-styled controls (text, number-with-min/max/step,
  toggle, select, order-agnostic multiselect chip-picker, color), each
  in a labeled `SchemaFieldRow` group with a description hint. The 29
  bespoke-`SettingsForm` widgets render their own controls. The ONE
  gap the user's asks need: an **order-preserving** multi-select (the
  existing chip-picker emits values in option order, so it can't
  express "these actions, in THIS order" for quick-actions/bookmarks).
- **Shipped:** new `orderedmultiselect` schema field type +
  `OrderedMultiSelectControl`. The control renders the selected items as
  an ordered `<ol>` (each row: label + ↑/↓ move + ✕ remove, with
  move-up disabled on the first / move-down on the last), an "add" row
  of the unselected options as dashed chips, an empty state, and a
  `maxSelected` cap (hides the add row + shows a hint). Backed by pure
  immutable helpers in `lib/hub/widgets/_shared/ordered-list.ts`
  (`moveUp`, `moveDown`, `addOrdered`, `removeOrdered`,
  `normalizeOrdered` — coerces a stale persisted value to a clean,
  de-duped, valid-only ordered subset — and `unselectedOptions`).
  Wired into the schema type union (`WidgetOptionsOrderedMultiSelect
  Field`) + the `renderControl` switch. 22 specs across two files: the
  pure helpers (move/add/remove/normalize/unselected, incl. immutability
  + fallback) and an SSR render of the control (selected order honored,
  per-item controls + boundary-disabled state, add-chips for unselected
  only, empty state, stale-value normalization, the cap state). All
  existing schema specs + the full hub suite (1489) stay green.
  typecheck + lint clean. (Deferred: a live "preview" affordance is a
  per-widget concern — the per-category docs add previews where they
  help, e.g. quick-actions in Doc 15; the primitive set they need now
  exists.)

### Slice 5 — Wire `WidgetGoToLink` into `WidgetFrame` ergonomics
- **Scope:** Make it trivial for a widget to add the footer link:
  either a `goTo={{href,label}}` convenience prop on `WidgetFrame`
  that renders `WidgetGoToLink` in the footer, OR document the footer
  pattern. Pick the lower-churn option. Confirm it composes with
  existing footers (some widgets already use `footer`).
- **Files:** `WidgetFrame.tsx` (if adding the prop) + spec.
- **Done when:** a widget can surface its "Go to…" link in one line;
  spec locks it. Then this doc → `completed/`.

## Guardrails
- These are additive primitives; don't regress existing widget
  rendering. The per-category docs adopt them incrementally.
- Keep everything theme-token-driven (no hard-coded colors except the
  role/brand palette).
