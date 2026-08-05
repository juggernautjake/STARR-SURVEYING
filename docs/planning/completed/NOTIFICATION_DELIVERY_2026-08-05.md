# Notification delivery — phone banners + app-icon badge for the business app

**Opened 2026-08-05** at the owner's request: *"a notification symbol on the app icon whenever there
is a new notification… pushed to the phone's notification banners… for each of the different roles."*

The PWA groundwork was already done (`PWA_AND_PUSH_2026-08-03.md`): manifest, a scoped `/admin/`
service worker, the shared `lib/push/web-push.ts` transport, the `admin_push_subscriptions` table
(seed 571), the subscribe route + `EnableNotifications` UI, and `web-push` installed. **What was
missing was the wiring between "a notification row was written" and "a phone lights up."** Three
concrete gaps, all now closed.

## What was broken

1. **The `/admin/` service worker had no `push` handler at all.** It cached assets and served an
   offline page — so even with a subscription and keys, a sent push reached the browser and was
   dropped. (The AndrewAsh worker had a push handler; the business one never did.)
2. **`notify()` / `notifyMany()` wrote the bell row and sent nothing to the phone.** Every event in
   the app funnels through those two functions, and neither touched Web Push.
3. **Nothing set the app-icon badge.** `setAppBadge` / `clearAppBadge` appeared nowhere in the repo.

## What shipped

- **`public/admin/sw.js` — `push` + `notificationclick`.** The push handler shows the OS banner AND
  calls `self.navigator.setAppBadge(unreadCount)` from the payload, so the home-screen icon carries
  the real unread count even when the app is closed. `notificationclick` focuses an existing `/admin`
  tab and navigates it, or opens one. Both parse defensively — a throw here is a push the OS silently
  drops.
- **`lib/push/admin-push.ts` — `sendAdminPush` / `sendAdminPushMany`.** Resolves an email to its
  `registered_users.id`, loads that user's live `admin_push_subscriptions`, and sends one payload
  carrying the recipient's current unread count (counted from `notifications`, so the badge is always
  a *view* of the real unread set — the same rule the hub badges follow). Applies the studio's
  failure policy: a `gone` endpoint (404/410) is disabled immediately; a transient failure only
  counts a strike, three to disable, so one outage can't unsubscribe a crew. Never throws.
- **`lib/notifications.ts` — `notify()` and `notifyMany()` now fan out push** after writing the row.
  Awaited (not fire-and-forget) because Vercel does not guarantee work after the response returns.
  **This single change lights up every event already wired to `notify()`** — verified across 30
  admin routes: new leads (`lib/leads/intake.ts` → `notifyMany`), hours submitted → approvers
  (`time-logs`), messages (`messages/send`), education quizzes/grading/assignments (`learn/*`),
  payments / raises / bonuses (`payroll/*`, `payouts`), job assignments (`personnel/assign`),
  equipment, receipts, time-off, CAD. Recipients are unchanged — each caller already decides them, so
  push is not a second place that re-derives "who cares."
- **`NotificationBell.tsx` — badge sync while the app is open.** Every poll, mark-read, and
  mark-all-read flows through `unreadCount`; an effect mirrors it to `setAppBadge` / `clearAppBadge`,
  so reading a notification in-app clears the icon without waiting for another push.

**Tests:** `__tests__/pwa/admin-push-send.test.ts` (6) locks the delivery contract — count in the
payload, gone→disabled, transient→strike-not-disabled, no-subs→no-send, never-throws. Full PWA suite
41 green; `tsc`, `eslint`, `npm run build` clean.

## Per-role coverage

Roles are not a separate switch — a person is notified about an event because a caller passes their
email (or a role query resolves to it). The event → recipient wiring already existed per event;
delivery to the phone is what this slice added on top. So the answer to "is every role fleshed out"
is "every event that writes a bell row now also pushes," and the events are the ones listed above.

## ▶ Deferred (one code follow-up + owner activation)

- **Worker-origin notifications deliver in-app only, not as push.**
  `worker/src/shared/notify-research-done.ts` writes the bell row directly (the worker is a separate
  deployment without the Next push env or the `web-push` dep), so "research is ready" shows in the
  bell but does not band the phone or the icon when the app is closed. The clean fix is a small
  internal, secret-gated Next endpoint (`/api/internal/push`) the worker calls after inserting, or a
  `delivered_at`-driven dispatch cron in the Next app that pushes any row still undelivered. Either is
  its own slice; recorded here so it is not mistaken for covered. Everything else the owner named is
  Next-origin and is covered.
- **Owner activation (unchanged from `PWA_AND_PUSH`, restated because delivery now depends on it):**
  generate the VAPID pair (`npx web-push generate-vapid-keys`), set `PUSH_VAPID_PUBLIC_KEY` /
  `PUSH_VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_PUSH_VAPID_KEY` / `PUSH_VAPID_SUBJECT` in Vercel, apply seed
  571 (`node scripts/apply-seeds.mjs`), set `NEXT_PUBLIC_ADMIN_PWA=1`. Then each person installs the
  app to their home screen and taps **Enable notifications** on `/admin/install` — on iOS the
  home-screen install is a hard precondition for push. Until those are set the code is inert by
  design (no keys → nothing sent; no worker registered → nothing to receive).
- **Device verification** (a real banner and a real icon badge on a physical phone) is unchanged from
  W6b and still needs a device.
