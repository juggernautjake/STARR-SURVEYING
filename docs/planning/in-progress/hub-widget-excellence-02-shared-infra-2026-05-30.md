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

### Slice 1 — `WidgetGoToLink` shared footer link
- **Scope:** New `lib/hub/widgets/_shared/WidgetGoToLink.tsx` — a
  consistently-styled "Go to {label} →" `next/link` for the
  `WidgetFrame` footer. Accepts `href`, `label`, optional `iconName`.
  Accessible (real anchor, aria-label). One look for every widget.
- **Files:** the component + `__tests__/hub/widget-go-to-link.test.tsx`.
- **Done when:** renders an anchor to `href` with "Go to {label} →";
  spec locks the markup + a11y.

### Slice 2 — Widget→route link registry
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

### Slice 3 — `field-priority` size helper
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

### Slice 4 — Editor section primitives audit
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
