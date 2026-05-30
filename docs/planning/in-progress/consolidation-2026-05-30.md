# Consolidation — 2026-05-30

*Opened 2026-05-30 in response to the user's brief: "Take a catalogue
of all of the pages and elements and panels and widgets and see if
there are redundancies. See if there are pages that can be condensed
and combined. Just go through all of the pages and catalogue what all
can be combined and bettered. Build it into the planning document in
slices and let the stop hook handle it."*

## Today's reality (audit, 2026-05-30)

Two background-explorer surveys ran today and produced these
headline counts:

**Pages.** 127 `page.tsx` files under `app/admin/`. ~17 top-level
destinations the route-registry surfaces in the nav rail; the
remaining 110 are deep / subroute pages. Several long-known legacy
redirect pages still sit in the tree, several routes look like
abandoned scaffolding, and a few categories ship multiple pages
that re-render the same data through slightly different lenses.

**Widgets.** 41 widgets in `lib/hub/widgets/*/index.tsx`. Five
overlap clusters where 2-3 widgets each fetch the same data slice
through a different name / scope filter:

| Cluster                | Members                                                          |
|------------------------|------------------------------------------------------------------|
| Activity feeds         | `my-jobs`, `job-activity-feed`, `recent-activity`                |
| Approval queues        | `pending-hours`, `pending-receipts`, `pending-time-off`          |
| Drawings               | `recent-drawings`, `drawings-in-progress`                        |
| Schedule               | `today-schedule`, `crew-calendar` (+ daily-briefing's section)   |
| Messaging              | `messages`, `mentions-inbox`, `open-discussions`                 |

**APIs.** 278 route files under `app/api/admin/**`, grouped across
research (57), equipment (35), learn (33), jobs (17), cad (13),
personnel (8), pay-config (8), messages (8), payroll (7), reports
(6), time-logs (5), maintenance (5), billing (5), receipts (4), +
~41 across 20 single-route domains. Honest finding: the API surface
is **already clean** — most apparent duplication is intentional
mode-splitting via query params (`?my_jobs=`, `?stage=`, `?unread=`).
The high-confidence wins are narrow:

| Endpoint                             | Verdict                                                              |
|--------------------------------------|----------------------------------------------------------------------|
| `/api/admin/badges`                  | Dead — `/api/admin/rewards?section=badges` already handles badges.   |
| `/api/admin/team/[email]/today`      | Zero callers found; likely legacy personnel-dashboard scaffold.      |

9 cron routes — all distinct triggers + audiences. No cron
consolidation needed.

**Confirmed legacy / redundant pages worth removing or merging:**

| Path                        | Status                                                                                                |
|-----------------------------|-------------------------------------------------------------------------------------------------------|
| `/admin/my-jobs`            | Redirects into `/admin/me?tab=jobs` per the 2024 hub redesign.                                        |
| `/admin/my-hours`           | Same — redirects into the hub.                                                                        |
| `/admin/my-pay`             | Same.                                                                                                 |
| `/admin/my-notes`           | Same.                                                                                                 |
| `/admin/profile`            | Redirects to `/admin/me?tab=profile`.                                                                 |
| `/admin/dashboard`          | Pre-hub dashboard; `/admin/me` is the successor and pulls the same data via widgets.                  |
| `/admin/messages/contacts`  | Team directory that overlaps the new firm-wide `/admin/contacts` + sits next to `/admin/messages`.    |
| `/admin/work-mode/*`        | Role-specific work-mode landings; superseded by `/admin/work` per the Phase 3 redesign.               |
| `/admin/research-cad`       | Unclear remit relative to `/admin/cad` + `/admin/research`. Needs verification before action.         |

The five legacy "my-…" redirect pages alone are dead weight: their
only job is to issue an HTTP redirect, which we can do at the
middleware / `next.config.js` layer for one round-trip less plus
fewer files to grep through.

## Slices

### Slice 1 — Audit document (foundation) ✅ shipped 2026-05-30

- New `docs/admin-surface-audit-2026-05-30.md`. Three sections:
  - **Pages** — classification table per `page.tsx`. 5 confirmed
    `legacy-redirect` (the `my-*` paths + `/admin/profile`), 2
    `consolidation-candidate` (`/admin/dashboard`,
    `/admin/messages/contacts`), 9 `verify-before-action` (8
    `work-mode/*` + `research-cad`), rest `active`.
  - **Widgets** — 43 widgets total; 3 merge clusters identified
    (`approvals`, `drawings`, `activity`) + 2 documented as
    intentional overlap (`schedule-overlap`, `messaging`) + 34
    unique. The intentional-overlap clusters are documented so a
    future PR doesn't try to fold them.
  - **APIs** — 267 route files, grouped by domain. Honest finding:
    the API surface is already clean (most apparent duplication is
    intentional mode-splitting via query params). Two dead routes
    flagged for Slice 8 (`/admin/badges`, `/admin/team/[email]/
    today`); 9 crons all distinct.
- Doc lives outside `docs/planning/` so it stays referenceable
  after this plan moves to `completed/`. Future consolidation PRs
  cite the row that justifies the action.
- No code changes in this slice; the rest of the plan is grounded
  in this single source of truth.

### Slice 2 — Delete the five `my-*` legacy redirect pages ✅ shipped 2026-05-30

- New `lib/admin/legacy-redirects.ts` exports `LEGACY_REDIRECTS` (the
  5 source → target map). Lives outside `middleware.ts` so the spec
  can import the constant without dragging in next-auth's
  `next/server` dependency.
- `middleware.ts` imports the constant + applies the redirects at
  the top of the handler (BEFORE the auth check) so logged-out
  users hitting an old bookmark land on the right canonical URL
  before getting bounced to login. The 3 dead `ROUTE_ROLES` entries
  for `/admin/my-jobs` / `/admin/my-hours` / `/admin/my-pay` are
  removed (unreachable after redirect).
- The 5 `page.tsx` files are deleted (the `*Panel.tsx` siblings stay
  — the Hub imports them).
- Every inbound reference rewritten to `/admin/me?tab=…`:
  - Sidebar (4 hrefs), route-registry (5 hrefs),
    AdminLayoutClient page-title map (5 entries removed),
    CommandPalette clock-in entry, Fieldbook my-notes link,
    payroll page + per-employee redirect, dashboard navigation
    links (2), help-catalog (my profile + my finances).
  - Widget-links registry: `my-pay`, `hours-this-week` repoint to
    the new canonical URLs.
  - Notify builders: `lib/notifications.ts` (5 literals across
    raise/bonus/payment/promotion/hours), `lib/notifications/
    payout.ts` (the PAY_LINK constant), `lib/notifications/role-
    change.ts` (TYPE + PAY_LINK + PROFILE_LINK constants),
    `lib/notifications/pay-raise.ts`, `lib/notifications/
    hours-decision.ts`.
  - API routes: `/api/admin/notifications/route.ts` (2 hours
    reminders), `/api/admin/payroll/payout-log/route.ts`.
  - `lib/saas/bundle-gate.ts`: `/admin/profile` entry removed
    (now reached via the bundle-null `/admin/me` entry).
  - Test assertions updated across pay-raise, payout, hours-decision,
    role-change, bell-widget-consistency, bundle-gate, and the
    recent-activity helper test.
- New `__tests__/middleware/legacy-redirects.test.ts` ships 3 specs
  locking the exact 5-entry shape, the `/admin/me?tab=…` invariant,
  and the source-path → canonical-anchor mapping.
- The widget-links shape test loosened by one regex to allow
  optional `?tab=…` query strings (the legitimate new shape).
- 2030 middleware + notifications + hub + admin + saas + contacts
  + jobs specs green; typecheck + lint clean.

### Slice 3 — Approvals widget (cluster 1 → 1) ✅ shipped 2026-05-30

- New `lib/hub/widgets/approvals/index.tsx` — single tile that
  fetches all three pending queues (hours / receipts / time-off) in
  parallel and renders a tab row + per-tab list. Tab counts show
  next to each label.
- Pure `lib/hub/widgets/approvals/pick-mode.ts` exports
  `pickDefaultMode(counts)` (picks the busiest tab on first mount;
  tiebreaker order `hours > receipts > time-off`) +
  `summarizeCounts(counts)` for the tiny-bucket summary string.
  Three pure data mappers (`aggregateHours`, `mapReceipts`,
  `mapTimeOff`) consolidate the row-shape logic the three legacy
  widgets used to do independently.
- Settings: `defaultMode` (auto / hours / receipts / time-off) +
  `maxItems` (1-20). Registered in `lib/hub/widget-options.ts`
  with a select + number schema entry.
- `minSize: { w: 1, h: 1 }` to satisfy the Phase-35 catalog
  contract; tiny bucket renders just the total pending count.
- Widget-links registry gains the `approvals` entry pointing at
  `/admin/hours-approval` (the most-frequented per-tab landing).
- The three legacy widgets (`pending-hours`, `pending-receipts`,
  `pending-time-off`) carry a one-line `SUPERSEDED` comment above
  their `defineWidget(...)` calls. They stay registered so existing
  hub layouts don't lose their tiles; a follow-up slice migrates
  saved layouts + deletes the legacy ids.
- 12 new spec cases (pick-mode + aggregators). Existing widget-
  links + widget-options + responsive contracts updated. **2048**
  middleware + notifications + hub + admin + saas + contacts +
  jobs specs green; typecheck + lint clean.

### Slice 4 — Drawings widget (cluster 2 → 1) ✅ shipped 2026-05-30

- New `lib/hub/widgets/drawings/index.tsx` — one tile with a
  `scope: 'mine' | 'all'` setting + SettingsForm picker. Hits the
  same `/api/admin/cad/drawings?mine=...` endpoint both legacy
  widgets used; renders the same row shape (drawing name + joined
  job_name + relative age) via `cadOpenHref` + `formatAge` reused
  from `recent-drawings`. Tiny bucket shows the count.
- **`team` scope deferred with rationale**: the legacy `drawings-in-
  progress` labeled its 'all' mode as 'team', but
  `/api/admin/cad/drawings` has no per-team filter today — `team`
  was the same fetch as `all`. The new widget ships `mine | all`
  and the doc captures that a real team filter belongs alongside
  the drawings-collaboration assigned_to work in a follow-up.
- Widget-links registry gains the `drawings` entry pointing at
  `/admin/cad` (same as the two legacy entries).
- Widget-options schema entry added (`source: 'settings-form'`).
- The two legacy widgets carry a one-line `SUPERSEDED by
  drawings` comment above their `defineWidget(...)` calls but
  stay registered so existing hub layouts don't lose their tiles;
  a follow-up slice migrates saved layouts + deletes the legacy
  ids. **No hub-store migration in this slice** — keeping the
  legacy ids registered means no migration is needed yet.
- 1 spec on `capForBucket`. Existing catalog-coverage test bumped
  to 43 entries (41 master + `approvals` + `drawings`).
- **2055** middleware + notifications + hub + admin + saas +
  contacts + jobs specs green; typecheck + lint clean.

### Slice 5 — Activity widget (cluster 3 → 1)

- Merge `job-activity-feed` + `recent-activity` into one
  `activity` widget with `mode: 'job-events' | 'recent-pages'`.
  **Keep `my-jobs` separate** — it's the headline widget on the
  user's current canvas (per the screenshots) and its data shape
  (rows of jobs) is meaningfully different from the event feeds.
- Mark the two old ids superseded.
- Tests: per-mode rendering + mode persistence.

### Slice 6 — Delete `/admin/messages/contacts`, fold into the
  inbox sidebar

- The contacts directory inside the messages workspace has now
  been replicated by `/admin/contacts` (the contacts plan). The
  team-directory variant adds nothing on top of putting a
  participant search box in the messages-inbox sidebar.
- Action: delete the page; add the contact picker as a sidebar
  inside `/admin/messages`; update the registry + nav. Add a
  redirect from `/admin/messages/contacts` → `/admin/contacts`.
- Touch the quick-actions catalog and route registry; lock the
  redirect with a spec.

### Slice 7 — Verify-and-clean
  (`/admin/work-mode/*`, `/admin/research-cad`, `/admin/dashboard`)

- These were flagged as "verify before action" by the explorer
  agent. Per-slice steps:
  - `/admin/work-mode/*` — git-blame each per-role landing; if the
    most-recent meaningful commit is older than the
    `/admin/work` introduction, archive the lot.
  - `/admin/research-cad` — read the page; if it's a legacy
    alias for `/admin/cad` (CAD launched from research context),
    add a server-side redirect.
  - `/admin/dashboard` — confirm whether anything non-Hub still
    lives here. If yes, port to a widget. If no, redirect to
    `/admin/me`.
- Stop the slice with a one-line rationale per path so the audit
  doc reflects the decision even when the action is "kept for
  reason X".

### Slice 8 — API dead-code sweep

- Delete `/api/admin/badges/route.ts` — the badges payload is already
  returned from `/api/admin/rewards?section=badges`. Grep any
  caller; rewrite the one fetch if it exists; remove the route file.
- Delete `/api/admin/team/[email]/today/route.ts` — zero callers in
  the codebase per the audit. Document the call-site search in the
  commit so anyone resurrecting the feature knows why it went.
- 0 specs (deletions). The notify-link audit catches stale links to
  the deleted paths if any sneak in.

### Slice 9 — Quick-actions catalog cleanup

- Three tiles point at pages whose data is now widget-equivalent
  (`Approve Receipts` / `Send Message` / `Schedule`). The
  recommendation from the explorer agent: **keep as power-user
  shortcuts** — they're 1-click jumps, not duplicates.
- Action: stamp the catalog with a one-line "intentional shortcut
  duplicate" comment on each so a future reviewer doesn't try to
  delete them. The slice ships in case any new redundant tile got
  added since the audit — recheck + comment, no removals.

## Out of scope / placeholder

- **Tearing down legacy dashboard pages** (`/admin/jobs`,
  `/admin/schedule`, `/admin/receipts`, `/admin/hours-approval`)
  — they're "fuller" surfaces for detailed work; the hub widgets
  are summaries, not replacements. Touching them is a separate,
  bigger redesign.
- **Merging `/admin/employees` + `/admin/employees/manage` +
  `/admin/users`** — the agent flagged a possible consolidation,
  but the three serve different roles (payroll vs. user
  registration vs. per-employee deep-dive). Belongs in its own
  plan once we've talked through the workflow.
- **Backfilling redirects for every URL that ever existed** —
  scoped to the five `my-*` paths + `/admin/messages/contacts` for
  now. If we hit broken-link reports, we'll add more.

## Guardrails

- Don't break a URL the user (or a notification's deep-link) might
  rely on without adding a redirect. Per-slice notify-links audit
  catches stale `link: '/admin/x'` strings; deleted pages need a
  redirect rule before the file disappears.
- Don't delete a widget that any saved hub layout references
  without first writing a migration that swaps the saved row for
  the replacement.
- Each slice: typecheck + lint + commit + push + annotate this
  doc. Slices 3-5 should each be followed by an in-browser hub
  smoke test before declaring success — the lay-out math is real.

## TL;DR

Nine slices: a frozen audit doc; delete five `my-*` legacy redirect
pages + redirect to the hub; collapse the three approval widgets
into one, the two drawings widgets into one, and the two activity
feeds into one; delete the messaging team directory and fold it into
the inbox sidebar; verify-and-clean three more suspicious paths;
delete two dead API routes; comment-stamp the quick-actions
intentional shortcuts. Net result: ~5 fewer pages, ~6 fewer widget
ids, 2 dead API routes removed, a clearer mental model, and one
document future PRs can cite when they want to push or block a
consolidation.
