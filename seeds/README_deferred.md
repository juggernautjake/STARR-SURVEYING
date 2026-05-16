# Deferred Schema — Tables With No Active Code

This document lists database tables that historically existed (or were planned)
but **have no schema definition in this repository** AND **no current
code path queries them**. They're vestigial — leftover from refactors,
abandoned feature ideas, or older versions of the codebase.

**Status:** explicitly deferred. These tables are NOT created when you apply
the full seed set. The live app does not depend on them.

**When to revisit:** only when a specific feature gets actively built (or
revived) that needs the table. At that point, write a new `seeds/2XX_*.sql`
file with the right schema and apply it.

---

## The deferred list

| Table | Probable original feature | Route(s) that would use it | Current status |
|---|---|---|---|
| `employees` | Older payroll/HR feature, separate from `employee_profiles` | `/admin/employees` (legacy) | Replaced by `employee_profiles` — keep that, ignore this |
| `time_logs` | Older time-tracking, separate from `job_time_entries` | `/admin/my-hours` (older variant) | Replaced by `job_time_entries` + `daily_time_logs` |
| `discussions` + `discussion_messages` | Threaded forum / discussion boards | `/admin/discussions` | Feature not built, no demand at current scale |
| `message_contacts` | Per-user DM contact list / favorites | `/admin/messages` extension | Messaging works without it |
| `notes` | Free-form note-taking surface | `/admin/notes` | Feature not built |
| `leads` | Lead-tracking / pre-job CRM | `/admin/leads` | Feature not built; jobs cover the pipeline today |
| `learning_progress` | Per-user Academy module progress | `/admin/learn/*` | Academy bundle not built out |
| `rewards_balance` + `rewards_history` | Gamification / points system | `/admin/rewards/*` | Feature not built |
| `schedule_events` | Standalone calendar events distinct from jobs | `/admin/schedule` | Feature not built; assignments cover scheduling today |
| `receipt_attachments` | Multi-file attachments per receipt | extends `/admin/receipts` | Base `receipts` table works without it |
| `location_derivations` | Aggregated stops/segments from `location_pings` | `/platform/dev/team-map` (future) | Compute on the fly today; aggregation cron is a future optimization |

## How to confirm a table is truly vestigial before re-adding it

Before resurrecting any of these, run:

```bash
grep -rn "\.from('<TABLE_NAME>'" app/ lib/ 2>/dev/null
grep -rn "<TABLE_NAME>" mobile/ worker/ 2>/dev/null | grep -v node_modules
```

If both come back empty, no code path will use the table even if you create
it. If there's an active call site you want to keep, codify the schema as
a new seed file.

## Why these aren't in the regular seed flow

The original Supabase project was set up by hand-running SQL at various
points before the `seeds/` directory became the canonical source of truth.
Some tables landed in the DB but never got back-filled into the repo. As
features got refactored or abandoned, the schema-but-no-code gap widened.

This file is the audit trail. Updated when the picture changes.

---

**Last reviewed:** 2026-05-15 (after seeds 220-282 applied to `pmpjaqrmxnbfdayddrha`)
