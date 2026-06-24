# Alerts / Notifications — Build-Out & Mobile

**Status:** 🟡 In progress — a notification bell + API + table exist (20s poll,
desktop dropdown); needs a mobile surface, an inbox page, real-time, and toasts.

## How this doc is driven

Stop-hook driven: next unchecked slice → read live code → smallest shippable
change → typecheck + lint + commit + push → check box + note. All `[x]` → move to
`completed/`. Keep desktop intact; verify mobile at 390px.

## Current state (verified 2026-06-24)

- UI: `app/admin/components/NotificationBell.tsx` (top-bar bell + dropdown,
  All/Unread filter, mark-all-read, per-item dismiss, escalation styling).
- API: `app/api/admin/notifications/route.ts`; `notifications` table
  (`user_email, type, source_type, title, body, icon, link, is_read,
  is_dismissed, escalation_level, created_at, expires_at`). **Polls every 20s.**
- `notify(opts)` (`lib/notifications/`) is the canonical insert used across crons
  and approval flows.
- Gaps: dropdown is cramped on mobile, no dedicated inbox page, no real-time, no
  toast/banner for urgent alerts.

## Slice plan

- [ ] **N1 — Mobile alerts surface.** On phones, render the bell's list as a
  full-screen sheet (scrollable list, mark-read, dismiss, tap-to-navigate) instead
  of a cramped dropdown. 44px targets, no overflow at 390px. Desktop dropdown
  unchanged. Verify in the ux-harness.
- [ ] **N2 — Inbox page.** Add `app/admin/notifications/page.tsx`: full list with
  filters (source_type, escalation, read/unread, date) and pagination/search, so
  alerts aren't only reachable through the bell. Link the bell footer to it.
- [x] **N0 — Red-dot indicator + urgent persistence (owner request).** The bell
  now shows a single **red dot** (not a count) only when there's a new unread
  notification; it clears once everything is read. **Urgent/critical** alerts keep
  the dot (a pulsing variant) even after they're read — they clear only when
  **dismissed** (i.e. the user has acted on them), so action-required alerts can't
  be swiped away by a glance. Clicking the bell opens the history dropdown; each
  item reroutes to its `link`. Verified across states (unread→dot, urgent-read→
  persistent pulse, all-read→no dot). _Which alerts should be 'urgent': approvals
  needing sign-off, disputed hours, overdue equipment, still-clocked-in past
  hours — set `escalation_level:'urgent'` at the `notify()` call site._
- [ ] **N3 — Real-time + accurate unread count.** Replace the 20s poll with a
  Supabase Realtime subscription on `notifications` for the current user so new
  alerts and the unread badge update instantly; keep a poll fallback.
- [ ] **N4 — Toast for high/urgent.** When a `high`/`urgent`/`critical` alert
  arrives while the app is open, pop a dismissible toast/banner that deep-links to
  the source — don't make the user open the bell to discover it.
- [ ] **N5 — Deep-link focus.** Navigating from an alert should land on and
  highlight the target (expand the job card / scroll to the row), not just route
  to the page. Findability: bell visible on mobile with a clear unread badge.
