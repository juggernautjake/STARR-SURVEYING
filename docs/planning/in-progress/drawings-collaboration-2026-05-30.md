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

### Slice 0 — Job-scope helper (foundation)

- Pure `lib/jobs/scope.ts` → `usersForJobScope(jobId, supabase)` →
  `string[]` of emails: the job's team members (from `job_team`) +
  the job's project manager / approver / overseers (from `jobs`).
- Job-stage notification today fans out widely; slice this in so we
  can pass `usersForJobScope(jobId)` to `notifyMany(...)` instead of
  the existing audit-cohort.
- Used by every slice below.

### Slice 1 — Schema

- Add `cad_drawings.assigned_to` (text, nullable, FK to `registered_users.email`)
  + `cad_drawings.due_date` (date, nullable). Migration in
  `seeds/NNN_cad_drawings_assignment.sql`.
- Create `drawing_notes` table: `id uuid pk`, `drawing_id uuid` (FK),
  `author_email text` (FK), `body text not null`, `recipient_emails text[]`,
  `created_at timestamptz default now()`. Migration in
  `seeds/NNN_drawing_notes.sql`.
- No data migration — both fields are nullable / the new table is
  empty.

### Slice 2 — API: drawing assignment + due cron

- `PATCH /api/admin/cad/drawings/{id}` accepts `assigned_to` +
  `due_date` updates.
- Add `notifyDrawingAssigned` + `notifyDrawingDue` pure builders
  (`lib/notifications/drawing.ts`) → link
  `/admin/cad?job={jobId}&drawing={id}`. The assigned-to fan-out
  also notifies job overseers per `usersForJobScope`.
- New cron `/api/cron/drawing-due-reminder` at `0 13 * * *` mirrors
  the assignment-due cron — boundary-only firing at 3 / 1 / 0 days.
- Register in `vercel.json`.

### Slice 3 — API: drawing notes (the dialog backend)

- `POST /api/admin/cad/drawings/{id}/notes` body
  `{ body, recipient_emails }` — inserts the note + fires a notify to
  each recipient. Notification: title "💬 Note on {drawing} from
  {author}", body preview, link
  `/admin/cad?job={jobId}&drawing={id}&note={noteId}` so the editor
  can scroll the note thread into view.
- `GET /api/admin/cad/drawings/{id}/notes` returns the thread.
- Recipients default to "anyone on the drawing scope" (drawer +
  overseers) if the body omits `recipient_emails`.

### Slice 4 — UI: notes dialog + assignment chip on the CAD editor

- Add a "💬 Notes" button to the CAD editor toolbar that opens a
  side panel listing the thread + a compose form.
- Compose form: free-text body + a multi-select recipient picker
  (defaults: the drawer + job overseers, removable).
- Drawing list (the my-jobs / drawings-in-progress widgets + the
  CAD landing page) shows the assignee initials + a "due {date}" chip
  when set.

### Slice 5 — Job-scope sweep of existing notifications

- Audit every existing notify call that fans out to multiple users
  for a job event (job stage change, personnel assignment override,
  schedule event reminder for a job-tied event). Replace the
  recipients list with `usersForJobScope(jobId)` so the bell stays
  scoped.
- Updates `__tests__/notifications/notify-links-audit.test.ts` (Slice 1
  of the prior pass) is unchanged — links don't move.
- Add a `__tests__/jobs/scope.test.ts` for the new helper.

## Out of scope / placeholder

- **Email notifications** — flagged in the prior pass. The user is
  building a custom inbox; when that ships we'll add email delivery
  to every existing notify call. Guardrail noted here so this plan
  doesn't accidentally fork the work.
- A real Mentions data model — today's @-mention detection is a
  scan-based fallback. Replacing it with a structured `mentions`
  table is a separate plan when the user wants it.

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
