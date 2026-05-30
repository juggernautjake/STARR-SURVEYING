# Admin surface audit — 2026-05-30

*Frozen-in-time catalog of every admin page, hub widget, and admin
API route in the repo on 2026-05-30. Produced as Slice 1 of the
`consolidation-2026-05-30.md` planning doc. Future PRs that want
to push or block a consolidation should cite the row from this doc
that justifies the action.*

The numbers below come from three background-explorer surveys on
2026-05-30 + spot-checks (`find app/admin -name page.tsx | wc -l`
returned 135; the route survey counted 127 page.tsx files that
correspond to user-visible admin routes — the delta is component-
adjacent files that aren't real routes).

---

## 1. Admin pages

**Total `page.tsx` files**: 135. ~17 are top-level destinations
surfaced in the nav rail; the rest are deep / sub routes.

### Classification

- **`active`** — currently used + uniquely scoped. Leave alone.
- **`legacy-redirect`** — exists only to issue a redirect. Safe to
  delete after middleware-level redirect rules land (Slice 2).
- **`consolidation-candidate`** — overlaps another page; merge target
  identified.
- **`verify-before-action`** — flagged by the audit but the action
  needs a code read or git history check before committing.

### Findings table

| Path                              | Classification             | Notes                                                                                              |
|-----------------------------------|----------------------------|----------------------------------------------------------------------------------------------------|
| `/admin/my-jobs`                  | `legacy-redirect`          | Redirects to `/admin/me?tab=jobs` per the 2024 hub redesign. Delete in Slice 2.                    |
| `/admin/my-hours`                 | `legacy-redirect`          | Same — redirects into the hub. Delete in Slice 2.                                                  |
| `/admin/my-pay`                   | `legacy-redirect`          | Same. Delete in Slice 2.                                                                           |
| `/admin/my-notes`                 | `legacy-redirect`          | Same. Delete in Slice 2.                                                                           |
| `/admin/profile`                  | `legacy-redirect`          | Redirects to `/admin/me?tab=profile`. Delete in Slice 2.                                           |
| `/admin/dashboard`                | `consolidation-candidate`  | Pre-hub dashboard; `/admin/me` is the successor + pulls the same data via widgets. Slice 7.        |
| `/admin/messages/contacts`        | `active` (kept after audit)| Initially flagged as a consolidation candidate; on inspection it serves a distinct audience (internal teammates for messaging vs. external CRM contacts on `/admin/contacts`). Slice 6 added clarifying cross-link banners + sharpened descriptions; deletion deferred. |
| `/admin/work-mode/admin`          | `verify-before-action`     | Role-specific work-mode landing; appears superseded by `/admin/work`. Verify + archive in Slice 7. |
| `/admin/work-mode/developer`      | `verify-before-action`     | Same.                                                                                              |
| `/admin/work-mode/field_crew`     | `verify-before-action`     | Same.                                                                                              |
| `/admin/work-mode/researcher`     | `verify-before-action`     | Same.                                                                                              |
| `/admin/work-mode/drawer`         | `verify-before-action`     | Same.                                                                                              |
| `/admin/work-mode/equipment_manager` | `verify-before-action`  | Same.                                                                                              |
| `/admin/work-mode/tech_support`   | `verify-before-action`     | Same.                                                                                              |
| `/admin/work-mode/start`          | `verify-before-action`     | Same.                                                                                              |
| `/admin/research-cad`             | `verify-before-action`     | Unclear remit vs `/admin/cad` + `/admin/research`. Verify in Slice 7.                              |
| `/admin/me`                       | `active`                   | The hub. Centerpiece of every consolidation in this plan.                                          |
| `/admin/work`                     | `active`                   | Work-mode landing. Phase 3 redesign target.                                                        |
| `/admin/office`                   | `active`                   | Office-mode landing.                                                                               |
| `/admin/jobs` + `/admin/jobs/[id]`| `active`                   | The full jobs list + per-job detail. The hub widget shows summary; this page is the deep view.     |
| `/admin/contacts` + `/admin/contacts/[id]` | `active`         | New surface from the contacts plan; Slices 3-4 of that plan land the pages.                        |
| `/admin/messages`                 | `active`                   | Inbox. Slice 6 folds `/messages/contacts` into here.                                               |
| `/admin/schedule`                 | `active`                   | Full calendar. Hub widget summarizes; this is the editor.                                          |
| `/admin/receipts`                 | `active`                   | Full approval queue. Hub widget = `pending-receipts` summary.                                      |
| `/admin/hours-approval`           | `active`                   | Same — full vs widget.                                                                             |
| `/admin/time-off`                 | `active`                   | Full vs widget.                                                                                    |
| `/admin/employees` / `manage`     | `active` (with future ask) | Two surfaces; consolidation plan deferred (different roles).                                       |
| `/admin/users`                    | `active`                   | Auth-side user mgmt; distinct from `/admin/employees`.                                             |
| (the other 99 paths)              | `active`                   | Deep routes serving distinct functions; no overlap candidates surfaced by the audit.               |

---

## 2. Hub widgets

**Total widget directories**: 43 under `lib/hub/widgets/*/index.tsx`.

### Consolidation clusters

| Cluster ID         | Members                                                            | Plan slice |
|--------------------|--------------------------------------------------------------------|------------|
| `approvals`        | `pending-hours`, `pending-receipts`, `pending-time-off`            | Slice 3    |
| `drawings`         | `recent-drawings`, `drawings-in-progress`                          | Slice 4    |
| `activity`         | `job-activity-feed`, `recent-activity`                             | Slice 5    |
| `schedule-overlap` | `today-schedule`, `crew-calendar`, daily-briefing's schedule slice | Not merging — different audiences (mine / crew / digest). Documented and intentional. |
| `messaging`        | `messages`, `mentions-inbox`, `open-discussions`                   | Not merging — different surfaces for different cadences. Documented and intentional.  |

### Other widgets (unique)

Each of the remaining 34 widgets covers a distinct slice
(`my-jobs`, `my-pay`, `quick-actions`, `weather`, `team-status`,
etc.). `my-jobs` shares a domain with the activity cluster but its
row-shape (job rows, not events) is intentionally separate; not a
merge target.

---

## 3. Admin API routes

**Total `app/api/admin/**/route.ts` files**: 267 (spot-check `find …
| wc -l` = 267; the explorer counted 278 route URLs across method
overlaps; both numbers cite the same set of files).

### Domain distribution

| Domain      | Count |
|-------------|-------|
| research    | 57    |
| equipment   | 35    |
| learn       | 33    |
| jobs        | 17    |
| cad         | 13    |
| personnel   | 8     |
| pay-config  | 8     |
| messages    | 8     |
| payroll     | 7     |
| reports     | 6     |
| time-logs   | 5     |
| maintenance | 5     |
| billing     | 5     |
| receipts    | 4     |
| (20 others, ~41 routes) | — |

### Honest finding

The API surface is **already clean**. Most apparent duplication is
intentional mode-splitting via query params (`?my_jobs=`, `?stage=`,
`?unread=`). The high-confidence dead-code wins are narrow:

| Endpoint                          | Verdict                                                                          | Plan slice |
|-----------------------------------|----------------------------------------------------------------------------------|------------|
| `/api/admin/badges`               | Dead — `/api/admin/rewards?section=badges` returns the badges payload too.       | Slice 8    |
| `/api/admin/team/[email]/today`   | Zero callers in `app/` + `lib/` per the audit grep; likely legacy scaffold.      | Slice 8    |

### Cron routes — no overlap

9 cron routes, each with a distinct trigger + audience:

| Cron                          | Trigger        | Audience              |
|-------------------------------|----------------|-----------------------|
| `assignments-due-reminder`    | daily          | assignees             |
| `daily-briefing`              | weekday morning| every active user     |
| `drawing-due-reminder`        | daily          | drawer + job team     |
| `equipment-overdue-digest`    | daily          | dispatchers           |
| `equipment-overdue-nag`       | every 3h x2/day| individual checkouts  |
| `maintenance-schedule-tick`   | daily          | maintainers           |
| `schedule-event-reminders`    | hourly         | event assignees       |
| `trial-ending`                | daily          | org admins            |
| `weekly-reports`              | Mon morning    | owners                |

No consolidation needed.

---

## How to use this doc

- A PR that wants to **delete** an admin page / widget / API: cite
  the row + classification above.
- A PR that wants to **add** a new page that overlaps an existing
  cluster: link to this audit + the relevant cluster row in your
  proposal.
- When this audit goes stale (next major redesign), re-run the
  three background-explorer surveys + amend this doc instead of
  forking a new one.
