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
- **Build/Wire + Round 1 (data) ✅ shipped 2026-05-30.** R1 audit: the
  jobs list query is `.select('*')`, so the user-listed fields are all
  present on the row — customer = `client_name`, quote = `quote_amount`,
  address = `address`, due date = `deadline`, plus `stage`,
  `job_number`, `name`, `updated_at`. Added `due` / `address` / `quote`
  to `JobColumn` + `ALL_JOB_COLUMNS` + the row render (due as a relative
  "overdue Nd / due today / in Nd / short-date" chip that turns red when
  overdue; quote as whole-dollar `$12,500`) + the editor column
  checkboxes + a "Due date (soonest)" sort. **Row deep links:** each row
  is now a `next/link` to `jobHref(job.id)` → `/admin/jobs/{id}` (the
  "drill-in" the user asked for), with an aria-label. **tiny** renders
  a job **count** linking to `/admin/jobs`. **Field-priority:**
  `visibleColumnsForBucket` now uses the doc-02 `pickFields` helper over
  a `COLUMN_PRIORITY` order (name → number → due → stage → client →
  address → quote → updated) with per-bucket caps (small 4 / medium 5 /
  large 7 / xlarge all) — so small shows exactly the user's "name +
  number, due, stage" set and larger sizes add columns as nested
  supersets. The footer "Go to jobs →" link is already wired globally
  (doc-04 Slice 2a). 19 specs (registry, caps, the new field-priority
  progression + importance-ordering, due/created/stage/name/**due**
  sort, labels incl. due/address/quote, formatDue + formatQuote). Full
  hub suite (1537) green; typecheck + lint clean.
- **Rounds 2–4 ✅ shipped 2026-05-30** (the Build/Wire already satisfied
  them; locked with `my-jobs-audit.test.ts`, 6 source-regex specs).
  - **R2 links — verified:** rows are `<Link href={jobHref(job.id)}>` →
    `/admin/jobs/{id}`; the tiny count + the registry footer go to
    `/admin/jobs`. No dead links.
  - **R3 size/format — verified:** the row reads visible columns from
    `visibleColumnsForBucket` → `pickFields(ordered, bucket,
    COLUMN_CAPS)`, and the due-chip (red when overdue) + whole-dollar
    quote formatters are wired in. The tiny→xlarge column progression
    is nested (locked by the Build/Wire specs).
  - **R4 editor + site polish — verified:** the editor maps a checkbox
    over `ALL_JOB_COLUMNS` (so due/address/quote are toggleable) and
    keeps filter / stage / sort / rowLimit / stage-colors. **Stage
    reconciliation:** there's no shared stage palette in the repo — the
    widget's `STAGE_LABELS` cover the canonical `STAGE_ORDER` from
    `app/api/admin/jobs/stages/route.ts` (quote, research, fieldwork,
    drawing, legal, delivery, completed) plus cancelled/on_hold, and
    colors are theme-token tints. A future shared `lib` stage palette
    could DRY the widget + the jobs page, but names already agree — not
    blocking. **my-jobs is done.**

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
- **Build/Wire + Rounds 1–3 ✅ shipped 2026-05-30.** R1 data: the
  assignments GET is `select('*')`, so `job_id` / `module_id` /
  `lesson_id` (+ priority/status/assigned_to) are on the row. **R2
  links:** rows are now `next/link`s via a new exported
  `assignmentHref(task)` → the owning **job** (`/admin/jobs/{job_id}`),
  else its **lesson** (`/admin/learn/modules/{m}/{l}`), else the
  assignments list; footer "Go to assignments →" is global. **R3
  size/format + Build/Wire display:** `formatDue` is now **relative**
  ("overdue Nd / today / in Nd", short date past 2 weeks); a priority
  **dot** (amber high / red urgent) replaces the bare "!"; per-bucket
  field priority — small = title + due + priority, **medium** adds a
  status chip, **large+** adds the assignee (short email). Tiny keeps
  the due/overdue count. The reminder cadence (due-soon/overdue) is
  already wired by doc-03 Slice 3's `assignments-due-reminder` cron. 9
  specs (window filter, due sort, `assignmentHref` job/lesson/list
  fallbacks, relative `formatDue`). Full hub suite (1547) green;
  typecheck + lint clean.
- **Round 4 — editor + polish ✅ shipped 2026-05-30.** Expanded
  `AssignmentsDueSettings` to the full spec: **priority** filter (all /
  high / urgent), **sortBy** (due date / priority), **rowLimit** (1–50,
  clamped), and an **include-completed** toggle (default off → hides
  `status==='completed'`). All four thread through the fetch processing
  (filter → due-window → sort → cap). New pure exported
  `sortAssignments(list, sortBy)` (priority order urgent→high→normal→low
  then due). 2 R4 specs. **assignments-due is done.**

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
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found the
  widget was built against an imagined API** and never actually
  rendered data — three mismatches against the real
  `app/api/admin/jobs/field-data` + `job_field_data` table:
  (1) the GET *required* `job_id` (400 otherwise) but the widget
  defaulted to no job → always empty; (2) the widget read
  `data.captures` but the API returns `{ field_data }`; (3) it used
  `captured_at` / `captured_by` + a fixed `photos|gps|notes|
  measurements` data_type set, but the table has `collected_at` /
  `collected_by` + a free-form `data_type` ('point', …) and **no
  status column**. Fixes:
  - **API (R1/R2):** added a cross-job aggregate branch — when no
    `job_id`, the GET returns the most-recent captures across every job
    (joined with `jobs(name, job_number)`, `limit`-bounded) instead of
    erroring. Per-job callers are unchanged.
  - **Widget (R1/R3):** reads `field_data`, the real columns
    (`collected_at`/`collected_by`/`data_type` + joined `job_name`/
    `job_number`); `iconForType`/`labelForType` are now free-form with a
    survey-point default + a title-cased fallback (legacy 'photos'/'gps'
    inputs still map); per-bucket fields — tiny count, small job+type,
    medium +who, large+ +`formatAge`. **Row deep links** to
    `/admin/field-data/{id}` (the detail route exists).
  - **Editor (R4):** dropped the bogus fixed data-type checkboxes (they
    never matched the data) for a `jobFilter` + `rowLimit` (1–100). The
    footer "Go to field data →" is global.
  - **Notifications:** the table has no review/status column, so
    "pending review" isn't a real state to notify on — flagged; a
    review-workflow + notification would need a schema column (future).
  - 6 specs (icons/labels for legacy + real + fallback types,
    `formatAge`). Full hub suite (1550) green; typecheck + lint clean.
    **field-data-pending is done.**

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
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found the same
  imagined-API break** as field-data: the activity GET *required*
  `job_id` (400 otherwise) so the no-filter default never rendered; the
  widget read `data.items` (API returns `{ activity }`); and `type` was
  expected to be the widget's kind enum but the API emits the **raw
  action string** ('job_file_uploaded', 'job_stage_changed', …), so the
  `activityTypes` filter never matched. Fixes:
  - **API (R1/R2):** added a cross-job aggregate branch — when no
    `job_id`, merge recent `activity_log` (entity_type='job') +
    `job_stages_history` across all jobs, resolve job names in one
    `jobs … .in(ids)` round-trip, synthesize a stable `id`
    (`log-`/`stage-`), attach `job_id`/`job_name`/`job_number`, sort
    newest-first, `limit`-bounded. Per-job callers unchanged.
  - **Widget (R1/R3):** reads `activity`, classifies the raw action via
    a new exported `kindForAction` (stage/file/team/tag → comment
    fallback) for the icon/color + the type filter; renders the
    `detail` ("Stage changed: research → fieldwork") + per-bucket fields
    (tiny count, small label+job, medium +actor, large+ +`formatAge`).
    **Row deep links** to `jobHref(job_id)` → `/admin/jobs/{id}` (or the
    jobs list when unscoped).
  - **Editor (R4):** added a `rowLimit` (1–100); kept the activity-type
    checkboxes + job filter. Footer "Go to jobs →" is global.
  - **Notifications:** the feed *consumes* job_update events (doc-03
    fires them on stage change) — correctly read-only, no double-fire.
  - 5 specs (`kindForAction` over the real actions + fallback,
    `formatAge`). Full hub suite (1553) green; typecheck + lint clean.
    **job-activity-feed is done.**

**Doc 10 complete** — all four work widgets (my-jobs, assignments-due,
field-data-pending, job-activity-feed) through Build/Wire + 4 rounds.
Two were silently broken against imagined APIs (field-data,
job-activity) and now actually render via new cross-job aggregate
endpoints.

---

## Guardrails
- The jobs cluster must agree with the jobs page on stage names +
  stage colors (single source — reuse the jobs stage palette if one
  exists; R4 reconciles).
- Quote/amount may be sensitive — respect any privacy rule the my-pay
  widget already follows if quotes are gated.
- Don't ship dead row links; if a detail route is missing, link the
  list page with a rationale + follow-up note.
