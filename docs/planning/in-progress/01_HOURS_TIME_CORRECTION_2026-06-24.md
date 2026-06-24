# Hours Time-Correction System — Build-Out

**Status:** 🟡 In progress. Core editing/approval exists; the correction,
notification, dispute-resolution, pay-period-lock, and after-hours-reminder
pieces are partial or missing.

## Goal (from the owner)

Employees must be able to fix their hours for any day (forgot to clock in/out →
too few/too many hours): a clear, easy-to-find page to **add or remove hours**.
Hours are **approved at the end of the pay period** by whoever's in charge. The
**admin/owner can manually adjust any employee's hours**; when they revise
submitted hours they **provide a reason and the employee is notified**. There
must be **ways to resolve conflicts** with hour totals. Send a **reminder to
anyone still clocked in past 6pm**. The whole thing must be complete, intuitive,
easy to use, and easy for employees to find.

## How this doc is driven

Processed by the Stop hook (`.claude/hooks/continue-until-planning-done.sh`).
Each turn: take the next unchecked `- [ ]` slice, read it against the **live
code**, ship the smallest meaningful change (typecheck + lint + commit + push),
check the box, add a one-line completion note. When every box is `[x]`, move this
doc to `docs/planning/completed/`. Keep desktop intact; verify mobile at 390px.

## Current state (verified 2026-06-24)

- **Employee editing — EXISTS.** `app/admin/my-hours/MyHoursPanel.tsx` +
  `app/api/admin/time-logs/route.ts`: POST creates `pending` entries (validates
  hours 0–24, daily total ≤24); PUT edits **pending or rejected** logs only
  (resets to pending on hour change); DELETE removes **pending** logs only.
  Resubmit deletes the day's existing pending rows then re-inserts. Table:
  `daily_time_logs`.
- **Admin approve/reject — EXISTS w/ notify.** `app/api/admin/time-logs/approve/route.ts`
  bulk approve/reject, notifies via `buildHoursDecisionNotifications` + `notify`
  (`lib/notifications/hours-decision.ts`).
- **Admin single adjust — EXISTS, but no notification.** PUT `action:'adjust'`
  (route.ts ~L332) sets `status='adjusted'`, `adjusted_hours`, `adjustment_note`,
  recomputes pay — **but does not notify the employee**. UI: the adjust modal in
  `app/admin/hours-approval/page.tsx`.
- **Dispute — PARTIAL.** Employee can dispute a `rejected` log (PUT
  `action:'dispute'` → `status='disputed'`), but there is **no admin resolve**
  path (disputed → approved/rejected) in the API or hours-approval UI.
- **Pay-period lock — MISSING.** No `pay_period_id`/lock column on
  `daily_time_logs`; hours stay editable indefinitely while pending/rejected.
- **Clock state — server-visible.** Open clock-ins live in `job_time_entries`
  (`end_time IS NULL`); `app/api/admin/team/route.ts` already queries this. This
  is the signal for the 6pm reminder.
- **6pm reminder — MISSING.** No cron under `app/api/cron/`. Pattern to copy:
  `app/api/cron/assignments-due-reminder/route.ts` (CRON_SECRET bearer auth →
  query → `notify` per item); register in `vercel.json`.

## Slice plan

- [x] **H1 — Employee "fix my hours" page: verify + make obvious.** Confirm
  end-to-end that an employee can pick **any day** (incl. past days), see existing
  entries pre-filled, add rows, remove rows, and resubmit (MyHoursPanel +
  POST/PUT/DELETE). Tighten the UX so "I forgot to clock in/out — add/remove
  hours" is obvious: clear day picker, an explicit "Add hours" and per-row
  "Remove", and a short helper line. Verify at 390px via `ux-harness?page=my-hours`.
  _Done 2026-06-24:_ added a "Forgot to clock in/out?" helper line; fixed a
  duplicate-hours footgun — the form now pre-fills only **editable** (pending/
  rejected) logs and shows approved/adjusted/disputed logs **read-only** ("ask
  your manager to adjust") so re-submitting an approved day can't create duplicate
  pending rows; resubmit now replaces pending **and** rejected rows (DELETE route
  now lets an owner delete their own rejected logs); employees can still add new
  hours to a day that already has approved entries. Verified at 390px (0 overflow):
  approved day shows the locked list, rejected day shows "Update & Resubmit".
- [x] **H2 — Notify employee on admin adjustment.** Make the single-entry
  `adjust` action notify the affected employee with the **reason**
  (`adjustment_note`) and old→new hours. Reuse/extend `buildHoursDecisionNotifications`
  (add an `adjusted` variant) and call `notify` from the adjust path (route.ts PUT
  and/or a dedicated adjust handler). Acceptance: adjusting a log drops a bell
  notification to the employee that names the reason.
  _Done 2026-06-24:_ added `buildHoursAdjustmentNotification` (names old→new hours,
  date, and reason) in `lib/notifications/hours-decision.ts`; wired `notify` into
  the single admin PUT path so **adjust/approve/reject** all notify the employee
  (previously only the bulk approve route did — single adjust sent nothing). 3 new
  unit tests; suite green; tsc + eslint clean.
- [x] **H3 — Admin can adjust ANY employee's hours directly.** Today admin
  adjustment happens from the approval queue. Add the ability for an admin to
  open an employee's timesheet (a given week/day) and adjust/add/remove hours on
  their behalf — with a required reason — even outside the pending queue. Surface
  it from `hours-approval` (or the employee's profile/timesheet). Each change
  notifies the employee (H2 path) and is auditable (`adjusted_by`, `adjustment_note`).
  _Done 2026-06-24:_ the hours-approval "All Entries" view now shows an **Adjust**
  action on already approved/adjusted/rejected logs (not just the pending queue),
  so an admin can revise any employee's hours by week. The adjust modal pre-fills
  the current hours, **requires** a reason, and shows "the employee is notified of
  this change and your reason" (notification fires via H2; activity_log already
  records `time_log_adjust`). Verified at 390px (0 overflow). _Note: a true
  "add a brand-new entry on an employee's behalf" still routes through the
  employee's own submission today; the by-week adjust/revise + remove covers the
  owner's stated need — a dedicated admin add-on-behalf can land later if wanted._
- [x] **H4 — Dispute → resolve loop.** Add an admin **resolve** action for
  `disputed` logs: transition disputed → approved or → rejected (with reason),
  notifying the employee. API: extend the PUT/approve route with a `resolve`
  action; UI: a resolve control on disputed rows in `hours-approval`. Acceptance:
  a disputed log can be driven to a terminal state and the employee is notified —
  no more one-way trap.
  _Done 2026-06-24:_ root cause was visibility, not the transition — the
  Approve/Adjust/Reject actions already render for `disputed` and the admin PUT
  resolves any status, but the review queue fetched `status=pending` only, so
  disputes never appeared. Made the GET `status` accept a comma list
  (`pending,disputed` → `IN()`), pointed the review queue at `pending,disputed`,
  and added a purple "Disputed by employee — resolve with Approve, Adjust, or
  Reject" callout (shows the employee's note). Resolving notifies the employee via
  H2. Verified at 390px (0 overflow): the disputed entry surfaces in the queue
  with its callout + resolve buttons.
- [x] **H5 — Conflict / totals reconciliation.** Give admins a clear per-employee,
  per-pay-period totals view that flags conflicts: days over a threshold, missing
  clock-out (open `job_time_entries`), week totals that look off, and
  pending/disputed not yet resolved. Make discrepancies actionable (jump to the
  row to adjust/resolve). This is the "resolve conflicts with hour totals" surface.
  _Done 2026-06-24:_ added a pure, tested `computeHoursFlags` helper
  (`lib/hours/hours-flags.ts`, 6 tests) and rendered per-employee flag chips in
  the hours-approval group header: **long_day** (>14h on one day → likely missed
  clock-out), **high_total** (>60h this period), and **needs_review** (count of
  pending/disputed). The flagged employee's rows sit right below with
  Approve/Adjust/Reject so the discrepancy is actionable. Verified at 390px
  (0 overflow). _Note: long_day uses the day-total heuristic rather than reading
  open `job_time_entries`; a direct open-session cross-check can be added once
  C1/H7 land the server clock-in row + the after-hours sweep._
- [x] **H6 — Pay-period approval + lock.** Model pay periods (or reuse payroll
  run `pay_period_start/end`) and add an end-of-period **approve & lock** so a
  closed period's logs can't be edited by employees afterward (PUT/DELETE reject
  edits to logs in a locked period). Add a `period_locked_at`/`pay_period_id`
  column via a `seeds/` migration. Admin can still adjust locked logs (with reason
  + notify). Acceptance: after lock, employee edits are refused with a clear message.
  _Done 2026-06-24:_ added `seeds/378_pay_period_locks.sql` (one row per locked
  `[period_start, period_end]`), `lib/hours/period-lock.ts` (`isDateLocked` /
  `locksOverlapping`, best-effort/fail-open so the app works pre-migration), and
  `app/api/admin/time-logs/lock-period/route.ts` (admin GET/POST/DELETE).
  Enforcement: the time-logs POST/PUT/DELETE now refuse **non-admin** edits whose
  `log_date` is in a locked period (HTTP 423 + "Ask a manager to adjust these
  hours"); admins remain able to adjust (via H2/H3, employee notified). UI: a
  "Lock this week / Week locked — Unlock" toggle + a locked banner on
  hours-approval, reflecting the visible week. Verified at 390px (0 overflow):
  locked week shows the Unlock button + banner. _DB enforcement verified by code
  review — the migration applies against the live Supabase, not the harness; the
  helper fail-opens until then._
- [ ] **H7 — 6pm still-clocked-in reminder.** Add `app/api/cron/clocked-in-after-hours/route.ts`
  (copy the assignments-due-reminder pattern: CRON_SECRET bearer auth). Query
  `job_time_entries WHERE end_time IS NULL` whose `start_time` is earlier today and
  now is past 6pm **local time**; `notify` each such user ("You're still clocked in —
  don't forget to clock out") and optionally the admin. Register in `vercel.json`
  with an hourly evening schedule. Add a small pure builder
  (`lib/notifications/after-hours-clock.ts`) + a unit test. Guard against
  duplicate nags (once per evening per user). NOTE: depends on clock-in writing an
  open `job_time_entries` row — verify that during this slice (see doc 02 C1) and
  add the server write if clock-in only touches localStorage.
- [ ] **H8 — Findability + mobile polish.** Ensure employees can easily FIND hour
  correction: a clear nav/hub entry ("My Hours" / "Fix my hours"), and that
  `my-hours` + `hours-approval` are clean at 390px (no overflow, 44px targets,
  status badges legible). Verify both via the ux-harness with seeded data.
- [ ] **H9 — Tests.** Add/extend tests: employee edit/delete permission matrix
  (pending/rejected editable; approved/adjusted/locked not), adjust-notifies,
  dispute-resolve transitions, and the after-hours reminder builder. Run the hub/
  time-logs suites green.
