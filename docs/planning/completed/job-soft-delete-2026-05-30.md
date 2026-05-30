# Soft-delete + 30-day recovery (jobs + drawings) — 2026-05-30

*Opened 2026-05-30 in response to the user's brief: "In the all jobs
page and any of the other jobs pages, there needs to be an option to
delete a job. There should be a warning before actually deleting the
job, and then the job should be recoverable for 30 days. Please make
this a reality. Add delete buttons in the appropriate places."*

*Follow-up (2026-05-30): "Please make there be a way to recover
recently deleted jobs and survey drawings." → the recovery surface
must cover BOTH jobs (Slice 1) AND CAD drawings (Slice 2 below).*

## Today's reality (audit, 2026-05-30)

- `jobs` has `is_archived` (archive ≠ delete). The DELETE
  `/api/admin/jobs?id=` handler currently just sets
  `is_archived = true` — there's no true delete + no recovery window.
- The all-jobs page (`/admin/jobs`) renders `JobCard`s with an
  `onClick` that navigates to the detail page; no delete affordance.
- The job detail page (`/admin/jobs/[id]`) has no delete button.
- No purge cron exists.

## Design

- New `jobs.deleted_at TIMESTAMPTZ` column (nullable). `deleted_at`
  is the soft-delete tombstone; `is_archived` stays a separate
  concept (an archived job is still a real job; a deleted one is in
  the trash).
- Every job list **excludes `deleted_at IS NOT NULL`** so a deleted
  job vanishes from the normal + archived views.
- A deleted job is recoverable until `deleted_at + 30 days`. Restore
  sets `deleted_at = null`.
- A daily purge cron hard-deletes rows past the 30-day window.

## Slices

### Slice 1 — Jobs: schema + API + delete buttons + recovery toggle ✅ shipped 2026-05-30

- Migration `seeds/306_jobs_soft_delete.sql`: added `jobs.deleted_at`
  + a partial index (`WHERE deleted_at IS NOT NULL`) for the trash +
  purge-cron scans.
- `DELETE /api/admin/jobs?id=` now sets `deleted_at = now()` (was
  `is_archived = true`) and returns the deleted job's name/number.
- `GET /api/admin/jobs`: default + `?archived=true` lists filter
  `deleted_at IS NULL`; new `?deleted=true` lists the trash
  (newest-deleted first, `deleted_at` in the payload).
- Restore: `PUT /api/admin/jobs` passes body fields through, so
  `{ id, deleted_at: null }` restores — wired into the all-jobs
  "Restore" button.
- UI:
  - All-jobs page: a "🗑 Deleted" toggle swaps the grid/list to the
    trash view; each item overlays a Restore button. Live items
    overlay a 🗑 delete button (rendered as a SIBLING of the card
    button — no nested `<button>`, no click-bubble into navigation).
    Confirm-then-soft-delete via `window.confirm` with explicit
    "recoverable for 30 days" copy.
  - Job detail page: a "🗑 Delete job" button in the header that
    warns, soft-deletes, and routes back to the list.
- New pure `lib/jobs/soft-delete.ts`: `daysUntilPurge`,
  `daysSinceDeleted`, `isRecoverable`, `purgeCutoffIso`,
  `RECOVERY_WINDOW_DAYS` (shared by drawings in Slice 2 + the cron in
  Slice 3). 13 specs.
- typecheck + lint clean.

### Slice 2 — Drawings: soft-delete + recovery ✅ shipped 2026-05-30

- Migration `seeds/307_cad_drawings_soft_delete.sql`: added
  `cad_drawings.deleted_at` + partial index. The drawings DELETE
  previously HARD-deleted the row (unrecoverable) — now a soft delete.
- `DELETE /api/admin/cad/drawings?id=` sets `deleted_at = now()` +
  returns the drawing name; 404s a missing row.
- `GET`: default list filters `deleted_at IS NULL`; new
  `?deleted=true` lists the drawings trash (newest-deleted first,
  with `deleted_at`). The single-drawing fetch is unchanged.
- `PATCH` accepts `{ id, deleted_at: null }` to restore (only the
  null/restore direction; deletes go through DELETE so the tombstone
  is server-stamped).
- UI — `FileManagerDialog`:
  - The "Delete drawing" confirm copy changed from "can't be undone"
    to "recoverable for 30 days from the 🗑 Deleted view".
  - New "🗑 Deleted" toolbar toggle swaps the folder tree + file
    list for a flat trash list; each row shows "{N}d left" (via the
    shared `daysUntilPurge` helper) + a Restore button (PATCH).
- Reuses `lib/jobs/soft-delete.ts` (jobs + drawings share the 30-day
  math). 3534 jobs + hub + cad specs green; typecheck + lint clean.

### Slice 3 — Purge cron (both entities) ✅ shipped 2026-05-30

- New `app/api/cron/purge-deleted/route.ts` at `0 9 * * *` (daily,
  registered in `vercel.json`). Hard-deletes `jobs` + `cad_drawings`
  rows where `deleted_at < purgeCutoffIso(now)` (the shared 30-day
  cutoff helper). Returns `{ cutoff, purged: { jobs, drawings },
  errors }`. Bearer-`CRON_SECRET` auth like the other 8 crons.
- **FK audit done before enabling the hard delete**: every table
  referencing `jobs(id)` (job_team, job_tags, job_contacts,
  job_files, field data points / receipts / equipment events /
  reservations, cad_drawings.job_id) + `cad_drawings(id)`
  (drawing_notes) is `ON DELETE CASCADE` or `ON DELETE SET NULL`, so
  the hard delete cascades cleanly — no blocking child rows. The
  delete is still best-effort (a failure leaves the row in the trash,
  which is safe) and surfaces any error in the response.
- No route-level spec: matching the repo's existing 8 crons (none
  have route tests — they rely on their pure helpers). The cutoff
  math (`purgeCutoffIso`) is already locked by the Slice-1
  soft-delete spec. typecheck + lint clean; `vercel.json` validated.

**Recovery-view polish (ModalFrame confirm + undo toast) — DEFERRED.**
The `window.confirm` warning + the "🗑 Deleted" trash toggles on both
the jobs page and the CAD File Manager already deliver the core ask
(warn before delete, recover within 30 days). A prettier modal + undo
toast is cosmetic; implementation cost exceeds the marginal value, so
it's intentionally left for a future polish pass rather than blocking
this plan's completion.

## Out of scope / placeholder

- Cascading soft-delete of a job's child rows (drawings, receipts,
  time entries). For now those stay; restoring the job restores the
  whole graph since nothing was hard-deleted. The purge cron only
  removes the `jobs` row + DB-level `ON DELETE CASCADE` children —
  audit the FKs in Slice 2 before enabling the hard delete.

## Guardrails

- A deleted job must never appear in a normal list, a widget, or a
  picker. Lists filter `deleted_at IS NULL`.
- Don't hard-delete anything in Slice 1 — only set the tombstone.
- Per slice: typecheck + lint + commit + push + annotate this doc.

## TL;DR

Three slices: jobs soft-delete + API + delete buttons + recovery
toggle (Slice 1, shipped); the same for CAD drawings (Slice 2,
the recover-drawings follow-up); a daily purge cron enforcing the
30-day window for both, plus optional modal/undo polish (Slice 3).
