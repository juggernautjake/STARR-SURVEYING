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

### Slice 1 — Notification inventory + gap map
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

### Slice 3 — Reminder cadence for due/overdue items
- **Scope:** Where a "due soon / overdue" reminder makes sense
  (assignments-due, class-assignments, maintenance-due, pending-*),
  ensure there's a path that creates a reminder notification (respect
  the existing dedup window). If a scheduled job/cron exists, wire to
  it; if not, document the on-read/on-load reminder approach the
  widgets can trigger. Don't build new infra unless trivially small.
- **Files:** relevant routes/helpers + specs.
- **Done when:** due/overdue items can remind without duplicate spam;
  documented + locked.

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
