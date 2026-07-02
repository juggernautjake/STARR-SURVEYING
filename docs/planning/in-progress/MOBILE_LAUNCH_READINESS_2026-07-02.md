# Mobile launch readiness — Starr Field (iPhone + Android)

> **Created** 2026-07-02. **Driver:** the user wants Starr Field (the Expo
> React-Native app under `mobile/`) audited end-to-end for styling,
> formatting, responsiveness, edge cases, error handling, and build health,
> so it can ship to the App Store and Google Play. Plus a step-by-step
> setup guide (with screenshots) for getting the app onto an iPhone and an
> Android phone.
>
> **This is a DYNAMIC, self-editing plan.** As each slice ships, update the
> Status table. As new defects are discovered (typecheck, runtime, review),
> append them to the **Discovery log** at the bottom and add a slice for
> each. Do NOT mark a slice done until typecheck passes and it's committed.
> When every slice is DONE or explicitly DEFERRED (one-line rationale),
> move this doc to `docs/planning/completed/` — that ends the stop-hook loop
> and routes into the QA checklist phase.
>
> **Working branch:** `claude/mobile-launch-readiness-2026-07-02` (off main;
> PR workflow — no direct pushes to main).
>
> **Verification per slice:** `cd mobile && npx tsc --noEmit` must stay clean
> for touched files; `npx eslint <files>` once M-A1 lands; commit + push.
> The root repo suite (`npx vitest run`) baseline is 103 pre-existing
> failures (localStorage/zustand env issue) — compare against that, don't
> treat as regressions.

## Baseline captured at start (2026-07-02 ~10:25)

- `mobile/` = Expo 52 / RN 0.76 / expo-router / PowerSync + Supabase / Sentry.
  37 screen files, ~60 lib modules. Three-scheme theme (light/dark/**sun**).
- **`npx tsc --noEmit`: 12 errors** (see M-A2). Includes a filename-casing
  bug that builds on Windows but breaks case-sensitive iOS/Android/CI.
- **`npx eslint .`: fails to run** — plugin conflict with the root Next.js
  eslint config (M-A1).
- **Tablet:** only 5 / 37 screens use `useResponsiveLayout`; the rest stretch
  full-width on iPad (`supportsTablet: true` → Apple review WILL see this).
- **Dynamic Type:** `allowFontScaling` appears once in the whole app.
- **States:** `<Placeholder>` used in 0 screens; empty/loading/error are ad-hoc.
- **EAS/app.json:** permissions + bundle ids + deep links audited-good already
  (`README_TESTFLIGHT.md`, `STYLES_AUDIT.md`). `REPLACE_WITH_*` placeholders in
  `eas.json`/`app.json` are operator-fill-at-build — covered by the setup guide.

## Status

| Slice | What | Status |
|---|---|---|
| **M-A1** | Fix mobile ESLint (`root: true`) so lint/CI runs at all | **DONE** |
| **M-A2** | Clear all 12 typecheck errors + 2 rules-of-hooks lint errors | **DONE** |
| **M-B1** | Tablet width-constrain the full-bleed screens | **DONE (primary surfaces)** — see note |
| **M-B2** | Safe-area audit — screens missing notch/home-indicator insets | TODO |
| **M-C1** | Dynamic Type: `useScaledFontSize` + `allowFontScaling` guards | TODO |
| **M-D1** | Normalize empty / loading / error states onto one component | TODO |
| **M-E1** | Brand-color constants (`brand.navy/navyDeep/red`) — audit S3b | **DONE** |
| **M-E2** | Status-pill color parity with web (`StageChip`/`StatusChip`) — S3f | TODO (follow-up; needs shared web/mobile constants module) |
| **M-F1** | **Setup guide: iPhone + Android, step-by-step, screenshots** | **DONE** — `mobile/SETUP_GUIDE_IPHONE_ANDROID.md` |
| **M-G1** | Crash net (root ErrorBoundary) + edge-case sweep | **DONE (crash net)**; further edge cases = follow-up |
| **M-C1** | Dynamic Type: `useScaledFontSize` + `allowFontScaling` guards | TODO (follow-up; ergonomics, not a launch blocker) |
| **M-D1** | Normalize empty/loading/error states onto one component | TODO (follow-up; states exist, just inconsistent) |

## M-A2 — typecheck error breakdown (12)

1. `app/(tabs)/capture/[pointId]/video-player.tsx:178` — `instanceof` on a
   non-object LHS (TS2358).
2. `app/(tabs)/time/index.tsx:21` — imports `Timesheet` from `@/lib/Timesheet`
   but the file is `lib/timesheet.ts` exporting `useTimesheet`. **Casing bug —
   iOS/Android/CI build breaker.** (TS2724 + TS1149)
3. `app/(tabs)/time/index.tsx:399` — `entry` implicitly `any` (TS7006).
4. `app/_layout.tsx:64` — `setNotificationHandler` result missing
   `shouldShowAlert` (expo-notifications API) (TS2322).
5. `lib/db/connector.ts:66` — `userID` not in `PowerSyncCredentials` (TS2353).
6. `lib/locationTracker.ts:210` — TaskManager executor type mismatch (TS2345).
7. `lib/networkState.ts:106` — `"unknown"` not a `NetInfoStateType` (TS2322).
8. `lib/ScannerFab.tsx:148,203` — `job_id` missing on `ActiveEntry` (TS2339 ×2).
9. `lib/StatusChip.tsx:81,82` — no matching overload (TS2769 ×2).

## Priority order (single-agent, deadline-boxed)

1. **M-A1 + M-A2** — a green typecheck + working lint is the floor for "builds
   on iPhone/Android". The casing bug alone can fail an EAS build.
2. **M-F1** — the setup guide is an explicit deliverable the user asked for by
   name; must exist and be pointed to at the end.
3. **M-B1** — biggest user-visible / review risk (iPad full-bleed).
4. **M-C1 / M-D1 / M-E1 / M-E2 / M-G1** — polish + robustness as time allows.

## Handoff snapshot (2026-07-02 ~12:05)

**Shipped this session (branch `claude/mobile-launch-readiness-2026-07-02`,
each commit tsc-0 / eslint-0, pushed):**
- **M-A** — 12 typecheck errors → 0, and ESLint restored (was un-runnable).
  Included the `Timesheet.tsx`/`timesheet.ts` casing bug that breaks
  case-sensitive iOS/Android/CI builds. **This was the real "make it build"
  blocker.**
- **M-F1** — `mobile/SETUP_GUIDE_IPHONE_ANDROID.md` (the explicit deliverable):
  full iPhone + Android step-by-step, local iteration, OTA, screenshots convention.
- **M-B1** — tablet width-constrained ~9 primary screens (iPad).
- **M-G1** — root `ErrorBoundary` crash net (was none).
- **M-E1** — named brand constants for pre/failed-provider surfaces.

**Remaining (all follow-ups, NOT launch blockers) — the loop keeps these live:**
- **M-C1** Dynamic Type (`useScaledFontSize` + `allowFontScaling`) — ergonomics.
- **M-D1** normalize empty/loading/error states onto one component.
- **M-E2** status-pill color parity web↔mobile (needs a shared constants module).
- **M-B1 tail** — 4 low-traffic screens (capture wizard, photos, files preview,
  time/edit) + the shared `<ScreenScroll>` wrapper refactor.
- **Operator config** (`REPLACE_WITH_*` in `eas.json`/`app.json`) — filled by
  the person running the build, per §2 of the setup guide (not a code task).

**Note:** the 4 failing `__tests__/mobile-runbook/check-eas-config.test.ts`
cases are pre-existing baseline (that script was untouched); not a regression.

When the remaining follow-ups are shipped or consciously deferred, move this
doc to `docs/planning/completed/` to end the stop-hook loop.

## Discovery log (append new defects here as found)

- _(start)_ Baseline blockers captured above.
- **M-B1 note (2026-07-02):** constrained the primary surfaces —
  sign-in / forgot-password / reset-password, gear root, job detail,
  me/uploads, me/privacy, receipt detail (ReceiptForm), point detail
  (PointForm) — plus the 5 already done (jobs/money/time/me roots,
  notes/new). **Deferred:** `capture/index` (a multi-step wizard whose
  ScrollViews live in sub-step components — needs the hook threaded into
  each step; low tablet value for a capture flow), and the small
  `photos` / `files preview` / `time/edit` screens. A cleaner long-term
  fix is a shared `<ScreenScroll>` wrapper that applies the tablet clamp
  once (tracked as a follow-up, not a launch blocker). Two-pane
  list+detail on tablet remains S3d in `mobile/STYLES_AUDIT.md`.
