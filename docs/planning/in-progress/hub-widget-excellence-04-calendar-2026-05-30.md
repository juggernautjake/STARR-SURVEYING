# Foundation 04 — Interactive calendar / schedule build-out

*Part of the Hub Widget Excellence plan (`…-00-master-…`). The user:
"The schedule widget should have access to a calendar and should
render one if possible. See what makes sense for the calendar to show
up depending on the size of the widget. Make it interactable so that
the user can add things to the calendar and set reminders and
notifications."*

## Verified current state

- Widget `today-schedule` (`lib/hub/widgets/today-schedule/index.tsx`)
  fetches `/api/admin/schedule?from=&to=` and lists today's events:
  `{ id, title, event_type, start_time, end_time, all_day, location,
  color }`. Default 4×3, min 1×1, max 8×8. Size-responsive list.
- The schedule API is full-featured: `GET ?from=&to=` (incl.
  recurrence expansion) + `POST` create `{ title, start_time,
  end_time, event_type, all_day, location, notes, job_id, color,
  recurrence_rule, recurrence_end }` + presumably PATCH/DELETE
  (verify in Round 1). Select cols include `recurrence_rule, series_id,
  status`.
- Full scheduling page exists at `/admin/schedule`.
- Notifications system (Doc 03) can fire reminders.

## Design

`today-schedule` becomes size-adaptive between three presentations:

- **tiny / small** — the agenda list it has today (next events), with
  a "Go to schedule →" footer link. No grid; not enough room.
- **medium** — a compact agenda (today + maybe tomorrow) OR a tiny
  week strip, whichever reads better; "+ Add" affordance.
- **large / xlarge** — render an actual mini **month or week grid**
  (whichever fits the aspect), with events as chips, clickable days,
  and an inline "+ Add event" that opens a small create form posting to
  the schedule API. Optional per-event reminder toggle that schedules a
  notification (Doc 03).

The heavy date math lives in a pure module so it's testable without a
DOM.

## Slices

### Slice 1 — Schedule API contract audit + `calendar-math` pure module
- **Scope:** Re-read the schedule API route end-to-end; document the
  exact GET/POST/PATCH/DELETE contract + the recurrence expansion.
  New `lib/hub/calendar/calendar-math.ts`: pure helpers —
  `monthGrid(year, month)` (weeks × days), `weekDays(date)`,
  `eventsForDay(events, day)`, `bucketToView(bucket)` (tiny/small →
  'agenda', medium → 'agenda-wide', large/xlarge → 'grid'),
  `isSameDay`, `clampEventToDay`. Deterministic + unit-tested.
- **Files:** `calendar-math.ts`,
  `__tests__/hub/calendar-math.test.ts`, audit notes in this doc.
- **Done when:** the API contract is documented; pure helpers cover
  month-grid generation (incl. leading/trailing days), week days,
  per-day event bucketing, and the bucket→view mapping at fixed
  fixtures.

### Slice 2 — Size-aware view switch in `today-schedule`
- **Scope:** Wire `bucketToView` so the widget renders agenda (small),
  agenda-wide (medium), or the grid (large+). Build the read-only
  month/week grid (events as colored chips from the `color` field,
  today highlighted, day cells clickable to show that day's events).
  Add the "Go to schedule →" footer link to `/admin/schedule`.
- **Files:** `lib/hub/widgets/today-schedule/index.tsx` (+ a
  `CalendarGrid` subcomponent under `lib/hub/calendar/`), source-regex
  + render specs.
- **Done when:** the widget shows the right view per size; the grid
  renders real events; nothing clips; footer link works.

### Slice 3 — Add-event form (create) wired to the API
- **Scope:** An inline "+ Add event" affordance (visible at medium+)
  opening a compact form (title, date, start/end or all-day,
  optional location) that POSTs to `/api/admin/schedule` + refreshes.
  Validation + optimistic insert + error handling.
- **Files:** the calendar subtree + a create-payload pure builder +
  specs.
- **Done when:** the surveyor can add an event from the widget; it
  appears on the grid + persists; payload builder unit-tested.

### Slice 4 — Reminders / notifications on events
- **Scope:** A per-event "remind me" option (on create + on an event
  popover) that schedules a notification via the Doc-03 system at a
  chosen lead time (e.g. 1h before). Respect dedup. Surface whether a
  reminder is set.
- **Files:** the calendar subtree + the notification wiring + specs.
- **Done when:** setting a reminder creates the right notification
  intent; the UI reflects reminder state.

### Slice 5 — Size/format + editor + 4-round-style polish
- **Scope:** Walk every bucket; confirm agenda↔grid transitions look
  intentional; the specialized editor for today-schedule exposes the
  useful options (default view override, time range, show all-day,
  reminder default lead time, which calendars/event-types to show).
  a11y on the grid (keyboard day navigation, aria). Final visual pass.
- **Done when:** the calendar widget is polished at every size + its
  editor is specialized + complete. Then this doc → `completed/`.

## Guardrails
- The widget is a LENS on the schedule, not a second source of truth —
  it reads/writes the same `/api/admin/schedule` the `/admin/schedule`
  page uses. No divergent local calendar store.
- Grid only renders where it fits (large+); never cram a month grid
  into a 2×2.
- Reuse the schedule API's recurrence handling; don't reimplement it.
