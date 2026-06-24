# Clock In / Out + Work Mode — Build-Out & Mobile Polish

**Status:** 🟡 In progress — feature exists end-to-end but clock state is
localStorage-only and the flow is not mobile-polished.

## How this doc is driven

This doc is processed by the Stop hook (`.claude/hooks/continue-until-planning-done.sh`).
Each turn: pick the next unchecked `- [ ]` slice, read it against the **live
code**, ship the smallest meaningful change (typecheck + lint + commit + push),
then check the box and add a one-line completion note. When every box is `[x]`,
move this doc to `docs/planning/completed/`.

Keep desktop behavior intact unless a slice says otherwise. Verify mobile at
390px via the ux-harness (`/ux-harness?page=…`) where practical.

## Current state (verified 2026-06-24)

- Clock session state: `lib/work-mode/clock-session.ts` — persisted in
  **localStorage** (`starr-clock-session`). `writeClockSession` / `clearClockSession`.
- UI: `app/admin/components/ClockInPill.tsx` (top-bar pill + elapsed timer),
  `lib/work-mode/clock-modals.tsx` (ClockInModal / ClockOutModal),
  `app/admin/me/components/WorkModePrompt.tsx` (role picker + clock awareness).
- Work-mode routes: `app/admin/work-mode/start/page.tsx`,
  `app/admin/work-mode/[role]/page.tsx`.
- Clock-out finalize writes a `daily_time_logs` row via `app/api/admin/time-logs`.
- Server-side clock state: open clock-ins are recorded in `job_time_entries`
  (`end_time IS NULL`); `app/api/admin/team/route.ts` queries this for "who's
  clocked in." So the server CAN see active sessions — but it's unverified that
  clock-IN (not just clock-out) writes the open row.

**Core gap:** the localStorage session is the client fast-path, but it's unclear
whether clock-IN reliably writes an open `job_time_entries` row. The 6pm reminder
(doc 01, slice H7) depends on that server row existing the moment someone clocks
in. C1 makes `job_time_entries` the authoritative open-session record.

## Slice plan

- [x] **C1 — Clock-in writes the server open-session row.** Verify that clocking
  in creates an open `job_time_entries` row (`end_time IS NULL`) immediately, not
  only at clock-out. If clock-in only writes localStorage, add the server write
  (and hydrate localStorage from the open row on load so cross-device/refresh
  recovers it). This is the dependency for doc 01's 6pm reminder. Acceptance: a
  freshly clocked-in user appears in `job_time_entries` with a null `end_time`,
  and a reload recovers the session.
  _Done 2026-06-24:_ confirmed clock-in only wrote localStorage and that
  `job_time_entries` is **job-scoped** (POST requires `job_id`), so it can't hold
  a job-less work-mode shift. Added the dedicated `active_clock_sessions` table
  (`seeds/379…`, one open row per user) + `app/api/admin/clock-session` (GET/POST/
  DELETE). `writeClockSession`/`clearClockSession` now mirror to it best-effort
  (covers every call site — pill, WorkModePrompt, quick-actions, work-mode topbar),
  and `hydrateClockSessionFromServer` recovers an open session on load (wired into
  ClockInPill mount). Repointed the H7 reminder cron from `job_time_entries` to
  `active_clock_sessions`. tsc + eslint clean. _(DB-dependent; the API GET
  fail-opens to `session: null` until the migration is applied.)_
- [ ] **C2 — Clock-out confirmation summary.** After clock-out, show a short
  confirmation ("You worked 4h 30m — logged to Job #42, pending approval") so the
  user knows it saved. Wire to the finalize response.
- [ ] **C3 — Mobile polish: clock pill + modals.** ClockInModal / ClockOutModal
  and the activity-tag picker must be touch-friendly and fit 390px (full-width
  controls, 44px targets, no horizontal overflow). Verify at 390px.
- [ ] **C4 — Mobile polish: work-mode workspace.** The `/admin/work-mode/[role]`
  workspace must be usable at 390px (no desktop-only sidebar; responsive nav).
  Verify the enter→work→exit loop on a phone-sized viewport.
- [ ] **C5 — Findability.** Ensure "Clock in / out" and "Enter work mode" are
  obvious entry points on mobile (top-bar pill visible; hub action present).
