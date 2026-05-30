# Hub Widget Excellence — Master plan + conventions

*Opened 2026-05-30. The umbrella plan for making every hub widget as
useful, correct, and well-formatted as possible "in the light of the
entire website." This doc defines the shared conventions, the
per-widget audit cadence, and the global ordering. The numbered
sibling docs (`hub-widget-excellence-01…20-*`) carry the actual
slices; the stop hook works through them alphabetically.*

## What the user asked for (condensed from the 2026-05-30 brief)

- Evaluate every widget's utility + layout; make sure each links to
  the right pages and tracks everything it's meant to track.
- **Jobs widget** → a "Go to jobs" button to `/admin/jobs`; track job
  number, name, customer, quote, address, due date, stage (+ more);
  show the most important subset when small (name + number, due date,
  stage).
- **Drawings widget** → open a listed job/drawing in the CAD editor
  with that job loaded (`/admin/cad?job={id}`).
- **Quick Actions** → better formatting; easy to choose which actions
  show; render as many as fit for the widget size.
- **Schedule widget** → access a calendar + render one when size
  allows; interactive (add events, set reminders/notifications);
  size-aware.
- **Most widgets** get a "Go to…" link to the page that deals with
  what the widget represents (finance → finance page, calendar →
  scheduling page, etc.). Not all, but most.
- Notifications: make sure the notification system properly reminds
  students + workers of updates, messages, etc. Track workflow.
- **Editing menu per widget** must be specialized for that widget,
  look great, and be easy to use.
- **Roles:** show ALL the user's roles as colored pills below the
  greeting (contrast-aware text). Remove the role selector next to the
  Enter Work Mode button.
- **Enter Work Mode:** clicking it prompts for the role being worked
  under (entering work mode ≠ clocking in) AND surfaces clock-in
  status with "Clock in now?" / "Stay clocked out" — unless already
  clocked in, then assume working.
- Build it all in slices, with **≥ 4 review/refactor rounds per
  widget**, so the stop hook can grind through everything.

## The 41 widgets (by category)

- **work** (4): my-jobs, assignments-due, field-data-pending, job-activity-feed
- **time-pay** (3): my-pay, hours-this-week, pto-balance
- **financial** (2): monthly-revenue, outstanding-invoices
- **office** (3): pending-hours, pending-receipts, pending-time-off
- **equipment** (4): equipment-out-today, low-consumables, maintenance-due, vehicles-status
- **cad** (3): recent-drawings, drawings-in-progress, crew-calendar
- **research** (2): active-research-projects, pipeline-status
- **learning** (6): class-assignments, recommended-lessons, roadmap-progress, flashcards-due, quiz-history, streak-counter
- **communication** (4): messages, open-discussions, mentions-inbox, recent-announcements
- **operational** (2): mileage-tracker, team-status
- **personal** (8): today-schedule, quick-actions, pinned-pages, bookmarks, recent-activity, weather, sun-calculator, daily-briefing

## Verified facts (from the 2026-05-30 audit)

- **Routes exist** for essentially every destination (170+ pages):
  `/admin/jobs` + `/admin/jobs/{id}`, `/admin/cad?job={id}`,
  `/admin/finances`, `/admin/schedule`, `/admin/messages` +
  `/admin/messages/{conversationId}`, `/admin/discussions`,
  `/admin/receipts`, `/admin/mileage`, `/admin/time-off`,
  `/admin/hours-approval`, `/admin/billing/invoices`,
  `/admin/reports`, `/admin/learn/*` (roadmap, modules/{id}/{lessonId},
  flashcards, quiz-history, knowledge-base), `/admin/equipment/*`,
  `/admin/vehicles`, `/admin/team` + `/admin/team/{email}`,
  `/admin/research` + `/admin/research/pipeline`, `/admin/profile`,
  `/admin/my-pay`, `/admin/my-hours`, `/admin/my-jobs`. The per-widget
  docs cite the exact route. Any route that turns out NOT to exist is
  flagged in that widget's Round-2 audit and either built or the link
  is pointed at the closest real page with an inline rationale (don't
  ship dead links).
- **Notifications** are two-tier: the legacy `notifications` table
  (`/api/admin/notifications`, `lib/notifications.ts` with
  `notify*()` helpers, `NotificationBell`) + the SaaS
  `org_notifications` table (`/api/admin/org-notifications`,
  `lib/saas/notifications/in-app.ts`). Doc 03 audits both.
- **Jobs** table has `name, job_number, client_name, address, stage`
  (+ `job_team`, `job_tags`). Quote/amount needs verification per the
  my-jobs Round-1 audit.
- **Schedule** API already supports `GET ?from=&to=` + `POST` create
  with `{ title, start_time, end_time, event_type, all_day, location,
  notes, job_id, color, recurrence_rule, … }` — the calendar
  build-out (Doc 04) has a real backend.
- **Grid is 8×12**, free placement + single-click add + drag-move +
  push-resize all shipped (the grid system is done — this plan only
  touches the widgets themselves, per the user).
- **Size buckets** exist: `lib/hub/size-bucket.ts` (`sizeBucket(w,h)`
  → tiny / small / medium / large / xlarge) + `useElementSize`. All
  widgets already branch on bucket; this plan upgrades WHAT they show
  per bucket (field priority), not the tiering mechanism.
- **Per-widget options**: 29 widgets ship a `SettingsForm`; 12 use the
  schema registry (`lib/hub/widget-options.ts`) rendered by
  `SchemaOptionsForm`. The Slice-11 `WidgetOptionsPanel` hosts
  Size + Header color + Title + the widget's own content controls.

## The Widget Excellence Checklist

Every widget, when "done," must satisfy ALL of:

1. **Data completeness** — fetches/derives everything it's meant to
   track (per its spec in the category doc). No placeholder/stub data
   left where a real endpoint exists.
2. **Correct links** — a "Go to…" footer link to the page that owns
   the widget's domain (where it makes sense), AND row-level deep
   links where each row maps to a detail page (job → `/admin/jobs/{id}`,
   drawing → `/admin/cad?job={id}`, message → `/admin/messages/{id}`,
   lesson → `/admin/learn/modules/{id}/{lessonId}`, etc.). No dead
   links.
3. **Size-responsive field priority** — at every supported size the
   widget looks intentional: tiny = the single most important stat;
   small = the 2–4 highest-priority fields; medium/large/xlarge =
   progressively more columns/rows/detail. No clipping or overflow.
   Each category doc specifies the per-bucket field priority.
4. **Specialized editor** — the widget's options section in
   `WidgetOptionsPanel` exposes exactly the controls that widget
   needs, well-grouped, with good labels/defaults, and previews where
   useful. Looks polished + is easy to use.
5. **States** — loading skeleton, empty state (helpful, not blank),
   and error state (graceful, retryable where possible).
6. **Notifications** — where the widget represents actionable work
   (assignments due, messages, hours/receipts/PTO to approve, pay
   updates, study reminders), the underlying events fire notifications
   through the Doc-03 system so the bell + reminders stay in sync.
7. **Accessibility** — semantic markup, aria labels on interactive
   bits, keyboard-reachable links/controls, sufficient contrast.

## The standard 4-round audit cadence

Each widget gets a **Build/Wire slice** (bring it up to the checklist)
followed by **four audit rounds**. The per-category docs reference
these by name and add only widget-specific notes. Each round is its
own slice (typecheck + lint + commit + push + annotate). A round may
be a no-op IF the prior round genuinely covered it — but the auditor
must read the live widget code and write a one-line "verified: …" note
proving it looked, not just skipped.

- **Round 1 — Data & correctness.** Re-read the widget + its endpoint.
  Does it fetch/track every field the spec lists? Are field names +
  types correct against the real API/table? Fix wrong/missing data,
  wrong endpoints, wrong query params. Add the fields the spec wants
  that aren't there yet. Lock with a content/resolver spec.
- **Round 2 — Links & navigation.** Verify the "Go to…" footer link
  points at the correct, existing route. Verify row-level deep links.
  Verify "see more" goes to the right place. Fix/flag dead links.
- **Round 3 — Size & formatting.** Walk every bucket (tiny → xlarge).
  Confirm the field-priority spec is honored, nothing clips, the
  loading/empty/error states render well at each size. Tighten
  typography + spacing.
- **Round 4 — Editor & whole-site polish.** Verify the specialized
  options editor is complete + looks good + is easy. Re-check the
  widget against the entire site's conventions (does it duplicate a
  page? is the deep-link target the canonical one? is the notification
  hook present where relevant?). Final a11y + visual pass.

## Global ordering (how the stop hook should march)

The numeric doc prefixes drive alphabetical order:

- `00` (this doc) — conventions only, no slices; the hook skips to 01.
- `01` — greeting roles-as-pills + work-mode role/clock-in prompt.
- `02` — shared infra (WidgetGoToLink, field-priority helper, editor
  framework polish, the widget→route link registry).
- `03` — notification system audit + wiring.
- `04` — interactive calendar / schedule build-out.
- `10`–`20` — the per-category widget docs (work first, personal last).

Each per-category doc is self-contained: build/wire + 4 audits per
widget. When all slices in a doc are shipped, move it to
`completed/` per `docs/planning/README.md`.

## Guardrails

- This plan touches widgets + the greeting/work-mode surface ONLY. Do
  NOT regress the shipped grid system (8×12, free placement,
  single-click add, drag-move, push-resize). Those docs are in
  `completed/`.
- Don't ship dead links. If a target route doesn't exist, either build
  the minimal page or point at the closest real page with an inline
  rationale + a follow-up note.
- Pure helpers stay unit-tested; widget bodies + editor wiring lock via
  `fs.readFileSync` source-regex + content-resolver pure-unit specs
  (the zustand/SSR snapshot-caching limitation blocks interactive
  store-mutation render assertions).
- Each slice: typecheck + lint clean, its own test, commit + push,
  annotate its doc. List touched files explicitly. No `--no-verify`,
  no force-push, no `git add -A`.
- Saved-layout shape is unchanged (`{x,y,w,h,customization}`); old
  layouts keep loading via the Slice-5 normalizer.
- Don't change any user's role/workspace; don't delete data; confirm
  before any destructive action.

## TL;DR

16 ordered planning docs. Foundations (01–04) fix the page-level
roles/work-mode surface + build the shared widget infrastructure +
audit notifications + build the interactive calendar. Then 11
per-category docs (10–20) take every one of the 41 widgets through a
Build/Wire slice + 4 audit rounds against the Widget Excellence
Checklist, so each widget tracks the right data, links to the right
pages, formats well at every size, and has a polished specialized
editor.

## Final status ✅ Hub Widget Excellence done — 2026-05-30

Every sibling doc is in `docs/planning/completed/`:

- **01 Greeting roles + work-mode prompt** — roles render as
  contrast-aware colored pills below the greeting; the Enter Work Mode
  button prompts for the role under which the surveyor is working AND
  surfaces clock-in status with "Clock in now?" / "Stay clocked out"
  (or assumes working when already clocked in).
- **02 Shared infra** — `WidgetGoToLink`, the `WIDGET_LINKS` registry
  + `widgetGoToTarget` (later joined by `_shared/route-resolve` for the
  nav-fed widgets), row-href builders (`jobHref` / `cadJobHref` /
  `conversationHref` / `lessonHref` / `equipmentHref` / `teamMemberHref`
  / `researchProjectHref`), `field-priority` (`pickFields` +
  `DEFAULT_FIELD_CAPS`), the shared `ordered-list` helpers
  (`moveUp`/`moveDown`/`addOrdered`/`removeOrdered`/`unselectedOptions`/
  `normalizeOrdered`), the `orderedmultiselect` schema field type, and
  the `WidgetFrame goTo` slot wired through `WidgetGrid`.
- **03 Notifications** — gap map + 8 wired notifications +
  assignment-due cron + bell↔widget consistency.
- **04 Calendar** — `calendar-math`, `CalendarGrid`, `AddEventForm` /
  `schedule-payload`, event-reminder cron, today-schedule editor.
- **10 Work widgets** (4): my-jobs, assignments-due, field-data-pending,
  job-activity-feed.
- **11 Money widgets** (5): my-pay, hours-this-week, pto-balance,
  monthly-revenue, outstanding-invoices.
- **12 Equipment / CAD / research / operational** (9):
  equipment-out-today, low-consumables, maintenance-due,
  vehicles-status, recent-drawings, drawings-in-progress, crew-calendar,
  active-research-projects, pipeline-status.
- **13 Learning widgets** (6): class-assignments, recommended-lessons,
  roadmap-progress, flashcards-due, quiz-history, streak-counter — the
  user's "make sure the academic widgets all work too" — R1 found
  **five of six broken** and fixed each honestly (two missing endpoints
  built, three response-shape realignments, one wrong param/field).
- **14 Comms & team widgets** (5): messages, open-discussions,
  mentions-inbox, recent-announcements, team-status — every list row
  now deep-links and every widget reads its real data source.
- **15 Personal & utility widgets** (8): quick-actions (capacity-fill +
  reorderable picker — the headline overhaul), pinned-pages,
  bookmarks, recent-activity, weather (keyless Open-Meteo),
  sun-calculator (pure NOAA sunrise math), daily-briefing (4 live
  sections), mileage-tracker (self-scoped `?summary=1` mode).

**41 widgets** through Build/Wire + 4 audit rounds each. Three former
stub endpoints wired to real data (weather, sun, team-status). Three
new pure-helper libraries shipped (`lib/weather/*`, `lib/sun/*`,
`lib/mileage/*`). The full hub vitest suite ended at **1668 specs
green**, all on the `claude/gifted-ramanujan-lQaEI` branch with
typecheck + lint clean throughout. The grid system itself was left
untouched per the user's "the grid is great — make the widgets
themselves as good as possible" framing.

The Stop hook can route to the QA phase now — this conventions doc
goes to `completed/` as the final move.
