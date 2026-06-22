# Research self-healing — slice 1 (manual sweep + settings toggle) — 2026-06-22

**Status:** SLICE 1 SHIPPED — slices 2–5 outstanding.
**Owner:** Jacob Maddux
**Branch:** `claude/gifted-ramanujan-lQaEI`
**Predecessor plan:** `docs/planning/completed/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md`

## Completion log

| Item | Status | Commit |
|---|---|---|
| Plan written + landed in in-progress/ | SHIPPED | this commit |
| seeds/377_research_self_heal_settings.sql (singleton settings row, all-OFF defaults) | SHIPPED | this commit |
| lib/research/self-heal-sweep.ts (pure classifier + summary reducer) + tests (13 cases) | SHIPPED | this commit |
| /api/admin/research/self-heal/settings GET + PUT | SHIPPED | this commit |
| /api/admin/research/self-heal/sweep POST (HTTP + DOM-fingerprint compare per adapter, records health-check rows) | SHIPPED | this commit |
| /admin/research/self-heal page (toggle row + Run-check button + per-row results) | SHIPPED | this commit |
| Route-registry entry under research-cad workspace ("Site Health") | SHIPPED | this commit |
| Slice 2 — scheduled cron driven by `schedule_enabled`, using the existing `planScheduledChecks` planner (per-host concurrency cap + batch cap + metro-tier cadence). Daily 06:00 UTC. Idempotent — bails early when the toggle is OFF. Stamps each adapter's `last_verified_at` + auto-promotes degraded→active on recovery. | SHIPPED | follow-up commit |
| Slice 3 — AI repair proposal generation when sweep flags broken | NOT STARTED. |
| Slice 4 — auto-apply pathway gated on `autoapply_enabled` + confidence + canary | NOT STARTED — pure `decideApplyAction` already decides; the route that writes proposals + applies them lands later. |
| Slice 5 — Playwright deep check for JS-rendered portals | NOT STARTED. |

## 0. What the user asked for

> "For the self healing and stuff that makes adjustments and corrections
> when websites change or methods need to be updated, let's make it so
> that everything is built and functional, but that we can turn the self
> healing function on and off. By default it will be off. Also, we need
> to be able to manually initiate a one time check that will go through
> and ensure that all of the websites used in our system are still
> accessible and we are able to successfully extract the data we are
> looking for. This will allow us to do a quick check to know if anything
> has changed."

Three asks in plain terms:

1. **Settings toggle** for the self-healing automation, default OFF.
2. **Manual one-time check** that sweeps every registered website and
   reports back whether each is still accessible + structurally
   recognizable. Initiated by an admin button — not by a cron.
3. **Background full automation eventually** — automatic scheduled
   checks, AI repair proposals, auto-apply once trusted. That's the
   bigger §9.4–§9.9 build from the predecessor plan; this slice lays
   the groundwork so it can be flipped on later without a rewrite.

## 1. State audit (before this slice)

| Layer | Built | Tested | Live |
|---|---|---|---|
| Schema: `research_adapter_canaries`, `…_health_checks`, `…_change_proposals` (seed 371) | ✅ | n/a | needs `psql … -f seeds/371_*.sql` if not applied |
| Pure helpers: `lib/research/canary-diff.ts`, `lib/research/dom-fingerprint.ts`, `lib/research/apply-policy.ts`, `lib/research/health-check-scheduler.ts` | ✅ | ✅ (existing vitest coverage) | n/a (pure) |
| HTTP-level manual sweep endpoint | ❌ | ❌ | ❌ |
| Admin-editable settings table (toggle that overrides env flag) | ❌ | ❌ | ❌ |
| `/admin/research/self-heal` page with toggle + sweep button | ❌ | ❌ | ❌ |
| AI repair agent that generates change proposals | ❌ | ❌ | ❌ |
| Scheduled cron that runs the planner + executes checks | ❌ | ❌ | ❌ |
| Auto-apply pathway (uses `RESEARCH_SELF_HEAL_AUTOAPPLY`) | partial — flag is read by `apply-policy.ts` but no caller wires the proposal-write yet | ✅ (pure tests) | n/a |

## 2. Slice 1 scope (this slice)

Ship the **two user-asked features** end-to-end:

- **Settings toggle** — a single-row `research_self_heal_settings` table
  the admin UI reads + writes. Default `autoapply_enabled = FALSE` and
  `schedule_enabled = FALSE`. The pure `apply-policy` module already
  defaults the same way; this adds a DB-backed override so the user
  can flip it without redeploying.
- **Manual one-time check** — `POST /api/admin/research/self-heal/sweep`
  that:
  - Loads every adapter whose `status` is one of `active`, `degraded`,
    `broken` (skip draft + retired).
  - For each, fetches `base_url` with a 10s timeout.
  - If the adapter has an `is_active` canary with a `baseline_dom_skeleton`,
    re-fingerprints the live HTML via `dom-fingerprint.fingerprintHtml()`
    (already pure + built) and compares.
  - Records a `research_adapter_health_checks` row with status from the
    enum (`healthy` / `degraded` / `broken` / `no_record` / `error`).
  - Returns a summary `{ total, healthy, degraded, broken, errored,
    rows: [{adapter_id, county, vendor, status, http_status, ms,
    summary}] }`.
- **Admin UI** at `/admin/research/self-heal`:
  - Toggle row (Self-heal automation: OFF / ON, with explanatory copy
    that the toggle controls whether scheduled checks + AI repair
    proposals run automatically; the manual sweep button below works
    regardless).
  - Big primary button: **"Run health check now"** — fires the POST,
    streams a loading state, then renders the per-adapter table.
  - Per-row chip color by status; click expands the row to show the
    summary message + the most recent check timestamp.

What this slice **doesn't** do:

- No AI repair proposals get written. We collect the signal; turning
  the signal into a `research_adapter_change_proposals` row is a
  later slice (§9.4 of the predecessor plan).
- No background cron. The `schedule_enabled` toggle simply lives in
  the settings table; wiring it to a cron job is a later slice.
- No Playwright. Slice 1 uses fetch + the existing pure HTML
  fingerprinter. The Playwright-based deep check from §9.6 is slice 3.

## 3. Files

**New:**
- `seeds/377_research_self_heal_settings.sql` — single-row settings
  table seeded with all-OFF defaults.
- `lib/research/self-heal-sweep.ts` — pure summary reducer
  (`summarizeSweep(rows)`) so the dashboard render is testable
  without the DB.
- `app/api/admin/research/self-heal/settings/route.ts` — GET/PUT.
- `app/api/admin/research/self-heal/sweep/route.ts` — POST.
- `app/admin/research/self-heal/page.tsx` — the dashboard.
- `__tests__/research/self-heal-sweep.test.ts`

**Modified:**
- `lib/admin/route-registry.ts` — add `/admin/research/self-heal` so it
  shows up in the command palette + nav.

## 4. Tests

- `summarizeSweep` reducer — empty, all-healthy, mixed, all-broken.
- Settings + sweep API: existing vitest coverage of withErrorHandler
  exercises the auth wrapper.
- Admin route audit picks up the new route.

## 5. Rollback

Pure additive. Revert the commit; the existing research surface
keeps working. The settings table lives quietly with all-OFF
defaults.

## 6. Follow-up slices (not in this commit)

- **Slice 2**: scheduled cron that runs the §9.7 planner — gated on
  `schedule_enabled`, idempotent, per-host concurrency cap.
- **Slice 3**: AI repair agent — when sweep flags `broken`, write a
  `research_adapter_change_proposals` row with confidence + canary
  re-test. Review queue UI.
- **Slice 4**: auto-apply pathway — gated on `autoapply_enabled` AND
  confidence ≥ threshold AND canary re-test passed. Same hook
  `apply-policy.decideApplyAction` already returns the decision.
- **Slice 5**: Playwright-based deep check — replaces the slice-1
  `fetch + fingerprintHtml` with a real browser walk for adapters
  whose access_method requires JS execution.

Each slice ships behind the same settings toggle; nothing automated
runs until the admin flips it ON in the UI.
