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

## vehicles-status
- **Endpoint:** `/api/admin/equipment/vehicles?filter=…`. Fields:
  name, status, driver, next_service_at.
- **Track:** vehicle, status, driver, next service.
- **Per-bucket:** tiny → count by status; small → name + status dot;
  medium+ → + driver + next service.
- **Footer link:** "Go to vehicles →" `/admin/vehicles`.
- **Editor:** filter.
- **Slices:** Build/Wire + R1–4.

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

## Guardrails
- The CAD open param (`?job=` vs `?drawing=`) is verified in R1 of the
  drawings widgets before shipping the row link — do NOT guess; read
  `app/admin/cad/page.tsx` + how it loads a job.
- Equipment/research deep links must resolve to existing detail routes;
  flag + fallback otherwise.
