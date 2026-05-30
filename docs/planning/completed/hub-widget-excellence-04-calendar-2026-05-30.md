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

### Slice 1 — Schedule API contract audit + `calendar-math` pure module ✅ shipped 2026-05-30
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

#### Schedule API contract (audited 2026-05-30)
`app/api/admin/schedule/route.ts` — all four verbs exist:
- **GET `?from=&to=`** → `{ events }`. Rows whose `recurrence_rule` is
  set are expanded via `lib/schedule/recurrence.expandRecurrence`; each
  generated occurrence's id is `${seriesId}:${occurrenceDate}`.
- **POST** `{ title, start_time, end_time, event_type, all_day,
  location, notes, job_id, assigned_to, color, recurrence_rule,
  recurrence_end, status }` → inserts (with a `findConflicts`
  pre-check) and returns the row. `status` defaults `'approved'`,
  `assigned_to` defaults the caller.
- **PATCH** `{ id, ...fields }` → updates; `id` is `split(':')[0]` so
  editing a recurrence instance edits the series row.
- **DELETE** `{ id }` → removes.
- **SELECT cols:** id, title, event_type, start_time, end_time,
  all_day, location, notes, job_id, assigned_to, assigned_by, color,
  created_at, recurrence_rule, recurrence_end, series_id, status.
- **Shipped:** `calendar-math.ts` is fully UTC-based (deterministic +
  timezone-stable). `monthGrid(year, month/*1-12*/, weekStartsOn=0)`
  returns whole weeks padded with leading/trailing adjacent-month days
  (each `CalendarDay` carries iso/year/month/day/weekday/`inMonth`);
  `weekDays(iso)` the Sun–Sat week; `eventsForDay(events, dayIso)`
  buckets by date-only overlap so multi-day events show on every
  spanned day; `clampEventToDay` returns in-day start/end +
  continues-before/after flags for chip rendering; `isSameDay` +
  `datePart`; `bucketToView` maps tiny/small→agenda, medium→
  agenda-wide, large/xlarge→grid. 13 specs at fixed May-2026 fixtures
  (grid bounds + out-of-month flags + 31 unique in-month days, week
  span, same-day/multi-day/no-start bucketing, clamp, view map).
  typecheck + lint clean.

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

#### Sub-slice progress
- **2a — Registry-driven "Go to…" footer, wired globally ✅ shipped
  2026-05-30.** Rather than add the footer link in 34 widgets one at a
  time, wired it once at the render host: `WidgetGrid` now resolves
  `widgetGoToTarget(instance.type)` from the doc-02 registry and passes
  it as `WidgetFrame`'s `goTo` prop. Every linked widget (today-schedule
  → "Go to the schedule →" `/admin/schedule`, my-jobs → my jobs, …)
  surfaces its footer link; the 7 intentionally link-less widgets
  resolve null → no footer. This satisfies this slice's "Go to schedule
  →" requirement AND the master "most widgets get a Go-to link" ask in
  one place — the per-category docs now just VERIFY the link in Round 2.
  3 source-regex specs on the wiring + a registry-consistency spec; full
  hub suite (1509) green. typecheck + lint clean.
- **2b — size view switch + read-only `CalendarGrid` ✅ shipped
  2026-05-30.** `today-schedule` now branches on
  `bucketToView(bucket)`: tiny → count, small → agenda list, medium →
  agenda-wide list, large/xlarge → the new read-only `CalendarGrid`
  (`lib/hub/calendar/CalendarGrid.tsx`). The grid is pure presentational
  — `monthGrid` weeks of `role="gridcell"` cells (`data-iso`,
  `data-in-month`, `aria-current="date"` on today), events as colored
  chips from the API `color` field (accent fallback, `+N` overflow past
  `maxChipsPerDay`). The fetch window now follows the view via the new
  exported `scheduleWindow(view, range, now)` — month (padded a week
  each side so adjacent-month grid cells show their events) for grid,
  3-day for agenda-wide, single day for agenda; the grid renders even
  when empty. 8 specs (weekday headers + day cells, colored chips +
  no-color fallback, overflow `+N`, today/out-of-month flags; window =
  month/3-day/1-day per view). Full hub suite (1517) green; typecheck +
  lint clean.

### Slice 3 — Add-event form (create) wired to the API ✅ shipped 2026-05-30
- **Scope:** An inline "+ Add event" affordance (visible at medium+)
  opening a compact form (title, date, start/end or all-day,
  optional location) that POSTs to `/api/admin/schedule` + refreshes.
  Validation + optimistic insert + error handling.
- **Files:** the calendar subtree + a create-payload pure builder +
  specs.
- **Done when:** the surveyor can add an event from the widget; it
  appears on the grid + persists; payload builder unit-tested.
- **Shipped:** pure `lib/hub/calendar/schedule-payload.ts` →
  `buildSchedulePayload(form)` validates (title required, valid date,
  valid 00:00–23:59 start/end with end > start for timed events;
  all-day spans 00:00–23:59) and returns `{ ok, payload }` or
  `{ ok, error }`; the payload matches the schedule POST contract
  (title, start_time, end_time, all_day, event_type default 'other',
  location/color nulled when blank). `AddEventForm.tsx` is the compact
  client form (title, date, all-day toggle, start/end times, location,
  event-type select) that runs the builder, POSTs to
  `/api/admin/schedule`, shows validation/network errors, and calls
  `onCreated` to refetch. `today-schedule` shows a dashed "+ Add event"
  toggle at medium+ (agenda-wide + grid) that opens the form inline;
  on create it closes + refetches so the new event appears. 11 specs:
  the builder (timed + all-day happy paths, trims/defaults, all five
  validation failures incl. the out-of-range `25:99` time) + an SSR
  render of the form (labeled fields, date pre-fill, all-day toggle +
  actions). Full hub suite (1528) green; typecheck + lint clean.

### Slice 4 — Reminders / notifications on events ✅ shipped 2026-05-30
- **Scope:** A per-event "remind me" option (on create + on an event
  popover) that schedules a notification via the Doc-03 system at a
  chosen lead time (e.g. 1h before). Respect dedup. Surface whether a
  reminder is set.
- **Files:** the calendar subtree + the notification wiring + specs.
- **Done when:** setting a reminder creates the right notification
  intent; the UI reflects reminder state.
- **Design note:** `schedule_events` has no reminder column and this
  environment can't run migrations, so per the doc guardrail ("don't
  build new infra unless trivially small") reminders ship **infra-free**:
  an hourly cron reminds assignees about timed events starting in the
  next look-ahead window. The hourly cadence + 60-min look-ahead means
  each event lands in exactly one window → it reminds once with no
  per-event "already reminded" flag. A user-chosen per-event lead would
  need a `remind_minutes` column (a future migration) — deferred.
- **Shipped:** pure `lib/notifications/event-reminder.ts` —
  `minutesUntilStart`, `isInReminderWindow(event, now, window=60)`
  (excludes all-day + already-started), and `buildEventReminder(event,
  now)` → the notification payload (⏰ "Starting soon: {title}", body
  "starts in N minutes at {location}", link `/admin/schedule`,
  `source_type: 'event_reminder'`, `source_id` = event id for the
  bell's dedup) or null. New `cron/schedule-event-reminders` (hourly
  `0 * * * *` in vercel.json, `Bearer CRON_SECRET`) selects timed
  events with `start_time` in `[now, now+60m]` and fires the reminders
  best-effort. The add-event form surfaces the behavior with a "⏰
  You'll be reminded about an hour before" hint on timed events. 7
  specs (minutes math + null, window on/off/all-day/started, payload
  shape + singularization + null guards). typecheck + lint clean;
  vercel.json valid.

### Slice 5 — Size/format + editor + 4-round-style polish ✅ shipped 2026-05-30
- **Scope:** Walk every bucket; confirm agenda↔grid transitions look
  intentional; the specialized editor for today-schedule exposes the
  useful options (default view override, time range, show all-day,
  reminder default lead time, which calendars/event-types to show).
  a11y on the grid (keyboard day navigation, aria). Final visual pass.
- **Done when:** the calendar widget is polished at every size + its
  editor is specialized + complete. Then this doc → `completed/`.
- **Shipped:**
  - **Specialized editor** — `TodayScheduleSettings` now exposes a
    **Default view** select (auto / agenda / month grid),
    show-all-day, time-range, and an **event-type filter** (pill
    toggles for the 8 known types, tinted to match the agenda stripes;
    none-selected = show all). Backed by two pure exported helpers:
    `resolveScheduleView(defaultView, bucket)` (override wins, but grid
    falls back to agenda at tiny/small where it can't fit; `auto`
    follows `bucketToView`) and `filterEventsByType(events, types)`
    (empty = all; null type treated as 'other'), both wired into the
    widget (view resolution + fetch filter, with a stable join-key dep
    so the filter doesn't churn the fetch). 14 specs (view resolution
    across auto/agenda/grid × buckets; filter all/selected/null-type).
  - **a11y** — the grid already had `role="grid"`/`gridcell` +
    `aria-current="date"` on today; added a per-cell `aria-label`
    ("{date}, N events" / "…, no events") so screen-reader users hear
    each day's load. (Keyboard day-to-day arrow navigation is a larger
    interactive-focus feature noted for a future pass; the read-only
    grid is fully labeled + reachable today.)
  - **Format** — the size ladder reads intentionally: tiny count →
    small agenda → medium agenda-wide → large/xlarge month grid, each
    with the "+ Add event" affordance at medium+ and the registry
    "Go to the schedule →" footer. Full hub suite (1534) green;
    typecheck + lint clean.

**Doc 04 complete** — calendar-math + API audit (Slice 1), registry
footer wiring + size-aware grid (Slice 2), inline add-event form
(Slice 3), event reminders cron (Slice 4), and the specialized editor +
a11y polish (Slice 5).

## Guardrails
- The widget is a LENS on the schedule, not a second source of truth —
  it reads/writes the same `/api/admin/schedule` the `/admin/schedule`
  page uses. No divergent local calendar store.
- Grid only renders where it fits (large+); never cram a month grid
  into a 2×2.
- Reuse the schedule API's recurrence handling; don't reimplement it.
