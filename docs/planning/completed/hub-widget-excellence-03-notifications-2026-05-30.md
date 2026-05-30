# Foundation 03 — Notification system audit + wiring

*Part of the Hub Widget Excellence plan (`…-00-master-…`). The user
wants the notification system "all hooked up correctly to properly
remind students and workers of important updates, notifications,
messages and the like" and to "track work flow."*

## Verified current state

Two parallel systems:

1. **Legacy `notifications` table.** `lib/notifications.ts` factory +
   typed helpers (`notify`, `notifyMany`, `notifyJobAssignment`,
   `notifyTaskAssignment`, `notifyLessonComplete`, `notifyQuizResult`,
   `notifyHoursDecision`, `notifyPaymentUpdate`, `notifyStudyReminder`,
   …). API `/api/admin/notifications` (GET list ?limit=&unread=,
   PUT mark read/dismiss/mark_all_read, POST admin-send). UI
   `app/admin/components/NotificationBell.tsx` (polls every 20s,
   excludes direct/group messages). Shape: `{ id, type, title, body,
   icon, link, is_read, is_dismissed, created_at, escalation_level,
   source_type, source_id, thread_id }`. Has dedup for log_hours /
   submit_week (30-min window) + optional `expires_at`.

2. **SaaS `org_notifications` table.** `lib/saas/notifications/in-app.ts`
   write adapter + `/api/admin/org-notifications` (GET / PATCH read /
   DELETE). Shape: `{ id, type, severity, title, body, actionUrl,
   actionLabel, readAt, createdAt }`.

## Goal

Make sure the events that the hub widgets represent actually FIRE
notifications through the right system, and that the bell + reminders
reflect them — so the widgets + the notification system tell a
consistent workflow story. This doc is an **audit + wiring** pass, not
a rebuild.

## Slices

### Slice 1 — Notification inventory + gap map ✅ shipped 2026-05-30
- **Scope:** Document (in this doc) every widget-relevant event that
  SHOULD notify, the helper that should fire it, and whether it's
  currently wired. Read the create/update API routes behind each
  actionable widget:
  - assignment created/assigned/due-soon → `notifyTaskAssignment` /
    `notifyStudyReminder`
  - message received / mention → message-notification path (bell
    excludes these; confirm FloatingMessenger/unread counts cover it)
  - hours submitted / approved / rejected → `notifyHoursDecision`
  - receipt submitted / approved → payment/approval notification
  - time-off requested / decided → approval notification
  - pay updated → `notifyPaymentUpdate`
  - lesson complete / quiz result → `notifyLessonComplete` /
    `notifyQuizResult`
  - job stage change / assignment → `notifyJobAssignment` / job_update
  - maintenance/consumable threshold crossed → system/reminder
  Produce a table: event → helper → wired? → gap.
- **Files:** this doc (the gap map) + read-only audit notes.
- **Done when:** the gap map is complete + checked against the live
  API routes.

#### Gap map (audited 2026-05-30 against the live routes)

Headline finding: **a whole tier of typed `notify*` helpers is defined
in `lib/notifications.ts` but never called anywhere** — confirmed by
`grep -rln` across `app/` + `lib/`:
`notifyHoursDecision`, `notifyPaymentUpdate`, `notifyRaise`,
`notifyBonus`, `notifyJobAssignment`, `notifyJobStageUpdate`,
`notifyTaskAssignment`, `notifyLessonComplete`, `notifyModuleComplete`,
`notifyQuizResult`, `notifyStudyReminder` all have **zero call sites**.
The wiring exists for equipment/personnel/learning-assignment/employee
events but NOT for the hours/pay/receipts/time-off/job-stage/study
workflow the user called out ("remind students and workers").

| Event | Helper | Wired? | Mutation route / gap |
|---|---|---|---|
| Crew/personnel assigned + responded | `notify`/`notifyMany` | ✅ | `personnel/assign`, `personnel/respond`, `personnel/cancel-assignment` |
| Equipment checkout/checkin/reserve/borrow + overdue | `notify`/`notifyMany` | ✅ | `equipment/*` + `cron/equipment-overdue-*` |
| Maintenance schedule tick | `notify`/`notifyMany` | ✅ | `cron/maintenance-schedule-tick` |
| Learning assignment created | `notifyLearningAssignment` | ✅ | `learn/assignments` POST |
| ACC enrollment | `notifyACCEnrollment` | ✅ | `learn/assignments`, `learn/credits` |
| Employee account change | `notifyEmployee` | ✅ | `employees/manage` |
| **Hours approved/rejected** | `notifyHoursDecision` | ❌ | `time-logs/approve` sets `status` but never notifies the submitter — **GAP (Slice 2, high value)** |
| **Receipt approved/rejected** | `notifyPaymentUpdate` | ❌ | `receipts/[id]` PATCH + `receipts/bulk-approve` — **GAP (Slice 2)** |
| **Time-off approved/denied** | (approval) `notifyFromAdmin`/`notifyPaymentUpdate`-style | ❌ | `time-off` PATCH (`approved`/`denied`) — **GAP (Slice 2, high value)** |
| **Pay raise / bonus / pay update** | `notifyRaise`/`notifyBonus`/`notifyPaymentUpdate` | ❌ | `payroll/raises` (+ bonuses/advances) — **GAP (Slice 2)** |
| **Job stage change** | `notifyJobStageUpdate` | ❌ | `jobs/stages` + `jobs` PUT — **GAP (Slice 2)** |
| **Direct job assignment** | `notifyJobAssignment` | ⚠️ partial | `personnel/assign` fires the base `notify`, but not the typed job-assignment helper/link — refine in Slice 4 |
| **Task assignment created** | `notifyTaskAssignment` | ❌ | `assignments` POST never notifies the assignee — **GAP (Slice 2)** |
| **Lesson / module complete** | `notifyLessonComplete`/`notifyModuleComplete` | ❌ | `learn/progress`, `learn/user-progress` — **GAP (Slice 2, students)** |
| **Quiz result** | `notifyQuizResult` | ❌ | `learn/quizzes` (+ `learn/progress`) — **GAP (Slice 2, students)** |
| **Study reminder (due/overdue)** | `notifyStudyReminder` | ❌ | no reminder path exists — **GAP (Slice 3)** |
| Message received / @mention | (bell excludes these) | ⚠️ | `NotificationBell` deliberately excludes direct/group msgs; unread is the messenger's own count — **reconcile in Slice 4** |

**Slice 2 wiring targets (prioritized):** `time-logs/approve`,
`time-off` PATCH, `receipts/[id]` + `receipts/bulk-approve`,
`jobs/stages`, `assignments` POST, `learn/progress` /
`learn/user-progress` / `learn/quizzes`, `payroll/raises`. Each fires
on a genuine transition only and reuses the existing typed helper +
its dedup.

### Slice 2 — Wire the highest-value missing notifications
- **Scope:** For the gaps that matter most to "remind students and
  workers" (study reminders, hours/receipt/PTO decisions, job stage
  changes, message/mention unread), add the `notify*` calls at the
  server mutation points (the API routes that create/update those
  records). Keep each change minimal + idempotent (respect existing
  dedup). Don't spam — fire on meaningful transitions only.
- **Files:** the relevant `app/api/admin/**/route.ts` files,
  pure-unit specs on any extracted notification-payload builders.
- **Done when:** the prioritized events fire notifications; specs lock
  the payload builders. (Multiple sub-slices allowed; keep each green.)

#### Sub-slice progress
- **2a — Hours approved/rejected ✅ shipped 2026-05-30.**
  `time-logs/approve` POST now notifies the submitter after the bulk
  status update. Extracted a pure, dependency-free builder
  `lib/notifications/hours-decision.ts` →
  `buildHoursDecisionNotifications(rows, approved)` that groups the
  updated `daily_time_logs` rows **by submitter** (so a week-long bulk
  approve is ONE bell per worker, not seven), sums hours, and labels
  the span as the single date or "N entries". The route maps each
  payload through `notify` (best-effort try/catch so a notification
  failure can't fail the approval). 5 specs lock the builder (approve
  + reject copy/icon, per-user grouping + hour-summing + date/"N
  entries" labeling + has/have grammar, skip-no-email + missing-hours,
  empty input). typecheck + lint clean.
- **2b — Time-off approved/denied ✅ shipped 2026-05-30.** `time-off`
  PATCH now notifies the requester (`assigned_to`) after the decision.
  Pure builder `lib/notifications/time-off-decision.ts` →
  `buildTimeOffDecisionNotification(request, approved)` returns the
  payload (approve ✅ / deny 🚫 copy, timezone-stable ISO date-range
  body that collapses a single day, link `/admin/time-off`,
  `source_type: 'time_off_decision'`) or null when there's no
  requester. Fired best-effort before the PTO-balance deduction. 5
  specs (approve/deny copy, multi-day range, single-day collapse, no
  range when start missing, null when no requester). typecheck + lint
  clean.
- **2c — Receipt approved/rejected ✅ shipped 2026-05-30.** Both the
  per-row `receipts/[id]` PATCH (fires on the `approved`/`rejected`
  transitions only — reopen-to-pending + field edits stay silent) and
  the `receipts/bulk-approve` POST (now selects `submitted_by, vendor,
  total` on the update so each approved submitter gets a bell) notify
  the receipt's `submitted_by`. Pure builder
  `lib/notifications/receipt-decision.ts` →
  `buildReceiptDecisionNotification(receipt, 'approved'|'rejected')`
  composes "Your $42.50 receipt from {vendor} was approved/rejected."
  (amount via `total.toFixed(2)`, vendor optional, rejection reason
  appended), link `/admin/receipts`, `source_type: 'receipt_decision'`,
  or null when no submitter. Both call sites best-effort. 5 specs
  (approve w/ amount+vendor, reject w/ reason, missing amount/vendor,
  string-total coercion, null submitter). typecheck + lint clean.
- **2d — Job stage change ✅ shipped 2026-05-30.** `jobs/stages` POST
  now notifies the job's crew when the stage genuinely changes. The
  route fetches `job_team.user_email` for the job and passes them
  through the existing `notifyJobStageUpdate(recipients, jobNumber,
  jobId, from, to)` helper (`🔄 Job {num}: {from} → {to}`, link
  `/admin/jobs/{id}`). Pure helpers `lib/notifications/job-stage.ts`:
  `resolveStageRecipients(teamEmails, actor)` (dedupe case-insensitive,
  drop empties + the actor) and `isStageTransition(from, to)` (guards
  the no-op "set to same stage"). Best-effort. 7 specs (actor excluded
  + case-insensitive, dedupe/empties, actor-only → empty; real change
  vs no-op vs missing-stage). typecheck + lint clean.
- **2e — Task assignment created/reassigned ✅ shipped 2026-05-30.**
  Correction to the gap map: `assignments` POST *did* already notify the
  assignee, but via a hand-rolled inline insert that ignored priority +
  due date. Replaced it with the typed pure builder
  `lib/notifications/assignment.ts` →
  `buildAssignmentNotification(row)` (`📋 New Assignment: {title}`,
  body `Priority: {p} · Due {YYYY-MM-DD}`, escalation tracks priority,
  `source_type: 'task_assignment'`, link `/admin/assignments`, null
  without assignee/title). Also wired the PUT: when an **admin
  reassigns** (sets a new `assigned_to`), the new assignee is notified;
  status-only edits (a worker completing their own task) stay silent.
  Removed the now-unused `fireAndForget` import. 4 specs (priority +
  due-date body + escalation, urgent/normal escalation, due omitted,
  null without assignee/title). typecheck + lint clean.
- **2f — Quiz result ✅ shipped 2026-05-30.** `learn/quizzes` POST now
  tells the learner their result after the graded `quiz_attempts` row is
  saved. Pure builder `lib/notifications/quiz-result.ts` →
  `buildQuizResultNotification(attempt)` (🏆 Passed / 📝 Did not pass at
  the `QUIZ_PASS_THRESHOLD = 70`, score clamped 0–100 + rounded, body
  "Score: N%. Great job! / Keep studying…", link
  `/admin/learn/quiz-history`, `source_type: 'quiz_result'`) + a
  `quizLabel(type, category)` helper (exam category → exam-prep →
  lesson). Best-effort. 5 specs (pass/fail copy, label derivation,
  clamp/round/default, null without learner). typecheck + lint clean.
- **2g — Lesson complete ✅ shipped 2026-05-30.** `learn/progress` POST
  now celebrates the learner the FIRST time they finish a lesson. The
  route checks for an existing `user_progress` row BEFORE the idempotent
  upsert (so re-marking doesn't re-fire), then on a genuine first
  completion resolves the `learning_lessons.title` + `learning_modules
  .title` and notifies. Pure builder
  `lib/notifications/lesson-complete.ts` →
  `buildLessonCompleteNotification({ user_email, lesson_title,
  module_title })` (`✅ Lesson Complete: {lesson}`, body drops the "in
  {module}" clause when the module title is absent, generic "a lesson"
  fallback, link `/admin/learn/roadmap`, `source_type:
  'lesson_complete'`, null without learner). Best-effort. 4 specs
  (lesson + module, no module, generic fallback, null learner).
  typecheck + lint clean. (Module-complete — fire when the LAST lesson
  of a module is done — needs an all-lessons-done count; folded into
  the Slice-3 reminder/cadence work or a later pass.)
- **2h — Pay rate change ✅ shipped 2026-05-30.** `payroll/raises` POST
  now tells the employee about their rate change. Pure builder
  `lib/notifications/pay-raise.ts` →
  `buildPayRaiseNotification({ user_email, new_rate, previous_rate,
  effective_date })` is transition-aware: an **increase** reads "🎉 You
  got a raise!" (new + previous rate + effective date), a **decrease**
  or a no-previous-rate **first set** reads a neutral "💵 Pay rate
  updated/set", and a **no-op** (same rate) produces nothing. Coerces
  string rates, links `/admin/my-pay`, `source_type: 'pay_raise'`, null
  without user/new-rate. Best-effort. 5 specs (raise, decrease,
  first-set vs prev-0-is-raise, no-op null, string coercion + null
  guards). typecheck + lint clean.

**Slice 2 complete** — all 8 prioritized gaps wired (hours, time-off,
receipts ×2 routes, job-stage, task-assignment ×2 transitions, quiz,
lesson, pay). 40 notification builder specs green across 8 files. Bonus
notifications proper (separate `pay_bonuses` flow) deferred — the raise
path is the high-value pay event; a dedicated bonus route wiring can
reuse this pattern if/when the per-category money-widget doc needs it.

### Slice 3 — Reminder cadence for due/overdue items ✅ shipped 2026-05-30
- **Scope:** Where a "due soon / overdue" reminder makes sense
  (assignments-due, class-assignments, maintenance-due, pending-*),
  ensure there's a path that creates a reminder notification (respect
  the existing dedup window). If a scheduled job/cron exists, wire to
  it; if not, document the on-read/on-load reminder approach the
  widgets can trigger. Don't build new infra unless trivially small.
- **Files:** relevant routes/helpers + specs.
- **Done when:** due/overdue items can remind without duplicate spam;
  documented + locked.
- **Audit:** maintenance-due already reminds via
  `cron/maintenance-schedule-tick` (60/30/7-day boundary-only firing);
  equipment overdue via `cron/equipment-overdue-nag` + `-digest`. The
  gap was **assignments due/overdue** (the student/worker nudge).
- **Shipped:** new `cron/assignments-due-reminder` daily cron (Vercel
  cron registered in `vercel.json` at `0 13 * * *`, same
  `Bearer CRON_SECRET` auth as the others). It scans pending
  assignments with a due date and fires reminders built by the pure
  `lib/notifications/assignment-reminders.ts`:
  `daysUntilDue(date, nowMs)` (UTC-date math, timezone-stable) +
  `buildAssignmentReminders(rows, nowMs, boundaries?)`. **Boundary-only
  firing** (`DUE_SOON_BOUNDARIES = [3, 1, 0]`) means a not-yet-due item
  reminds only when days-until-due lands exactly on a boundary, so one
  daily run = at most one reminder per assignment (no spam); overdue
  items remind once per daily run with high escalation. Payloads
  address the assignee, label due-today/due-soon/overdue (singularized
  "1 day"), carry `source_type: 'assignment_due'` + `source_id` (the
  assignment id, so the bell can dedup), and link `/admin/assignments`.
  The cron is best-effort per reminder. 8 specs (daysUntilDue math +
  null, boundary firing on/off, labels + escalation, singularization,
  payload shape, skip non-pending/no-assignee/no-id/dateless).
  typecheck + lint clean; vercel.json valid.

### Slice 4 — Bell ↔ widget consistency audit
- **Scope:** Confirm the bell's links + the widgets' deep links agree
  (a job-assignment notification's `link` should match the widget's
  row href). Confirm unread counts surfaced by communication widgets
  (messages, mentions, announcements) reconcile with the
  notification/unread sources. Fix mismatches.
- **Done when:** notification links + widget links are consistent;
  unread counts reconcile. Then this doc → `completed/`.

## Guardrails
- Server mutations only fire notifications on genuine transitions;
  honor existing dedup so we don't regress into noise.
- Don't change notification table schemas; use the existing helpers +
  adapters. If a new helper is needed, add it to `lib/notifications.ts`
  in the established style.
- Never notify about another org's/user's data; respect tenancy.
