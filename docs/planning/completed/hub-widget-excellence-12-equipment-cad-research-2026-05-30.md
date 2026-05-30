# Category 12 — Equipment, CAD & Research widgets

*Part of the Hub Widget Excellence plan (`…-00-master-…`). Widgets:
**equipment-out-today, low-consumables, maintenance-due,
vehicles-status, recent-drawings, drawings-in-progress, crew-calendar,
active-research-projects, pipeline-status**. Each: Build/Wire + 4
audit rounds. Note: the **drawings widgets must open a job in the CAD
editor** (`/admin/cad?job={id}`) per the user.*

---

## equipment-out-today
- **Endpoint:** `/api/admin/equipment/today?status=checked-out`.
  Fields: asset_name, checked_out_to, checked_out_at,
  expected_return_at.
- **Track:** asset, who has it, since, expected return, overdue flag.
- **Per-bucket:** tiny → count out; small → asset + who; medium+ →
  + since + expected return + overdue tint.
- **Footer link:** "Go to equipment →" `/admin/equipment/today` (or
  `/admin/equipment`).
- **Row deep link:** asset → `/admin/equipment/{id}`.
- **Editor:** scope (mine/all).
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found the
  widget read a flat `{ equipment }` with `asset_name`/`checked_out_to`,
  but the equipment/today GET returns `{ strips: { out_now: […] } }`
  with `equipment_name` / `checked_out_to_user` / `actual_checked_out_at`
  / `reserved_to` / `equipment_inventory_id`** (so it always rendered
  empty). **Realigned:** the widget reads `strips.out_now` + maps via a
  new pure exported `toEquipmentOut(raw)`. Per-bucket: tiny count, small
  asset + who; **medium+** adds the expected-return date with an
  **overdue** red tint (new pure `isOverdue` helper). **Row deep links**
  to `/admin/equipment/{inventory_id}`. The "Mine" scope filters
  client-side to the caller (`useSession`) since the route returns
  everyone's. Footer "Go to equipment →" is global. 4 new specs (mapper,
  overdue). Full hub suite (1585) green; typecheck + lint clean.
  **equipment-out-today is done.**

## low-consumables
- **Endpoint:** `/api/admin/equipment/consumables?below=…`. Fields:
  name, current_qty, reorder_threshold, unit.
- **Track:** item, current vs threshold, unit, % remaining.
- **Per-bucket:** tiny → count low; small → name + qty/threshold;
  medium+ → + a low bar + unit.
- **Footer link:** "Go to consumables →" `/admin/equipment/consumables`.
- **Editor:** threshold.
- **Notifications:** threshold crossed → reorder reminder (Doc 03).
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found the
  widget read `{ items }` with `current_qty`/`reorder_threshold` but the
  consumables GET returns `{ rows }` with `quantity_on_hand` /
  `low_stock_threshold` / a computed `reorder_badge`** (so it always
  rendered empty), and the `?below=` param was ignored. **Realigned:**
  reads `data.rows` + maps via a new pure exported `toLowConsumable`,
  and filters "low" via a pure `isLow(item, threshold)` that trusts the
  server's `reorder_badge` (reorder_now/soon) OR the at/under-threshold
  compare. Added a **% remaining bar** (new pure `stockPct`) at medium+,
  shows `qty unit / threshold`, and **row deep links** to
  `/admin/equipment/{id}`. Footer "Go to consumables →" is global; the
  reorder reminder fires via `cron/maintenance-schedule-tick` /
  equipment crons (doc-03 audit). 6 new specs (mapper, isLow badge +
  threshold, stockPct). Full hub suite (1591) green; typecheck + lint
  clean. **low-consumables is done.**

## maintenance-due
- **Endpoint:** `/api/admin/equipment/maintenance?due=…`. Fields:
  asset_name, task_type, due_at, status.
- **Track:** asset, task, due, status, overdue.
- **Per-bucket:** tiny → count due; small → asset + due; medium+ →
  + task type + status.
- **Footer link:** "Go to maintenance →" `/admin/equipment/maintenance`.
- **Row deep link:** → `/admin/equipment/maintenance/{id}`.
- **Editor:** dueWithin.
- **Notifications:** maintenance due/overdue reminder (Doc 03).
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found
  `/api/admin/equipment/maintenance` doesn't exist** — the widget always
  404'd → empty. The real endpoint is `/api/admin/maintenance/events`,
  returning `{ events }` enriched with `equipment_name` + `kind`/`state`/
  `scheduled_for`/`next_due_at`/`equipment_inventory_id`. **Realigned:**
  fetch the events endpoint (defaults to open states) + map via a new
  pure exported `toMaintenanceItem` (asset = equipment name, task =
  humanized `kind`, due = `scheduled_for ?? next_due_at`, status =
  `state`); a new pure `filterByDue(items, window)` applies the
  dueWithin (overdue-only / week / month, overdue always counted).
  **Row deep links** to `/admin/equipment/{inventory_id}`. Footer "Go
  to maintenance →" is global; the due/overdue reminder fires via
  `cron/maintenance-schedule-tick` (doc-03 audit). 5 new specs. Full hub
  suite (1596) green; typecheck + lint clean. **maintenance-due is
  done.**

## vehicles-status
- **Endpoint:** `/api/admin/equipment/vehicles?filter=…`. Fields:
  name, status, driver, next_service_at.
- **Track:** vehicle, status, driver, next service.
- **Per-bucket:** tiny → count by status; small → name + status dot;
  medium+ → + driver + next service.
- **Footer link:** "Go to vehicles →" `/admin/vehicles`.
- **Editor:** filter.
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found
  `/api/admin/equipment/vehicles` doesn't exist** (real: `/api/admin/
  vehicles`) AND the `vehicles` table has **no status / driver /
  next_service columns** — only `name` / `license_plate` / `active`. So
  the widget's status-dots/driver/next-service were all phantom (and it
  404'd anyway). Honest realignment: fetch `/api/admin/vehicles`, map
  via a new pure exported `toVehicle` that derives `available`/`offline`
  status from `active`, and a pure `filterVehicles(rows, filter)` (the
  editor is now all / active / inactive — the only states the data
  supports). Rows show the status dot + name + license plate. Footer "Go
  to vehicles →" is global. 4 new specs (toVehicle active-derived status
  + name fallback, filterVehicles). Full hub suite (1599) green;
  typecheck + lint clean. (A real fleet status/driver/service workflow
  would need new `vehicles` columns — flagged.) **vehicles-status is
  done.**

## recent-drawings
- **Endpoint:** `/api/admin/cad/drawings?mine=true`. Fields: name,
  job_name, updated_at, opened_by.
- **Track:** drawing name, job, last updated, who.
- **Per-bucket:** tiny → count; small → name + job; medium+ → +
  updated + opener.
- **Footer link:** "Go to CAD →" `/admin/cad`.
- **Row deep link (KEY):** each drawing opens in the CAD editor with
  its job loaded → `/admin/cad?job={job_id}` (or drawing id param —
  R1 confirms whether CAD opens by job or drawing id). This is the
  user's explicit ask.
- **Editor:** scope (mine/all), rowLimit.
- **Slices:** Build/Wire (the `cadJobHref` row link is the headline) +
  R1–4. R1 must verify the exact CAD open param.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 verified the
  CAD open param** in `app/admin/cad/CADLayout.tsx`: it reads BOTH
  `?job=<id>` (start/load a drawing pre-linked to the job — the user's
  stated form) AND `?drawing=<id>` (a specific saved drawing). R1 data:
  the cad/drawings GET returned `{ drawings }` with `job_id`/
  `created_by`/`updated_at` but NO `job_name`/`opened_by` (which the
  widget read), and **ignored `?mine=true`**. Fixes: the GET now joins
  `jobs(name, job_number)` → flattened `job_name`/`job_number` and
  honors `?mine=true` (`created_by = caller`). The **headline**: each
  drawing row is a `next/link` that opens in CAD with its job loaded via
  a new pure exported `cadOpenHref(d)` → `/admin/cad?job={job_id}` (the
  user's form) when the drawing has a job, else `/admin/cad?drawing=
  {id}`. Realigned to the real fields (joined `job_name`, `updated_at`
  via a `formatAge` helper at large+). Footer "Go to CAD →" is global.
  5 specs. Full hub suite (1577) green; typecheck + lint clean.
  **recent-drawings is done.**

## drawings-in-progress
- **Endpoint:** `/api/admin/cad/drawings?status=in-progress`. Fields:
  name, assigned_to, percent_complete, due_at.
- **Track:** drawing, assignee, % complete, due.
- **Per-bucket:** tiny → count in progress; small → name + % bar;
  medium+ → + assignee + due.
- **Footer link:** "Go to CAD →" `/admin/cad`.
- **Row deep link (KEY):** open in CAD editor → `/admin/cad?job={id}`.
- **Editor:** scope (mine/team), rowLimit.
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found
  `cad_drawings` has no workflow status, assignee, or progress
  columns** — the widget's `assigned_to` / `percent_complete` / `due_at`
  + `?status=in-progress` were all phantom (the % bar never rendered,
  the status filter was ignored). Honest realignment: "in progress" =
  recently-updated drawings (the GET already orders by `updated_at`
  desc; scope 'mine' now filters to the caller via the Slice-fixed
  `?mine=true`). The widget shows the **real** fields — name + joined
  `job_name` + last-updated age — and each row **opens in CAD with its
  job loaded** by reusing recent-drawings' tested `cadOpenHref`
  (`/admin/cad?job={job_id}`). Dropped the phantom progress bar. Footer
  "Go to CAD →" is global. 4 specs (registry, reuses cadOpenHref, no
  `d.percent_complete`, no `?status` param). Full hub suite green;
  typecheck + lint clean. (Real drawing progress/assignee tracking would
  need new `cad_drawings` columns — flagged for a future schema slice.)
  **drawings-in-progress is done.**

## crew-calendar
- **Endpoint:** `/api/admin/personnel/crew-calendar?range=…`. Fields:
  user_email, user_name, day, status, job_name.
- **Track:** per-crew per-day status (on job / off / PTO), job.
- **Per-bucket:** tiny → today's crew count on/off; small → 3-day
  strip; medium+ → full week grid of status dots.
- **Footer link:** "Go to crew calendar →" `/admin/personnel/crew-calendar`.
- **Editor:** weekRange, employeeFilter.
- **Slices:** Build/Wire + R1–4. (Shares the Doc-04 `calendar-math`
  helpers where useful.)

## active-research-projects
- **Endpoint:** `/api/admin/research?status=active`. Fields: name,
  county, status, updated_at.
- **Track:** project, county, status, updated.
- **Per-bucket:** tiny → count active; small → name + county;
  medium+ → + status + updated.
- **Footer link:** "Go to research →" `/admin/research`.
- **Row deep link:** → `/admin/research/{id}`.
- **Editor:** countyFilter.
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** The endpoint was
  right (`/api/admin/research` → `{ projects }` with name/county/status/
  updated_at), but **R1 found `research_projects` has no `'active'`
  status** — it's `upload/configure/analyzing/review/drawing/verifying/
  complete` — so the old `?status=active` exact-match returned nothing,
  and the `?county=` param was ignored. **Realigned:** fetch
  `?status=all` + filter client-side via a new pure exported
  `isActiveProject` (not complete) + a county `includes` match. **Row
  deep links** to `researchProjectHref(id)` → `/admin/research/{id}`;
  medium+ shows the humanized status. Footer "Go to research →" is
  global. 4 specs. Full hub suite (1603) green; typecheck + lint clean.
  **active-research-projects is done.**

## pipeline-status
- **Endpoint:** `/api/admin/research/pipeline`. Fields: name, status,
  started_at.
- **Track:** pipeline run, status, started, failed flag.
- **Per-bucket:** tiny → running/failed counts; small → name + status;
  medium+ → + started + duration.
- **Footer link:** "Go to pipeline →" `/admin/research/pipeline`.
- **Editor:** showFailedOnly.
- **Notifications:** pipeline failed → alert (Doc 03).
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found
  `/api/admin/research/pipeline` was a hardcoded `{ runs: [] }` stub** —
  the contract matched the widget but there was no data, so it always
  showed "Pipelines quiet". There's no dedicated pipeline-run table, but
  each research project IS a pipeline run (its `status` is the workflow
  stage). **Wired the endpoint** to return recent `research_projects`
  mapped to runs via a new pure `lib/research/pipeline-runs.ts`
  (`mapProjectStatusToRun`: complete→success, upload/configure→queued,
  analyzing/review/drawing/verifying→running, unknown→queued — never
  invents a failure — and `toPipelineRun`). The widget now renders real
  runs; added a started-at relative time at medium+ (`formatStarted`).
  Footer "Go to pipeline →" is global. The old stub-endpoints spec
  dropped its pipeline assertion (no longer a stub); 6 new mapper specs.
  Full hub + research suites (1611) green; typecheck + lint clean.
  **pipeline-status is done.**

*(8 of 9 widgets done — crew-calendar remains.)*

## Guardrails
- The CAD open param (`?job=` vs `?drawing=`) is verified in R1 of the
  drawings widgets before shipping the row link — do NOT guess; read
  `app/admin/cad/page.tsx` + how it loads a job.
- Equipment/research deep links must resolve to existing detail routes;
  flag + fallback otherwise.
