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

### Slice 2 — Drawings: soft-delete + recovery (the follow-up ask)

- Audit `app/api/admin/cad/drawings` DELETE: today it hard-deletes
  the row. Add `cad_drawings.deleted_at` (migration) + switch DELETE
  to set the tombstone.
- GET list excludes `deleted_at IS NOT NULL`; add `?deleted=true`
  for the drawings trash. Restore = PATCH `{ id, deleted_at: null }`.
- UI: a delete control on the recent-drawings surface + a "🗑
  Deleted" recovery view mirroring the jobs page, restore per row.
  Reuse `lib/jobs/soft-delete.ts` window helpers (jobs + drawings
  share the same 30-day math).
- Tests: drawings list-filter + restore behavior.

### Slice 3 — Purge cron (both entities) + recovery-view polish (optional)

- New `/api/cron/purge-deleted` at a daily schedule: hard-delete
  jobs AND cad_drawings where `deleted_at < purgeCutoffIso(now)`.
  Best-effort per row; returns counts. Register in `vercel.json`.
  Audit `ON DELETE CASCADE` FKs before enabling the hard delete.
- Optional: replace the `window.confirm` warning with the project's
  `ModalFrame` confirm + an undo toast ("Moved to trash · Undo").
  Defer unless the user wants the polish — the confirm + trash
  toggle already deliver the core ask.

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
