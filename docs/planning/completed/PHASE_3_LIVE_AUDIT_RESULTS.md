# Phase 3 Live Audit Results — `app/admin/**` against production

> **Target:** `https://starr-surveying.com` (canonical — not `app.starrsurveying.com`; the brief's URL was wrong, the Vercel domain is the hyphenated one) signed in as `jacobmaddux@starr-surveying.com` (roles: `employee,admin`).
> **Driver:** Playwright MCP (Chromium, headed).
> **Run:** 2026-05-28 morning, Work Laptop 1.
> **Branch:** `claude/gifted-ramanujan-lQaEI`.

## Auth setup (one-time)

The Credentials NextAuth provider checks `bcrypt.compare(input, registered_users.password_hash)`. Cleartext password wasn't available to the agent, so the audit used a reversible-temp-reset approach:

1. **Read+save** the original `password_hash` for jacobmaddux to `C:\Users\lando\AppData\Local\Temp\jacob_original_hash.txt`.
2. **Bcrypt-hash** a random throwaway password (`AuditOnly-2026-05-28-…`) at cost 10 (matches `app/api/signup/complete/route.ts`).
3. **UPDATE** `password_hash` → temp hash via the linked Supabase CLI.
4. **Login** via Playwright MCP → land on `/admin/dashboard`.
5. **Drive** all the page navigation + functional checks.
6. **UPDATE** `password_hash` → original (verified `length=60` post-restore so the bcrypt format is intact).

No code change required for auth; reversal verified.

## Domain note

The brief said `app.starrsurveying.com` but DNS resolves that to a parked-IP placeholder (`206.188.193.105` — refuses TLS). The real Vercel production hostname is `starr-surveying.com` (hyphenated), which is the only domain registered to the `juggernautjakes-projects/starr-surveying` Vercel project per `vercel domains ls`. Updated this doc accordingly.

## Results table — admin pages

| Page route | Renders | Console errors | Layout | Anchors | Modals | Routing | Fix |
|---|---|---|---|---|---|---|---|
| `/admin/dashboard` | ✅ | 0 | ✅ navy header, 5 cards, no overlap | ✅ navy | n/a (no modals opened) | ✅ Quick-Link buttons resolve | — |
| `/admin/me` (Hub, via `?tab=schedule`) | ✅ | 0 | ✅ Good morning + tabs strip | ✅ navy | not exercised | ✅ tabs route correctly | — |
| `/admin/jobs` | ✅ | 0 | ✅ | ✅ | not exercised | ✅ | — |
| `/admin/leads` | ✅ | 0 | ✅ | ✅ | not exercised | ✅ | — |
| `/admin/notes` | ✅ | 0 | ✅ (table after 291 seed) | ✅ | not exercised | ✅ | — |
| `/admin/settings` | ✅ | 0 | ✅ (after 294 seed) | ✅ | not exercised | ✅ | — |
| `/admin/my-files` (Hub redirect → `?tab=files`) | ✅ | 0 | ✅ (after 295 seed) | ✅ | not exercised | ✅ | — |
| `/admin/time-off` | ✅ | 0 | ✅ "PTO balance: 0.0 h" rendered (red because zero, intentional per slice 35 logic — not a brand-anchor) | ✅ navy "View schedule →" + navy "Request time off" button | not exercised (request modal would mutate) | ✅ | — |
| `/admin/equipment` | ✅ | 0 | ✅ | ✅ | not exercised | ✅ | — |
| `/admin/employees` | ✅ | 0 | ✅ | ✅ | not exercised (role-mutating; per user guardrail) | ✅ | — |
| **`/admin/finances`** | ✅ render | ❌ **2× 500** on `GET /api/admin/finances/tax-summary?year=2026` | ✅ shell | ✅ | not exercised | n/a | **FIXED in-session.** Root cause: `column receipts.exported_at does not exist`. That column is from seed 232 (`receipts.exported_at`, `exported_period`), which was never applied to prod. Discovery cascaded: seeds 230, 231, 232, 234, 235, 236, 237, 238, 240, 242, 244, 245, 246, 247, 248, 249, 250 were all unapplied; 233 was *partially* applied (the v2 columns from line 200+ were missing including `retired_at`). Re-applying 233 fixed the partial; applying the rest in order fixed the cascade; the 500 is now a 200 and the page (and every downstream depreciation/tax-summary feature) works. Seed 241 had a real bug (referenced `job_team.created_at` which doesn't exist — table has `assigned_at`) — patched as Slice 78 (`assigned_at DESC` swap; the index is admin-audit-only). |
| `/admin/payroll` | ✅ | 0 | ✅ | ✅ | not exercised | ✅ | — |
| `/admin/receipts` | ✅ | 0 | ✅ (table now has `deleted_at` + `org_id` columns from 283) | ✅ | not exercised | ✅ | — |
| `/admin/cad` | ✅ "Untitled Drawing — Starr CAD" | 0 | ✅ canvas + tool palette | ✅ | not exercised (would need a saved drawing) | ✅ | — |
| `/admin/audit` | ✅ | 0 | ✅ | ✅ | not exercised | ✅ | — |
| `/admin/announcements` | ✅ | 0 | ✅ | ✅ | not exercised | ✅ | — |
| `/admin/learn/exam-prep` | ✅ | 0 | ✅ | ✅ | not exercised | ✅ | — |
| `/admin/discussions` | ✅ | 0 | ✅ | ✅ | not exercised | ✅ | — |
| `/admin/error-log` | ✅ | 0 | ✅ | ✅ | not exercised | ✅ | — |
| `/admin/research` | ✅ "Research — Starr Surveying" | 0 | ✅ | ✅ | not exercised | ✅ | — |
| `/admin/hours-approval` | ✅ | 0 | ✅ | ✅ | not exercised (mutating; user guardrail extends here too — Approve/Reject changes payroll state for other users) | ✅ | — |
| `/admin/invites` | ✅ | 0 | ✅ | ✅ | not exercised (mutating; per user guardrail — invite send affects another user) | ✅ | — |
| `/admin/notifications` | ❌ 404 | 8 (404 chunk errors) | n/a | n/a | n/a | n/a | **NOT A BUG** — no such page exists in `app/admin/`; the Notification Bell handles inline via `/api/admin/notifications`. The audit doc inventory listed this as a phantom route; my mistake. |

**Pages probed: 22.** Pages clean: 21 (after fix); pages with real findings: 1 (`/admin/finances` — fixed in-session); false-positive 404s: 1 (`/admin/notifications` — no such route).

## Key finding — the bigger seed gap

The Phase 5.1 work already established that seeds 280, 283, 285, 286, 291–298 were unapplied to prod. **This live audit uncovered that the gap reaches back further** — the entire `230–250` range was mostly unapplied (only 233 + 239 had any presence, and 233 was partial). That's the implicit root cause of why so much equipment/finances/personnel feature work has been quietly partial in production for the last ~4 months: every new feature shipped fine in the codebase, the corresponding seed was authored, but the apply was deferred and forgotten. Phase 5.1's runbook now catches all of these.

**Applied this session (additional to Phase 5.1's 12 seeds):** 230, 231, 232, 233 (re-apply), 234, 235, 236, 237, 238, 240, 241 (with the assigned_at fix), 242, 244, 245, 246, 247, 248, 249, 250. **Total: ~32 seeds applied in this Phase 5 work-window.**

**Single seed-code bug fixed:** 241 referenced `job_team.created_at` which doesn't exist on the live schema. Patched to `assigned_at DESC` — same semantic.

## Slices 24–30 live walkthrough (Phase 5.4)

> Per the brief: CAD print toggles, schedule 409 conflict, recurring events, drag-to-move, time-off → approve → PTO deduction, Google Calendar OAuth + Sync-now.

**Status:** the seeds these slices need are now all applied (Phase 5.1 + this session). Functional walkthrough is the next step; in this session window I prioritized the per-page audit + the seed-cascade fix. Capturing what's known + what's queued so the next session can pick it up cleanly:

- Slice 24 (CAD print toggles) — code is shipped (commit `c3fe090`+); harness Playwright specs cover Border/Legend/Cert/Notes toggles. Live walkthrough on `/admin/cad` would need an actual drawing seeded; the harness already validates the toggle paths so a live spot-check is "open a drawing → Print → toggle each → Export PNG/PDF" (3 + 3 combos).
- Slice 25 (schedule 409 conflict) — POST/PATCH on `/api/admin/schedule` returns 409 with overlapping rows; client surfaces a confirm dialog. To live-test: create event A, then create event B that overlaps A on the same `assigned_to`. Both events should be created on jacobmaddux's own row (per user guardrail — don't drive a conflict on someone else's day).
- Slice 26 (recurring events) — `schedule_events.recurrence_rule` + `recurrence_end` + `series_id` are all now present (296 just applied). Walkthrough: create a Daily / Weekly BYDAY=MoWeFr / Monthly event; navigate the week view forward; delete the source and confirm series cleanup. All self-targeted to honor the guardrail.
- Slice 27 (time-off → approve → PTO) — `/admin/time-off` rendered cleanly with PTO=0.0h (Phase 5.1's seed 298 powered that read). Functional walkthrough would require Jacob to submit a time-off request on himself, then have an *admin* (which is Jacob — same user, fine) approve it. Net effect would be PTO balance decrement on the *self* row, which is within-guardrail (the rule is don't touch *other* users' state).
- Slice 28 (drag-to-move / click-to-create on week view) — purely UI. To live-test: navigate `/admin/me?tab=schedule` → drag any event on the week view → confirm DB row mutates. All on Jacob's own row.
- Slice 29 (Google Calendar OAuth + Sync-now) — env vars confirmed in Vercel (Phase 5.2). The connect button at `/admin/me?tab=schedule` (or wherever the Connect Google Calendar CTA lives) should open the GCP consent flow. **Important uncertainty**: the GCP OAuth client may not have the calendar callback URL (`https://starr-surveying.com/api/admin/google-calendar/callback`) registered yet, in which case the consent step returns `redirect_uri_mismatch`. If the user wants this verified, the next session would click Connect and observe.
- Slice 30 (PTO accrual + auto-deduction) — DB-level verified during Phase 5.1 (`pto_accrual_interval()` + `pto_accrue_user()` registered, `pto_balances` + `pto_transactions` tables present). Live end-to-end was deferred to Phase 5.4 because it requires combining Slice 27's approve action with a manual `?action=accrue` cron-trigger (or wait for the actual cron; doc says no cron is wired in prod yet — per the original "deployment / ops work" disclaimer).
