# Notifications Completeness Pass — 2026-05-30

*Opened 2026-05-30 in response to the user's brief: "make sure that
notifications work across the site … message, briefing, upcoming job,
drawing, assignment due, grade recorded, email received, module/lesson
assigned, payout received, pay raise earned, role change, or anything
like that … make sure that the notification is formed correctly and
that it shows up in the widgets as well as the notification bell.
Make sure that the user can click it and be directed to the correct
location on the website." Scope confirmed via clarifying questions
(2026-05-30):*

- *Keep current bell↔messages split — messages stay in the messages
  widget so counts don't double-up.*
- *Ship payout-received notifications.*
- *Ship the daily briefing morning cron, with the briefing covering
  notes from the boss / coworker / teacher AND tasks due today AND
  tasks due in the next 5 business days.*
- *Skip "email received" — no email-receipt infrastructure exists yet
  (placeholder when the custom inbox ships).*
- *Drawings are a bigger feature: an "assigned to" workflow + a notes
  dialog (RPLS leaves an instruction for the drawer, drawer asks a
  question of the RPLS) + scoping every existing job-related
  notification to only fire for users on / overseeing that job.
  **Queued as a separate `drawings-collaboration` plan that lands in
  `in-progress/` at the end of this pass** so the stop hook works
  through it after these four slices.*

## Today's reality (audit, 2026-05-30)

**19 notifications already wired** (per the audit performed today):
personnel assignment proposed / override / responded / cancelled,
equipment checkout, equipment overdue (nag + digest), maintenance
schedule tick, hours approved/rejected, time-off approved/denied,
receipt approved/rejected, job stage change, task assignment created /
reassigned, assignment due (1/3/0-day cron), quiz result, first-time
lesson complete, pay raise / rate change, learning assignment created,
ACC course enrollment, employee account change, learning module
override, scheduled event reminder.

**Bell + widget coverage** is good: `NotificationBell` polls
`/api/admin/notifications` every 20 s and the `bell-widget-consistency`
test (8 specs) already locks that every payload's `link` matches the
widget-links registry.

**Gaps to fix in this pass:**
- Payout received — `/api/admin/payouts` POST inserts the row but does
  not call `notify()`. Same for `/api/admin/payroll/runs` POST (pay
  stub created → no employee notification).
- Role change — `/api/admin/employees/manage` uses a hand-rolled
  inline `notifyEmployee()` (line 31-39) instead of a pure builder +
  the standard `notify()` helper. Inconsistent shape vs. the rest;
  hardcoded `link: '/admin/profile'`; impossible for the
  bell-widget-consistency test to lock.
- Daily briefing — no cron fires a morning summary today. The
  daily-briefing widget shows live data but never escalates to a
  notification.
- Audit gaps — there's no comprehensive "every notify() call's link
  resolves to a real registered route" check across the whole
  codebase. The bell-widget-consistency test only covers the 7
  builders it imports; ad-hoc `notify({ link: '/x' })` calls in
  random routes are unchecked.

## Slices

### Slice 1 — Audit + link verification ✅ shipped 2026-05-30

- New `__tests__/notifications/notify-links-audit.test.ts` walks every
  `.ts/.tsx` file under `app/api/**` + `lib/notifications/**` +
  `lib/notifications.ts`, extracts every literal `link: '…'` /
  `link: \`…\`` from notify call sites + builders, normalizes
  (strip `?query`, cut at the first `${…}` interpolation), and asserts
  each prefix resolves against `ADMIN_ROUTES` (exact match OR
  registered-route + `/` prefix).
- Findings: **every existing notification link resolves**. No fixes
  needed; the audit is now a CI guard so future bad links fail at
  vitest time.
- 4 specs (≥10 links found, every link starts with `/admin/`, every
  link resolves, no placeholder string). Full hub + notifications
  suites (1751) green; typecheck + lint clean.

### Slice 2 — Payout received notify ✅ shipped 2026-05-30

- New pure `lib/notifications/payout.ts` with two builders +
  `formatUsdCents` / `formatUsd` / `payoutMethodLabel` helpers:
  - `buildPayoutNotification({ user_email, amount_cents, method, paid_at })`
    → title `💸 Payout posted — $X.YZ`, body `$X.YZ sent via {method} on {date}.`,
    `type: 'payment'`, `source_type: 'payout'`, link `/admin/my-pay`.
  - `buildPayStubNotification({ user_email, net_pay, pay_period_start,
    pay_period_end })` → title `💵 Pay stub ready — $X.YZ`, body
    `Your pay for {start} – {end} has been credited to your balance.`,
    `type: 'payment'`, `source_type: 'pay_stub'`, link `/admin/my-pay`.
  - Both return `null` on missing email / non-positive amount.
- Wired into `app/api/admin/payouts/route.ts` POST (fires after the row
  inserts + audit log) and `app/api/admin/payroll/runs/route.ts` PUT
  (fires per credited stub inside the `status === 'completed'` branch,
  next to where the balance transaction lands).
- 11 builder specs added (formatters, label, both happy paths, null
  guards) + 2 entries in `bell-widget-consistency.test.ts` so the
  link-vs-widget-route lock now covers payouts + pay stubs.
- Full hub (1684) + notifications (78) suites green; typecheck + lint
  clean.

### Slice 3 — Role change cleanup ✅ shipped 2026-05-30

- New pure `lib/notifications/role-change.ts` →
  `buildRoleChangeNotification({ user_email, kind, label?, amount?,
  reason?, previous_label?, pay_impact_per_hour? })` handles **6 kinds**:
  - `role` → 🎉, /admin/my-pay when pay_impact ≠ 0 else /admin/profile;
    body reads "promoted" / "reassigned" / neutral based on sign.
  - `credential_added` → 🏅, /admin/my-pay when the credential carries
    a bonus rate else /admin/profile; mentions the bonus.
  - `credential_removed` → 📋, /admin/profile.
  - `bonus` → 🎁 with the money-formatted amount, /admin/my-pay; null
    on non-positive amount.
  - `credits` (learning credits) → 📚 with floored points,
    /admin/profile; null on non-positive.
  - `note` (admin note visible to employee) → 📋 with the note as the
    body, /admin/profile; null without a note.
- `/api/admin/employees/manage` swaps all 7 inline `notifyEmployee()`
  calls for `recordProfileChange()` (the audit-log half, unchanged)
  PLUS `await notify(buildRoleChangeNotification(...))` (the bell
  half, now built by the pure builder). The pay-raise case routes
  through the EXISTING `buildPayRaiseNotification` so the dedicated
  raises route + the manage route share one builder.
- 16 builder specs (per-kind body + link + null guards + email
  normalization).
- Full hub (1684) + notifications (92) green; typecheck + lint clean.

### Slice 4 — Daily briefing morning cron ✅ shipped 2026-05-30

- New pure `lib/notifications/daily-briefing.ts` exports
  `buildDailyBriefingNotification({ user_email, first_name,
  today_events, upcoming_tasks, recent_notes })` → payload | null
  + `fiveBusinessDayWindow(now)` (the cron's UTC window math —
  Monday is 5 calendar days, Wednesday/Friday is 7).
- The composer assembles one body that strings together: events ("N
  events today: A, B +M more."), tasks ("N tasks due this week: …"),
  notes from boss/coworker/teacher ("N notes from author1, author2.").
  Returns null on a truly-empty day so the bell doesn't fill up.
  Title: "🌅 Good morning, {firstName}"; link `/admin/me`.
- New `/api/cron/daily-briefing` cron registered at **0 13 * * 1-5**
  (7 a.m. CST, business days). Pulls registered_users + today's
  approved `schedule_events` + pending `assignments` due in the
  5-business-day window + last-24h `messages`, partitions per user,
  runs each message slice through `detectMentions(...)` (the existing
  pure mentions helper) to find @-mentions of the user, then fires
  `notify()` per non-empty briefing. Best-effort per user so one bad
  row doesn't sink the batch.
- `vercel.json` extended with the new cron entry.
- 12 specs (window math for Mon/Wed/Fri + composer per section +
  the empty-day skip + author dedupe + packed-day composition + blank
  guards + fallback first name).
- Full hub (1684) + notifications (104) = **1788 specs green**;
  typecheck + lint clean.

## Doc complete — queued next: drawings collaboration

Four slices shipped. The user's wider drawing-collaboration ask (drawer
assignment, due reminders, notes dialog between RPLS + drawer + job
overseers, plus job-scoping every existing job-related notification)
lands as a separate plan doc in `docs/planning/in-progress/` after
this one moves to `completed/`, so the stop hook picks it up next.

## Out of scope (queued separately)

The user's drawing-collaboration ask is its own feature plan that
will land in `docs/planning/in-progress/drawings-collaboration-2026-05-30.md`
at the end of this pass:

- **Schema:** `cad_drawings.assigned_to`, `cad_drawings.due_date`,
  new `drawing_notes` table (drawing_id, author_email, body,
  mentioned_emails[], created_at).
- **API:** drawing assignment route, drawing notes CRUD + reply,
  drawing-due-soon cron.
- **UI:** a notes dialog (RPLS → drawer instruction, drawer → RPLS
  question), notes list on the CAD editor, assignment chip on the
  drawing list.
- **Notifications:**
  - "You've been assigned the {drawing}" → drawer + job overseers,
    link `/admin/cad?job={jobId}&drawing={id}`.
  - "{author} left a note on {drawing}: {preview}" → drawer +
    mentioned emails, same link.
  - "{drawing} due in 2 days" → drawer + overseers (cron), same link.
- **Job-scoping audit:** every existing job-related notification
  (personnel assignment, job stage change, schedule event reminder)
  also gets a sweep so it only fires for users **on the job team /
  overseeing the job**, not the whole org. The current behavior is
  already mostly correct (personnel assignment targets the assignee
  directly) but stage changes broadcast widely — needs an audit.
- The user also flagged "email notifications when the custom inbox
  ships" — captured as a guardrail note in that plan.

## Guardrails

- Don't change the legacy `notifications` table shape; ride the
  existing `link` field.
- Don't change the bell's deliberate exclusion of `direct_message` /
  `group_message` source_types (per the user's first answer).
- Per slice: typecheck + lint + commit + push + annotate this doc.
  The notify-link audit is a single test (Slice 1); the new builders
  (Slices 2-3) each ship their own pure-helper test; Slice 4 ships
  the cron test + a payload composition test.

## TL;DR

Four slices: audit every notify link, wire payouts, clean up role
changes into a pure builder, and ship a daily-briefing morning cron
that mirrors what the daily-briefing widget already shows. Drawings
collaboration (assignment + notes + due cron + job-scoping) is queued
as a separate plan that the stop hook picks up next.
