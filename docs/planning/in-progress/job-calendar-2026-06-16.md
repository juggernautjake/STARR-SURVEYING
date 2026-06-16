# Job calendar view — 2026-06-16

> **Goal.** A first-class organisation calendar at `/admin/calendar` that
> shows every scheduled-phase event for every job, in Month / Week / Day
> view, with a fullscreen "big screen" mode the office can leave running
> on a wall TV. Each scheduled item is a click-through link to the
> corresponding `/admin/jobs/[id]` job-flow page.
>
> **Three phases get scheduled per job:**
> - **Research** — daddy picks the day(s) when he'll do the research
> - **Field Work** — daddy picks the day(s) when the crew will be on site
> - **Drawing & Deliverables** — daddy picks the day(s) for drafting +
>   legal review + delivery
>
> Each phase fires a day-before reminder + a day-of reminder to the
> assignee. The lead → job conversion gets a polish pass so the new-job
> form pre-fills from the lead row that the previous plan
> (`mobile-and-customer-query-gap-2026-06-14`) wired up.

## What already exists (don't rebuild)

From the codebase survey (2026-06-16):

- **Job detail page** at `/admin/jobs/[id]/page.tsx` — the click-through
  target. 9 tabs, stage timeline. Already exists; calendar just deep-links
  to it.
- **`schedule_events` table** at `seeds/293_schedule_events.sql` — has
  `id`, `title`, `event_type`, `start_time`, `end_time`, `all_day`,
  `location`, `notes`, `job_id` (FK to jobs), `assigned_to`, `assigned_by`,
  `color`. Already the right shape for per-phase scheduling — each
  scheduled phase is one row with `job_id` set + an `event_type` of
  `research` / `field_work` / `drawing_deliverables`.
- **Schedule API** at `app/api/admin/schedule/route.ts` — already supports
  GET (window-bounded) / POST / PATCH / DELETE on `schedule_events`. Calendar
  reads from it.
- **`SchedulePanel.tsx`** at `app/admin/schedule/SchedulePanel.tsx` —
  embedded in `/admin/me?tab=schedule`, shows month + week of the active
  user's events. We DON'T rebuild this. The new calendar lives at
  `/admin/calendar` and shows EVERYONE's events for the office big-screen
  use case.
- **Cron pattern** — `app/api/cron/schedule-event-reminders/route.ts` +
  `app/api/cron/drawing-due-reminder/route.ts` are working examples of
  scheduled-notification fan-out via `notify()` / `notifyMany()`. The new
  reminder cron reuses the pattern.
- **Job stages** — quote → research → fieldwork → drawing → legal →
  delivery → completed, already enforced. Each scheduled phase corresponds
  to a stage; advancing through phases doesn't require new stages.
- **Notifications** — `lib/notifications.ts` + the dispatch system the
  previous plan wired for leads. The day-before/day-of reminders use the
  same path.
- **Leads infrastructure** — `lib/leads/intake.ts` + `/admin/leads` from
  the previous plan. Calendar plan adds a "Convert to job" button on the
  lead detail page that pre-fills the existing new-job form.

## What needs to be built

| Piece | Status | Slice |
|---|---|---|
| `/admin/calendar` route + page shell | MISSING | **C1** |
| Month-view grid (year + month + day squares) | MISSING | **C1** |
| Week-view grid (7 columns, hour rows) | MISSING | **C2** |
| Day-view (single column, hour rows) | MISSING | **C2** |
| View switcher (month / week / day) | MISSING | **C2** |
| Per-day square: scrollable list of events when there are many | MISSING | **C1** |
| Each event renders as a click-through link to `/admin/jobs/[id]` | MISSING | **C1** |
| Fullscreen toggle + "TV-friendly" layout | MISSING | **C3** |
| Navigation: prev/next month/week/day + "today" button | MISSING | **C1** |
| Year picker + month picker (for fast jump) | MISSING | **C3** |
| **Per-job 3-phase scheduler UI** on `/admin/jobs/[id]` | MISSING | **C4** |
| **Phase-reminder cron** (day-before + day-of for each phase) | MISSING | **C5** |
| **Lead → Job prefill conversion** (button on `/admin/leads/[id]`) | MISSING | **C6** |
| Job-creation form prefill from leads (via `?fromLead=<id>` query) | MISSING | **C6** |

## Constraints

- **Don't duplicate the existing `SchedulePanel`.** The new `/admin/calendar`
  is org-wide all-jobs; the existing panel stays as the "my events"
  surface. Both read from the same `schedule_events` table — the new one
  just doesn't filter by `assigned_to`.
- **Reuse the design system contract** from
  `docs/admin-styling-contract.md`. Calendar grid uses the canonical
  `--color-brand-navy` / `--color-brand-red` / `--color-bg-card` tokens.
  Phase-color mapping (research / field-work / drawing) gets three new
  semantic tokens in `tokens.css`.
- **Big-screen mode is fullscreen + auto-refresh.** A wall TV will be
  open on this page all day; the page must:
  - Re-fetch every 5 minutes silently
  - Hide nav chrome
  - Scale text + cell padding up so an 8-ft viewing distance still reads
  - Honor `requestFullscreen()` so a single keystroke is enough
- **Mobile responsiveness** stays — same breakpoints as
  `docs/admin-styling-contract.md` (480 / 768 / 1023 / 1024+). The
  big-screen mode is its own top-level layer; the regular page still
  reads on a phone.

## Phase C — Calendar surfaces

**C1 shipped 2026-06-16** — month view + page shell at
`/admin/calendar`.
- `lib/calendar/month-grid.ts` — pure helpers: `buildMonthGrid`
  (42-cell stable layout), `groupEventsByDay` (multi-day fan-out
  capped at 42 days), `monthGridWindow` (API request bounds),
  `stepMonth` (prev/next nav math), `isoOfDate` / `eventDayIso`
  (local-tz keys), `MONTH_NAMES` / `DAY_HEADERS` / `PHASE_COLORS` /
  `PHASE_LABELS`.
- `app/admin/calendar/page.tsx` — admin-gated, reads
  `/api/admin/schedule?from=&to=` over the 42-day window, renders a
  6×7 grid with prev/today/next nav. Each event with `job_id` is a
  `<Link href="/admin/jobs/<id>">`; non-job events render as a plain
  span. Today's square gets a `--color-brand-navy` outline.
- `app/admin/styles/Calendar.css` — fluid 6-row × 7-col grid using
  canonical tokens (`--color-brand-navy`, `--color-bg-card`,
  `--color-bg-subtle`, `--color-text-on-brand`). Per-event left-
  border accent driven by `--phase-color` set inline. Per-day
  scrollable inner list (the user's explicit ask). Phone breakpoint
  collapses to a stacked day-list so the grid doesn't go illegible.
- Source-locked by `__tests__/calendar/c1-month-grid.test.ts` (33
  assertions across grid invariants, multi-day fan-out, nav math,
  phase color + label tables, page wiring, CSS contract, and
  drift-name absence per the admin styling contract).

Full suite after C1: 8328 green (+33).

### C1 — Month view + page shell
First slice. Ships the route + month grid + clickable events.

- `/admin/calendar` page at `app/admin/calendar/page.tsx`
- Month-view component reads `schedule_events` over a 6-row × 7-col
  window (42 days, covers any month) via the existing
  `/api/admin/schedule` GET endpoint
- Each day square has a scrollable inner list when events overflow
  (overflow-y: auto; max-height per cell, tuned per breakpoint)
- Each event renders as `<Link href={`/admin/jobs/${event.job_id}`}>`
  when `job_id` is set; non-job events stay as plain spans
- Today's square gets a distinct outline
- Prev/next/today nav arrows + a month/year label header
- Source-locked via React-testing-library shape tests (no Playwright
  needed)

**C2 shipped 2026-06-16** — week + day views + view switcher.
- `lib/calendar/week-grid.ts` — pure helpers:
  - `parseView(raw)` coerces a URL param to `'month' | 'week' | 'day'`
    (defaults to month)
  - `buildWeekCells(focus)` — 7 cells starting on the Sunday on-or-before
    focus
  - `buildDayCell(focus)` — single-cell projection for day view
  - `stepFocus(focus, view, delta)` — view-aware prev/next: month
    jumps a calendar month, week jumps 7 days, day jumps 1
  - `weekWindow(focus, view)` — API request bounds with ±1 day pad
  - `HOUR_ROWS` (6am→9pm) + `FIRST_HOUR` / `LAST_HOUR` constants
  - `eventGridPosition(startIso, endIso)` — top% + height% of the
    hour grid; clamps to visible edges; floors height at 2% so a
    5-minute event is still tap-sized
  - `viewHeaderLabel(focus, view)` — "June 2026" / "Jun 14 – Jun 20,
    2026" / "Wednesday, June 17, 2026" per view
- `app/admin/calendar/page.tsx` — view state via `useSearchParams` +
  `parseView`; persists to URL via `router.replace`. New
  `setView`/`goPrev`/`goNext`/`goToday` all view-aware. Three render
  helpers (`renderMonth`, `renderWeek`, `renderDay`) share two event
  renderers (`renderEventPill` for the all-day strip + month cells,
  `renderTimedEvent` for hour-grid pills). Week + day views split
  events into all-day strip + timed body. Both views expose stable
  testIDs (`calendar-week-grid` / `calendar-day-grid`).
- `app/admin/styles/Calendar.css` — adds `.calendar-page__view-switcher`
  (segmented control on the header), `.calendar-week__*` / `.calendar-
  day__*` grid styles (4rem hour gutter + 7 fluid day columns / 1
  fluid day column), timed-event absolute positioning with
  `--phase-color` left border, today's day column outlined in brand
  navy.
- The C1 source-locks that pinned `cells.map`, `data-action="prev-month"`,
  and `data-view="month"` were widened to the dynamic shapes
  (`monthCells.map`, `data-action={\`prev-${navLabel}\`}`,
  `data-view={view}`) — same contracts, just view-aware now.
- Source-locked by `__tests__/calendar/c2-week-day-views.test.ts` (33
  assertions: parseView coercion, week/day cell math, stepFocus per
  view, weekWindow bounds, eventGridPosition clamping + floor,
  HOUR_ROWS contract, viewHeaderLabel per view, page wiring
  (URL persist, switcher, view-aware nav, testIDs, CSS contract).

Full suite after C2: 8391 green (+33).

### C2 — Week + Day views + view switcher
Second slice.

- Three-button view switcher: `[Month][Week][Day]` — defaults to month;
  selection persists in `?view=` URL param so deep-links from the wall TV
  remember the right view
- Week view: 7 columns × 24 rows (or 7 columns × 8am–6pm rows
  with an "all day" strip on top). Same `<Link>` shape per event.
- Day view: single column, same hour rows; an "all day" strip on top
- All three views read from one shared `useScheduleWindow(start, end)`
  hook so refresh + nav math lives in one place
- View-aware prev/next nav (month nav stays a month at a time; week nav
  jumps a week; day nav jumps a day)

**C3 shipped 2026-06-16** — fullscreen + big-screen wall-TV mode.
- `app/admin/calendar/page.tsx`:
  - `rootRef` on the calendar root + `toggleFullscreen` calls
    `requestFullscreen()` / `document.exitFullscreen()` on it.
  - React state mirrors browser fullscreen via the
    `fullscreenchange` event so an Esc-out flips state back without
    polling.
  - `data-display-mode="big-screen"` painted on the root only when
    fullscreen (CSS keys on the attribute, never the React state).
  - Auto-refresh: `setInterval` every 5 min (`AUTO_REFRESH_MS = 5
    * 60 * 1000`, module-scope), STARTS only when fullscreen is
    true, clears on unmount.
  - Keyboard shortcuts globally registered on window: ←/→ prev/next,
    `t` today, `f` fullscreen, `m`/`w`/`d` view switch. Shortcut
    handler ignores keys while typing in INPUT / SELECT / TEXTAREA
    so the month/year pickers + the future intake form stay
    usable.
  - Year picker (±5 years around focus, declared via useMemo above
    the early returns to honor rules-of-hooks) + month picker
    select dropdowns in the header for fast jumps. Stable testIDs
    (`month-picker` / `year-picker`).
  - Fullscreen toggle button (`data-action="toggle-fullscreen"`)
    next to the nav buttons; flips icon ⛶ → ⤡ when active.
- `app/admin/styles/Calendar.css`:
  - Year/month picker select styling matches the nav buttons.
  - `data-display-mode='big-screen'` rules scale the title to
    2.25rem, bump cell padding to `--space-3`, increase event-pill
    font + padding, and paint a solid `--color-bg-app` background
    so a TV doesn't show host-page gradient artefacts. All other
    chrome (sidebar, topbar) is already hidden by the browser's
    own fullscreen API.
- Source-locked by `__tests__/calendar/c3-fullscreen.test.ts` (21
  assertions: ref + event listener + toggle, data-display-mode
  contract, 5-min auto-refresh constant + interval guard, every
  keyboard shortcut + input-target ignore, year/month picker
  testIDs + window math + focus rebuild, CSS picker style + big-
  screen scaling + canonical bg-app token).

Full suite after C3: 8412 green (+21).

### C3 — Fullscreen + big-screen mode
Third slice.

- A "Fullscreen" button on the header calls `requestFullscreen()` on
  the calendar root
- When fullscreen, hide the admin sidebar/topbar + scale the day-square
  text + bump cell padding via a `data-display-mode="big-screen"`
  attribute the new stylesheet keys on
- Auto-refresh: a `useEffect` polls the schedule endpoint every 5 minutes
  while fullscreen so a wall-TV view stays current without manual reload
- Keyboard shortcuts: `f` enters fullscreen; `Esc` exits (browser
  built-in); arrow keys nav prev/next; `t` jumps to today
- Year + month picker dropdowns for fast jumps from any view (esp. useful
  on the touchscreen wall TV)

**C4 shipped 2026-06-16** — per-job phase scheduler.
- `lib/calendar/phase-event.ts` — pure helpers: `PHASES`,
  `PHASE_TITLE_PREFIX`, `buildPhaseEventRow` (single day),
  `buildPhaseEventRowsForDays` (multi-day fan-out),
  `validatePhaseDraft` (input guard returning a clear message
  string or null).
- `app/admin/jobs/[id]/JobPhaseScheduler.tsx` — the panel. Three
  sections (Research / Field Work / Drawing & Deliverables) each
  with: already-scheduled list (deletable), day-input
  (comma/space separated), assignee email, Schedule button.
  POSTs sequentially through the existing `/api/admin/schedule`
  endpoint and skips `schedule_conflict` 409s gracefully so a
  single overlap doesn't lose the rest of the work. Links the
  intro text at "the org calendar" to `/admin/calendar`.
- `app/admin/jobs/[id]/page.tsx` — `Schedule` tab added between
  Overview + Research (icon 🗓️). Active-tab block renders
  `<JobPhaseScheduler jobId jobName jobAddress selfEmail />`.
- `app/admin/styles/Calendar.css` — scheduler styling appended.
  Per-phase left-border accent (`research` teal, `field_work`
  amber, `drawing_deliverables` violet) keyed off `data-phase`.
  Inputs honor the brand-navy focus ring + canonical tokens.
- Source-locked by
  `__tests__/calendar/c4-phase-scheduler.test.ts` (30 assertions:
  PHASES contract, mapper invariants per phase, all-day default,
  override paths, multi-day fan-out, validator branches, panel
  wiring (data-action / testIDs / loading-empty-error states),
  job page tab insertion).

Full suite after C4: 8358 green (+30).

### C4 — Per-job 3-phase scheduler
Fourth slice. The piece daddy actually drives.

- A "Schedule" tab (or "Schedule" panel under the existing Overview tab)
  on `/admin/jobs/[id]`
- Three sub-sections: Research / Field Work / Drawing & Deliverables
- Each section: date picker(s) for the day(s), assignee dropdown,
  optional location + notes, a Save button. Save creates / updates a
  `schedule_events` row with `event_type` set to one of the three new
  enum values, `job_id` set, `all_day` defaulting true
- Multiple days per phase supported (e.g. a 3-day field-work stint is 3
  separate rows OR one row with start_time on day 1 + end_time on day 3
  + `all_day=true` — slice decides which based on what reads cleaner on
  the calendar)
- Each saved phase shows up immediately on `/admin/calendar` for everyone
- Source-locked: the slice ships a tiny pure helper
  `buildPhaseEventRow({ jobId, phase, dates, assignee })` that the
  calendar test can lock without spinning up the React form

**C5 shipped 2026-06-16** — day-before + day-of phase reminder cron.
- `lib/calendar/phase-reminder.ts` — pure helpers:
  - `classifyReminder(startTimeIso, now)` returns `'day-of'` /
    `'day-before'` / `null` based on the local-day match in
    America/Chicago (via `Intl.DateTimeFormat('en-CA', { timeZone:
    'America/Chicago' })`).
  - `buildPhaseReminderRow(event, kind)` produces the notify
    payload: 📍 + `'high'` escalation on day-of, 🔔 + `'normal'` on
    day-before. Title format `"<emoji> Today/Tomorrow: <Phase> —
    <JobName>"`. Body includes phase icon + location + notes.
    Link to `/admin/jobs/<id>` when job_id is set, else
    `/admin/calendar` as fallback. `source_type:'schedule_events'`
    + `source_id:event.id` so a future "snooze" UI can target the
    exact event.
  - `buildPhaseReminderRows(events, now)` walks the universe + emits
    one row per qualifying event, drops rows with no `assigned_to`.
  - `PHASE_EVENT_TYPES = ['research','field_work','drawing_deliverables']`
    exported so the cron + the calendar share one source of truth.
- `app/api/cron/phase-reminders/route.ts` — GET endpoint admin-gated
  via `CRON_SECRET` bearer (same pattern as drawing-due-reminder).
  Pulls a ±2 day window of `event_type` ∈ PHASE_EVENT_TYPES and
  `status='approved'`, hands to `buildPhaseReminderRows`, calls
  `notify()` per row sequentially (try/catch so a single bad row
  doesn't sink the rest), returns `{ candidate_events,
  reminders_sent }` so the health dashboard can lock it.
- `vercel.json` registers the cron at `0 13 * * *` (8am Central /
  7am Standard) — same time as the existing drawing-due-reminder
  so morning notifications land together.
- Source-locked by `__tests__/calendar/c5-phase-reminders.test.ts`
  (19 assertions: classification per local day, payload shape per
  kind, link fallback, body assembly, legacy-title fallback, fan-out
  + skip cases, PHASE_EVENT_TYPES contract, cron auth gate, ±2d
  query window, helper handoff, response shape, vercel.json
  schedule registration).

Full suite after C5: 8431 green (+19).

### C5 — Day-before + day-of reminder cron
Fifth slice.

- New cron route at `app/api/cron/phase-reminders/route.ts` — runs daily
  at 6am Central (configured in `vercel.json`)
- Two windows: "events that start tomorrow" + "events that start today"
- For each match, build a notification per assignee via the existing
  `notify()` helper:
  - `type: 'phase.reminder'`
  - title: "🔔 Tomorrow: Field work — Johnson Boundary" (day-before) or
    "📍 Today: Field work — Johnson Boundary" (day-of)
  - body: location + notes if present
  - link: `/admin/jobs/${job_id}`
  - escalation: `'high'` on day-of, `'normal'` on day-before
- Source-locked at the pure-helper boundary
  (`buildPhaseReminderRows(events, now)`) so the test can fake the cron
  clock without invoking the route

### C6 — Lead → Job prefill
Sixth slice. Closes the loop from the previous plan.

- A "Convert to job" button on `/admin/leads/[id]` — already-shipped
  detail page from the previous plan
- Clicking redirects to `/admin/jobs/new?fromLead=<leadId>` with the
  lead id in the query
- `app/admin/jobs/new/page.tsx` reads `?fromLead=`, fetches the lead via
  `/api/admin/leads/[id]`, and prefills:
  - `client_name` ← `lead.name`
  - `email` / `phone` ← `lead.email` / `lead.phone`
  - `survey_type` ← `lead.survey_type`
  - `estimated_acreage` ← `lead.estimated_acreage`
  - `property_address` / `city` / `state` ← lead's property fields
  - `quote_amount` ← `lead.quote_amount` if set
  - `notes` ← lead's notes + a "Converted from lead <referenceNumber>"
    line
- On save, the lead's `converted_job_id` gets set + the lead's status
  flips to `'accepted'` (auto-dismissing the bell notification per the
  Q3b auto-dismiss path)
- Source-locked at the prefill mapper (`buildJobDraftFromLead(lead)`)

## Phase G — Glue + polish

### G1 — Phase-color tokens + status legend
- Add three semantic tokens to `app/styles/tokens.css`:
  - `--color-phase-research: <hex>` (e.g. teal — analytical)
  - `--color-phase-field-work: <hex>` (e.g. amber — outdoors)
  - `--color-phase-drawing-deliverables: <hex>` (e.g. violet — drafting)
- Each event on the calendar carries one of these as a left-border
  accent, matching the leads card pattern from the previous plan
- A small legend at the bottom of the calendar header shows
  what colour means what
- The legend doubles as a per-phase visibility toggle (click research
  → hide all research events) — implementation in C7 if budget allows,
  otherwise deferred to G1b

### G2 — Tests + source-locks
Every slice carries source-lock tests at the office boundary using the
same source-string pattern the previous plan established. No new test
framework. Specific assertions per slice:

- C1: month grid renders 42 days, today gets a distinct outline,
  events link to `/admin/jobs/<id>`
- C2: view switcher persists to `?view=`, prev/next math respects view
- C3: fullscreen API gated by feature detection, auto-refresh interval
  starts only when fullscreen
- C4: `buildPhaseEventRow` mapper invariants per phase
- C5: `buildPhaseReminderRows` invariants — day-before vs day-of
  classification, escalation level, link shape
- C6: `buildJobDraftFromLead` mapper invariants

## Risk register

- **`schedule_events.event_type` accepts free strings today.** Adding
  `'research' | 'field_work' | 'drawing_deliverables'` requires no schema
  change; we just teach the calendar + scheduler UIs to use those values.
  A future cleanup could add a CHECK constraint enumerating allowed
  types — tracked as C4b.
- **Big-screen auto-refresh polling every 5 minutes.** With a few dozen
  events per month + a small team, the load is negligible. If we ever
  scale to 100+ events/month the wall-TV could move to Supabase Realtime
  for push-driven updates — tracked as C3b.
- **Time-zone correctness.** All times stored as `TIMESTAMPTZ` in UTC.
  Display always normalised to America/Chicago (Starr Surveying's HQ).
  The `formatRelativeAge` helper from the previous plan + a new
  `formatScheduleTime` helper enforce this; never use raw `toLocaleString`
  without a `timeZone` option.
- **Long phase names overflowing day squares.** Mitigated by the
  scrollable inner list per C1 + a per-event `title="…full text…"`
  tooltip + a `text-overflow: ellipsis` truncate.

## Slice order (recommended)

1. **C1** — `/admin/calendar` + month view (the visible win)
2. **C4** — per-job phase scheduler (so daddy can ACTUALLY add events)
3. **C2** — week + day views + view switcher
4. **C5** — day-before + day-of reminder cron
5. **C3** — fullscreen + big-screen mode
6. **C6** — lead → job prefill conversion
7. **G1** — phase-color tokens + legend
8. **G2** — any source-lock gaps the slices left behind

**Why C4 before C2:** without the scheduler, the calendar shows nothing.
Ship month-view first so the wiring exists, then immediately ship the
scheduler so we have real data, then ship week + day views (which need
real data to look right). The reminder cron and fullscreen mode are
real-impact features but they assume the calendar has events to point at.

## TL;DR (initial)

| Surface | Status |
|---------|--------|
| `schedule_events` table | **DONE** (pre-existing) |
| `/api/admin/schedule` GET/POST/PATCH/DELETE | **DONE** (pre-existing) |
| Job detail page (click-through target) | **DONE** (pre-existing) |
| Notification dispatch + cron pattern | **DONE** (pre-existing) |
| `/admin/calendar` org-wide month view | **MISSING → C1** |
| Per-job 3-phase scheduler UI | **MISSING → C4** |
| Week + Day views + view switcher | **MISSING → C2** |
| Day-before + day-of phase reminders | **MISSING → C5** |
| Fullscreen + big-screen mode | **MISSING → C3** |
| Lead → job prefill conversion | **MISSING → C6** |
| Phase-color tokens + legend | **MISSING → G1** |
