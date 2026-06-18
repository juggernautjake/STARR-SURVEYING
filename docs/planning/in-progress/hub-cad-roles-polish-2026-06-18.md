# Hub + CAD + roles polish — 2026-06-18

> User ask:
>   - "Fix the area measuring tool. It is totally weird … make it
>     make more sense and be more intuitive."
>   - "Make there be a smooth drawing tool that the user can free
>     hand. Make it … have different opacities, colors,
>     thicknesses, and styles. Dotted, dashed, and smooth line."
>   - "User's profile page should show their icon, their name,
>     their email, their roles, and if they haven't updated it, it
>     should just have the text 'no more information about [insert
>     user's name] is available.'"
>   - "If a user does not have the drawing role and clicks the
>     cad button … they are still routed to the cad software."
>   - "We need a way to create new roles with special permissions.
>     Like a role builder page."
>   - "A lot of the widgets are not full fleshed out … weather
>     widget … if … big, it should change and show the weekly
>     forecast."
>   - "Make sure all of the quick action links … route to the
>     correct place."
>   - "Drag and drop the widgets into the grid. Not just click on
>     a widget and then click on the grid."
>   - "Each time that I add a new widget, the first time that I
>     move it or try and resize it or just click it, the widget
>     duplicates in the grid."
>   - "We should never have the same widget twice on the grid at
>     any time. If the user attempts to do this, then it should
>     have a pop up that says that the widget has already been
>     added."
>   - "All widgets in the widget selection menu that are already
>     placed on the grid should have some kind of outline or
>     differently colored background to indicate that they are
>     already in use."

## Top-level diagnosis

### A. Widget duplication bug — root cause

The user reports: **"the first time I move, resize, or click a
newly placed widget, a duplicate appears next to it."** Tracing
`lib/hub/components/GridEditor.tsx`:

1. Palette click sets `selectedType`.
2. Container `onPointerDown` (gated by `selected`) calls
   `handleCellPointerDown` → `addWidget` (line 260) + clears
   `selectedType` (line 271).
3. Placed widget's own `onPointerDown` (line 723) calls
   `startMove(e, inst)`. `startMove` does `if (selected) return;`
   **WITHOUT** `e.stopPropagation()`.
4. When the click happens fast enough that React hasn't flushed
   the `setSelectedType(null)` yet (e.g. a rapid second click
   on the placed widget), `selected` is still the palette item
   in the widget div's closure → `startMove` returns silently →
   the event bubbles to the cell underneath →
   `handleCellPointerDown` re-fires → `addWidget` is called
   AGAIN with a fresh id but **the same type** → duplicate.

Even if that exact race is hard to reproduce, the user spec is
clear: **never two of the same widget on the grid.** A
type-level dedupe in `addWidget` makes the invariant a property
of the store rather than a race condition.

### B. Widget audit (read all 45 widgets; 5 passes)

The 45 registered widgets break down as:

- **Personal / "your" hub** (12): today-schedule, my-jobs,
  my-pay, hours-this-week, pto-balance, assignments-due,
  pending-receipts, pending-time-off, pending-hours,
  mileage-tracker, streak-counter, recent-activity.
- **Team / ops** (8): team-status, crew-calendar, vehicles-status,
  equipment-out, low-consumables, maintenance-due, pipeline-status,
  job-activity-feed.
- **Field-data + drawings** (5): field-data-pending, drawings,
  drawings-in-progress, recent-drawings, active-research-projects.
- **Money** (3): monthly-revenue, outstanding-invoices, my-pay.
- **Comms** (4): messages, open-discussions, mentions-inbox,
  recent-announcements.
- **Learning** (5): class-assignments, flashcards-due, quiz-history,
  recommended-lessons, roadmap-progress.
- **Personal-prefs** (3): pinned-pages, bookmarks, quick-actions.
- **Misc** (5): activity, approvals, contacts, daily-briefing,
  weather, sun-calculator.

**Consolidation opportunities** (after the 5-pass review):

| Keep as one | Absorbs | Reasoning |
|---|---|---|
| **today-schedule** | (already adaptive: tiny count / small agenda / medium 3-day / large grid) | Already exemplary; the rest of the fleet should model their size growth on it. |
| **pending-bin** (new) | pending-receipts, pending-time-off, pending-hours, assignments-due | All four are "things waiting on you" — tabbed pill list at medium+; a single number at tiny. |
| **drawings-hub** (new) | drawings, drawings-in-progress, recent-drawings | One drawings widget that shows "all / in progress / recent" by size; today they each have ~50% overlapping data. |
| **money** (new) | my-pay, monthly-revenue, outstanding-invoices | Tiny = net pay this period; small = YTD; medium = pipeline; large = full ledger. |
| **comms-inbox** (new) | messages, open-discussions, mentions-inbox | One unread badge at tiny; tabs at medium. |
| **learning-stack** (new) | class-assignments, flashcards-due, recommended-lessons | Tiny = next due card count; medium = today's queue; large = roadmap progress. |
| **field-pulse** (new) | team-status, vehicles-status, equipment-out, low-consumables | Today these read like a fragmented dashboard; one "Field pulse" widget with tabs gives the same data with less chrome. |

That trims ~16 widgets to ~7 without losing any data —
**net: 45 → 36 registered widgets.** (Original widgets remain
behind a "legacy" flag so existing hub layouts keep rendering
their saved choices; new placements pick from the consolidated
roster.)

### C. Drag-and-drop placement

Today: click palette → click cell. Tomorrow: drag the palette
chip onto the grid. Reuse the existing `cellUnderPointer` math.
HTML5 drag API is simplest; pointer events buy us touch support.

### D. Widget palette "already placed" indicator

Sidebar entries get a `--placed` modifier class when the widget
type is already in `draftWidgets`. CSS lights the chip with a
green outline + dims the cursor so a second drag is visibly
blocked. The store rejects the duplicate with a `console.warn` +
the alert handler fires the "already added" copy.

### E. Profile fallback

`/admin/employees/[email]` already renders the four cards. When
none of the personal-info fields (DOB, gender, pronouns, bio,
phones, emails, addresses, images) carry a non-empty value, the
page collapses to a single "No more information about
{user_name} is available." stub. Cards still surface roles +
auth email + job_title (those are the always-on identity
fields).

### F. CAD button bypass

Today `lib/admin/route-registry.ts` gates `/admin/cad` on
`RESEARCH_ROLES + field_crew + tech_support`. The user wants
ANY signed-in user to reach the route for now. Drop the `roles:`
field on that entry (or add `'employee'` to it) + remove the
client-side gating at the quick-action level.

### G. Role builder page

New route `/admin/roles/new` (admin-only). Reads the existing
`registered_users.roles TEXT[]`. Lists every role currently in
use + a free-text field to register a new role label. A
companion seeds row in a new `public.custom_roles` table that
stores `(key, label, permissions JSONB)` so the role can carry
arbitrary granted permissions.

### H. Weather widget weekly forecast

API today returns one snapshot. Extend `/api/admin/weather` to
optionally return a 5-day forecast (Open-Meteo's `daily=` does
this for free). Widget at `large` / `xlarge` renders a 5-day
strip with high / low + icon per day; mid sizes still show the
expanded current. Demonstrates the size-relative content the
user wants across the fleet.

### I. Quick-actions audit

The quick-actions widget already lets the user pick from a
catalog. The catalog's hrefs need verification — sweep every
entry against `route-registry.ts` so no stale slugs survive.

### J. Area-measuring + free-hand drawing tools

Both live under `/admin/cad`. Today's area tool requires clicking
a polygon vertex-by-vertex with no preview line + no
auto-close + small hit targets. New tool surfaces a sticky
toolbar with: snap, undo last vertex, close polygon, live area
readout in ft²/acres. Free-hand pen tool gets a stroke palette
(color, opacity, weight, dash style: solid / dashed / dotted /
smoothed).

## Slice plan

Each slice = its own commit + the three post-build checks.

| Slice | What ships |
|---|---|
| **W1** | Type-level dedupe in `addWidget` + matching "already added" toast + `--placed` modifier on palette chips. Closes the duplication bug AND enforces the user spec ("never two of the same widget"). ✅ shipped |
| **W2** | Drag-and-drop palette → grid via HTML5 drag API. Old click-to-arm + click-cell still works as a fallback. ✅ shipped |
| **W3** | Profile fallback ("No more information about …") on `/admin/employees/[email]` when every optional field is empty + always-on role pills row in the header per the user spec. ✅ shipped |
| **W4** | CAD-button bypass: middleware + route-registry + sidebar + command-palette + quick-actions all widened so any signed-in user can reach `/admin/cad`. Annotated for restoration once W7 lands. ✅ shipped |
| **W5** | Weather widget extended with a 5-day forecast strip at `large` / `xlarge`. API requests `forecast_days=5` + `daily=weather_code`, the snapshot mapper folds the daily arrays through a new pure `buildDailyForecast`, and the widget slices today's row out so the strip reads as "next 4 days". Establishes the size-relative-content pattern for the rest of the fleet. ✅ shipped |
| **W6** | Quick-actions catalog audit: every href verified against `route-registry.ts`; broken slugs swapped or flagged with a typed deprecation. |
| **W7** | Role builder page at `/admin/roles/new`. Migration for `custom_roles` + minimal CRUD UI + admin-only gate. |
| **W8** | Widget consolidation phase 1 — ship `comms-inbox` + `pending-bin` consolidated widgets. Legacy components stay registered for one release so existing layouts keep working. |
| **W9** | Widget consolidation phase 2 — `drawings-hub`, `money`, `learning-stack`, `field-pulse`. |
| **W10** | CAD area-measuring tool revamp: sticky toolbar, live readout, snap / undo / close. |
| **W11** | CAD free-hand drawing tool: stroke color / opacity / weight / dash style picker; smooth-curve fitting. |

Five-pass review notes are inline above (sections B–I). Each
audit pass narrowed the consolidation targets; the final list
is what ships in W8 / W9.

## Notes locked from the spec

- **Type-level uniqueness is a store invariant**: enforced in
  `addWidget` so any caller (drag-drop, click-place, future
  programmatic seeds) honors the rule for free.
- **CAD bypass is intentionally permissive** — the user said
  "we might change this in the future, but for now leave it."
  Add a comment so a future reviewer doesn't undo the bypass.
- **Legacy widgets stay registered** through the consolidation
  phases so a user's saved hub layout keeps rendering its old
  widgets until they manually replace them.
