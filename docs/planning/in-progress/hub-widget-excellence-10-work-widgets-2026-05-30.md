# Category 10 — Work widgets

*Part of the Hub Widget Excellence plan (`…-00-master-…`). Widgets:
**my-jobs, assignments-due, field-data-pending, job-activity-feed**.
Each gets a Build/Wire slice + the 4 audit rounds defined in the
master. Routes + the shared `WidgetGoToLink` / `widget-links` / 
`field-priority` helpers come from Foundation docs 01–04.*

---

## my-jobs

- **Endpoint:** `/api/admin/jobs?my_jobs=true&limit=…` (reads the
  hub-data aggregator when settings match defaults). Jobs table has
  `name, job_number, client_name, address, stage` (+ `job_team`,
  `job_tags`); quote/amount/due_date availability to confirm in R1.
- **Track (the full set the user listed + sensible extras):** job
  number/id, job name, customer (client_name), quote/amount, address,
  due date, current stage, + assigned crew, last-updated, tag/flags.
- **Per-bucket field priority** (use `field-priority` helper):
  - tiny → count of my jobs (or the single most-due job's stage).
  - small → name + number, due date, stage.
  - medium → + customer, + a stage color chip.
  - large → + address, + quote, + updated.
  - xlarge → full table (every column) + crew avatars.
- **Footer link:** "Go to jobs →" `/admin/jobs`.
- **Row deep link:** each row → `/admin/jobs/{id}`.
- **Editor (specialized):** filter (mine/all/stage), stage select,
  column checkboxes (number, customer, quote, address, due, stage,
  updated), sortBy (due/updated/stage/name), rowLimit, showStageColors.
  (Most of this exists — R4 makes it complete + good-looking.)
- **Notifications:** job stage change / new assignment → bell (Doc 03).
- **Slices:** Build/Wire (add the quote/customer/address/due fields +
  the footer link + row deep links + bucket field-priority), then
  Round 1 (data: confirm jobs API exposes quote/amount + due_date;
  add if missing or flag), Round 2 (links: `/admin/jobs` + row
  `/admin/jobs/{id}`), Round 3 (size/format: the tiny→xlarge column
  progression, no clip), Round 4 (editor + site polish + stage-color
  consistency with the jobs page).

---

## assignments-due

- **Endpoint:** `/api/admin/assignments?mine=true`. Fields: `{ id,
  title, due_date, status, assigned_to, priority }`.
- **Track:** title, due date, status, priority, assigned-to, +
  (R1) the linked job/lesson if any.
- **Per-bucket priority:** tiny → count due; small → title + due +
  priority dot; medium → + status; large+ → + assigned-to + relative
  due ("in 2d" / "overdue").
- **Footer link:** "Go to assignments →" `/admin/assignments`.
- **Row deep link:** assignment → its detail/owning page (R2 finds the
  canonical target; likely `/admin/assignments` filtered or the job/
  lesson it belongs to).
- **Editor:** assignedTo, dueWithin, includeCompleted, priority filter,
  sortBy, rowLimit.
- **Notifications:** due-soon / overdue reminders (Doc 03 cadence).
- **Slices:** Build/Wire (footer link + bucket priority + relative-due
  + priority chip) + Rounds 1–4.

---

## field-data-pending

- **Endpoint:** `/api/admin/jobs/field-data?status=pending`. Fields:
  `{ id, job_id, job_name, data_type, captured_by, captured_at }`.
- **Track:** job, data type, who captured, when, + pending age.
- **Per-bucket priority:** tiny → count pending; small → job name +
  data type; medium → + captured-by; large+ → + captured-at + age.
- **Footer link:** "Go to field data →" `/admin/field-data`.
- **Row deep link:** → `/admin/field-data/{id}` (verify) or the owning
  job `/admin/jobs/{job_id}/field`.
- **Editor:** jobFilter, dataTypes checkboxes, sortBy, rowLimit.
- **Notifications:** new field data pending review (Doc 03).
- **Slices:** Build/Wire + Rounds 1–4.

---

## job-activity-feed

- **Endpoint:** `/api/admin/jobs/activity?job_id=…`. Fields: `{ id,
  type, label, actor, at, job_id, job_name }`.
- **Track:** activity type, label, actor, time, job.
- **Per-bucket priority:** tiny → latest activity one-liner; small →
  label + relative time; medium → + actor; large+ → + job name +
  type icon + grouping by day.
- **Footer link:** "Go to jobs →" `/admin/jobs` (or, when scoped to
  one job, `/admin/jobs/{job_id}`).
- **Row deep link:** activity → its job `/admin/jobs/{job_id}` (+ the
  specific record where one exists).
- **Editor:** jobFilter, activityTypes checkboxes, rowLimit, group-by-
  day toggle.
- **Notifications:** consumes job_update events (don't double-fire).
- **Slices:** Build/Wire + Rounds 1–4.

---

## Guardrails
- The jobs cluster must agree with the jobs page on stage names +
  stage colors (single source — reuse the jobs stage palette if one
  exists; R4 reconciles).
- Quote/amount may be sensitive — respect any privacy rule the my-pay
  widget already follows if quotes are gated.
- Don't ship dead row links; if a detail route is missing, link the
  list page with a rationale + follow-up note.
