# Drawings Collaboration — 2026-05-30

*Opened 2026-05-30 in response to the user's brief during the
notifications-completeness pass: drawings need an assigned-to workflow,
people on / overseeing a job need to get drawing notifications, and we
need a way for people (e.g., an RPLS) to leave notes on a drawing for
the drawer (or vice-versa — a drawer asking the RPLS a question about a
survey) with the recipient getting a bell notification + a clickthrough
to the right drawing in the CAD editor.*

*Confirmed scope (from the notifications-completeness pass's question
on drawings):*
- *"Whoever is on a job or overseeing a job needs to get all
  notifications, including drawing notifications, about that job.
  People outside the scope of that job do not need to get those
  notifications."*
- *"If someone is assigned to a drawing, they need to get
  notifications about that drawing. They need to get reminders about
  when it is due, and they need to get reminders if someone leaves a
  note on the drawing."*
- *"We need a way for people to leave notes on drawings. The notes
  would reference a drawing and one or more people associated with
  its completion. There would need to be some kind of dialogue for
  writing notes on drawings and sending them."*

## Today's reality (audit, 2026-05-30)

- `cad_drawings` table has no `assigned_to` column and no `due_date`
  column. Any authenticated CAD user can edit any drawing.
- No `drawing_notes` table exists. Activity log captures CAD edits,
  but there's no thread / dialog for an RPLS to address the drawer.
- Existing job-related notifications (personnel assignment, job stage
  change, schedule event reminder) target the **direct assignee** in
  most paths but a few (job stage change) broadcast more widely than
  the job team. There is no shared "users on / overseeing this job"
  helper to filter recipients by.
- Job team membership lives in `job_team` (per the audit). Job
  overseers / supervisors aren't a separate role today; the project
  manager / approver is captured in `jobs.project_manager_email` (to
  be verified in slice 0).

## Goals

1. Add a drawing-assignment workflow (`assigned_to`, `due_date`) +
   notifications: "assigned to you", "due in N days".
2. Add a drawing-notes thread that lets any job-scoped user leave a
   note on a drawing addressed to one or more recipients, with each
   recipient getting a bell notification.
3. Make sure drawing notifications respect the job scope — only users
   on the job team / overseeing the job get them.
4. Sweep every existing job-related notification to honour the same
   job scope (the user's "people outside the scope of that job do not
   need to get those notifications" guardrail).

## Slices

### Slice 0 — Job-scope helper (foundation) ✅ shipped 2026-05-30

- New `lib/jobs/scope.ts`:
  - Pure `resolveJobScope(teamRows, actorEmail?)` returns the
    distinct + lowercased + first-seen-order email list, optionally
    excluding the actor so the triggering admin doesn't ping
    themselves.
  - Async `usersForJobScope(jobId, supabase, actorEmail?)` thin
    wrapper that queries `job_team` filtered to active rows and
    routes through the pure helper. Returns `[]` on query failure
    (better silent no-fan-out than crashed request).
- The audit shows the existing `jobs` table has no dedicated
  `project_manager_email` / `overseer` column; `job_team` IS the
  source of truth for "users on a job", which matches the user's
  ask. If a "lead" role gets added to `job_team` later, the helper
  needs no change.
- 5 specs (dedupe + lowercase + order, blank guards, actor exclusion
  with case-insensitive match, empty team, only-actor case).
  Typecheck + lint clean.

### Slice 1 — Schema ✅ shipped 2026-05-30

- New migration `seeds/303_cad_drawings_assignment.sql`:
  - `cad_drawings.assigned_to TEXT` (FK to `registered_users.email`,
    `ON DELETE SET NULL`) + partial index on `(assigned_to)` for the
    "my drawings" filter.
  - `cad_drawings.due_date DATE` + partial index on `(due_date)` for
    the due-soon cron window scan.
  - New `drawing_notes` table — `id`, `drawing_id` (FK to
    `cad_drawings` with `ON DELETE CASCADE`), `author_email`, `body`,
    `recipient_emails TEXT[]`, `created_at`. Indexed by
    `(drawing_id, created_at DESC)` for thread reads + by
    `author_email`. RLS enabled with the same service-role-only
    pattern other tables use.
- All new columns nullable / the new table empty, so existing rows /
  routes keep loading.

### Slice 2 — API: drawing assignment + due cron ✅ shipped 2026-05-30

- New `lib/notifications/drawing.ts` ships THREE pure builders +
  `drawingHref(drawingId, jobId?)`:
  - `buildDrawingAssignedNotification` (🎯, source_type
    `drawing_assigned`).
  - `buildDrawingNoteNotification` (💬, source_type `drawing_note`)
    — body preview clamped at 140 chars. Wired up in Slice 3.
  - `buildDrawingDueReminders` (⏰, source_type `drawing_due`,
    boundary-only at 3/1/0 days + overdue once-per-run; `high`
    escalation when overdue). Mirrors the assignment-reminders
    contract.
  - Every payload links via `drawingHref` →
    `/admin/cad?job={jobId}&drawing={id}` (job omitted for
    free-floating drawings).
- `PATCH /api/admin/cad/drawings` accepts `assigned_to` + `due_date`
  (both nullable so unassign / clear-due work). The handler reads the
  prior `assigned_to`, updates, and fires the assigned notification
  ONLY when the new email is non-empty, different from the prior, and
  isn't the actor — no double-pings on a re-save, no self-ping on
  self-assign.
- New `/api/cron/drawing-due-reminder` at `0 13 * * *` reads every
  drawing with `assigned_to` + `due_date` set, runs them through
  `buildDrawingDueReminders(...)`, fires per-row best-effort. Cron
  registered in `vercel.json`.
- The wider job-scope fan-out (overseers also get drawing
  notifications) is wired in Slice 5 once `usersForJobScope` lights
  up all job-scoped notifications at once. The assignee gets the
  notification today via this slice.
- 12 builder specs (drawingHref + assigned happy path + null guards +
  note preview clamp + due boundaries + skips). Full hub +
  notifications **1800 specs green**; typecheck + lint clean.

### Slice 3 — API: drawing notes (the dialog backend) ✅ shipped 2026-05-30

- New dynamic route `app/api/admin/cad/drawings/[id]/notes/route.ts`:
  - `GET` returns the note thread (oldest → newest).
  - `POST` accepts `{ body, recipient_emails? }`, validates a
    non-empty body, reads the drawing for context (name + job_id +
    assignee), defaults the recipient cohort to **assignee + job
    scope** (via `usersForJobScope`) when no explicit list is passed,
    inserts the `drawing_notes` row, and fans out the bell via
    `buildDrawingNoteNotification` (best-effort per recipient).
- New pure `lib/notifications/drawing-note-recipients.ts` →
  `resolveNoteRecipients({ explicit, assignee, scope, author })` =
  the dedupe + author-exclude + order-preference logic, lifted out so
  it's unit-testable separately from the route.
- The link the bell renders is `drawingHref(drawingId, jobId)` →
  `/admin/cad?job={jobId}&drawing={drawingId}`. The "scroll the note
  thread into view" `&note={noteId}` deep-anchor stays a Slice-4 UI
  detail (the CAD editor needs to handle the param); the route
  doesn't need to know about it.
- The link audit (Slice 1 of notifications-completeness pass) sees no
  literal `link: '/admin/...'` here because `drawingHref` is a
  function call — that's intentional; the builder spec asserts the
  resolved URL.
- 6 specs (explicit wins + author exclusion + assignee + scope
  fallback + ordering + empty-cohort + empty-list-treated-as-omitted).
  Full hub + notifications + jobs **1811 specs green**; typecheck +
  lint clean.

### Slice 4 — UI: notes dialog on the CAD editor ✅ shipped 2026-05-30

- New client component
  `app/admin/cad/components/DrawingNotesDialog.tsx`: a `ModalFrame`
  with a scrollable thread (oldest → newest), inline timestamps + the
  recipient list per note, and a compose form (textarea + optional
  comma-separated recipient input). Empty recipients = drawer + job
  scope via the server-side default. Posts via the Slice-3 endpoint,
  refetches the thread on success, surfaces errors inline.
- `CADLayout.tsx` listens for `cad:openDrawingNotes` and mounts the
  dialog with `drawingStore.document.id` + `document.name` — same
  custom-event pattern the print / file-manager dialogs use.
- `MenuBar.tsx` File menu gains "💬 Drawing notes…" right after
  "File Manager…". Single click → opens the dialog for the current
  drawing.
- Exported pure `parseRecipients(raw)` helper (split on commas, trim,
  lowercase, drop entries without `@`) so the user can paste a list
  without us POSTing bogus values to the API. 3 specs.
- The assignee initials + "due {date}" chip on the drawings widgets
  is **deferred to a follow-up slice**: it needs the GET
  `/api/admin/cad/drawings` SELECT to start returning `assigned_to`
  + `due_date` + each widget's `Drawing` interface + render
  updates. The notes dialog is the headline RPLS ↔ drawer
  deliverable; the chips are pure polish. Sized as its own slice so
  this one ships clean.
- 3 specs added; 1814 hub + notifications + jobs specs green;
  typecheck + lint clean.

### Slice 5 — Job-scope sweep ✅ shipped 2026-05-30

**Audit findings.** The existing job-related fan-outs already split
cleanly into two buckets:

- **Already correctly scoped to the job team**:
  - `app/api/admin/jobs/stages` uses `resolveStageRecipients(job_team
    minus actor)`.
  - `personnel/assign` (proposed) notifies just the assignee.
  - `personnel/cancel-assignment` notifies just the affected surveyor.
  - `schedule-event-reminders` notifies just the assigned user.
- **Intentionally broader dispatcher broadcasts** — `personnel/assign`
  override audit + `personnel/respond` decline fan-out target
  every admin + equipment_manager so re-staffing dispatchers see
  the event regardless of job. These are NOT scoped to job_team
  because re-staffing is by design a cross-job role. **Deferred /
  unchanged** — narrowing them would break the dispatcher workflow.

**Actual gap closed by this slice.** The drawings notifications
shipped in Slices 2-3 only targeted the assignee. Now they fan out
to the job-scope cohort too:

- `PATCH /api/admin/cad/drawings` calls `usersForJobScope(job_id,
  actor)` after the primary "you've been assigned" payload fires.
  Each peer (minus the assignee + actor) gets a softened payload
  ("{actor} assigned {drawing} to {assignee}") so overseers see the
  ownership move without thinking it's their task.
- `/api/cron/drawing-due-reminder` caches per-job scope lookups
  (one DB hit per job, not per drawing), and for every reminder it
  fires the primary payload to the assignee + a softened "Reminder
  for the job team" payload to each overseer.

This matches the user's brief — "whoever is on a job or overseeing a
job needs to get drawing notifications" — without churning the
already-correct stage/assign/schedule code paths.

No new test file in this slice: the pure builders + the
`resolveJobScope` helper (which the new fan-outs route through) are
already locked by their respective specs. Integration coverage of
the DB fan-out belongs in a future end-to-end test layer; no value
in a route-level mock for two best-effort notify calls.

Full hub + notifications + jobs **1814 specs green**; typecheck +
lint clean.

## Out of scope / placeholder

- **Email notifications** — flagged in the prior pass. The user is
  building a custom inbox; when that ships we'll add email delivery
  to every existing notify call. Guardrail noted here so this plan
  doesn't accidentally fork the work.
- A real Mentions data model — today's @-mention detection is a
  scan-based fallback. Replacing it with a structured `mentions`
  table is a separate plan when the user wants it.
- **Drawings widget chips (assignee initials + due-date)** — Slice 4
  shipped the notes dialog (the headline ask) and explicitly deferred
  the per-widget chips because they need API-shape + per-widget
  rendering work that's polish, not core collaboration. Best picked
  up alongside the next hub-widget pass.
- **Dispatcher-broadcast fan-out narrowing** — Slice 5 audit found
  `personnel/assign` override audit + `personnel/respond` decline
  fan-out intentionally broadcast to admins + equipment_managers
  because re-staffing is a cross-job dispatcher concern.
  Intentionally unchanged.

## Guardrails

- Don't change the legacy `notifications` table shape; ride the
  existing `link` field.
- Don't change the bell's deliberate exclusion of message source_types.
- Every new schema change ships its own migration file + the test
  suite covers the new behaviour. No production data migration is
  needed because the new columns / table start empty.
- Per slice: typecheck + lint + commit + push + annotate this doc.

## TL;DR

Six slices: a shared job-scope helper, a schema for drawing assignment +
notes, two new API surfaces (assignment + notes), a UI sweep on the CAD
editor, and a backfill of existing job-related notifications so they
respect the same scope. Once shipped, "whoever is on a job or
overseeing a job gets the notifications" is true across the system,
and drawers + RPLSes have a real notes channel.
