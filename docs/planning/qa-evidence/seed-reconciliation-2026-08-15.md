# Seed reconciliation against the live database

C48–C50 of `docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md`.

> **Owner, 2026-08-15:** *"please make sure that all sql seed files have been applied to the
> supabase database"*

Measured by `node scripts/seed-reconcile.mjs`, 2026-08-15.

---

## There is no migration-tracking table

Checked first, because the whole method depends on it: nothing in `public` matches `%migration%`,
`%seed%` or `%schema_version%`. So "which seeds have been applied" cannot be answered by asking.
It has to be inferred from what each seed *declares* and whether the live schema has it.

That inference is sound in one direction only, and the report is deliberately asymmetric about it:

* a seed whose declared table or column is **missing** has certainly not been applied;
* a seed whose objects are all present **probably** has been — but an `IF NOT EXISTS` seed whose
  table an earlier seed created looks identical to one that ran.

"Present" is therefore not a claim that the seed ran. It is the weaker and sufficient claim that
**nothing it declares is absent**, which is the property that actually matters before applying
anything.

---

## The result

| | count |
|---|---|
| Seed files | **392** |
| PRESENT — nothing they declare is absent | **224** |
| MISSING — certainly not applied | **0** |
| UNVERIFIABLE — declare no schema (data-only) | **168** |

**Nothing is outstanding.** Every seed in the repository that declares a table or a column has that
object in the live database.

Data-only seeds are reported separately rather than folded into "present". Counting a seed that
creates no columns as applied *because* it creates no columns would be the instrument manufacturing
a clean number — a failure this document has already paid for four times.

---

## The instrument was wrong first, and the way it was wrong is worth keeping

The first run reported **5 seeds missing**, naming tables called `above`, `leaves`, `with`, `if` and
`throughout`. Those are prose words. Seed 226 line 77 reads:

```
-- app/api/admin/jobs/files/route.ts. In that case the CREATE TABLE above is a
```

The parser strips `--` line comments before scanning, so this should have been removed. It was not,
and the reason is specific to this repository: **every file here is CRLF**, so splitting on `\n`
leaves a trailing `\r` on each line — and in JavaScript `.` does **not** match `\r`. It excludes all
four line terminators, not just `\n`. With no `m` flag, `$` means end of string, which sits after
the `\r`. So `/--.*$/` matched **nothing, on any line, of any of the 392 files**.

The comment stripping was entirely inert and looked like it was working. That it produced five
findings rather than fifty is luck, not partial success: a silently disabled filter is
indistinguishable from a filter with nothing to do. Normalising line endings first is the fix, and
it runs before anything else reads the text so no later pattern inherits the same blind spot.

---

## Drift the other way: 11 live tables no seed creates

The reconciliation above only asks whether the database has what the repo declares. The reverse
question turned out to matter more.

| Table | Almost certainly from |
|---|---|
| `calls`, `call_events` | the business-phone work (recorded as "seeds 594/595 live") |
| `job_briefings`, `job_briefing_items` | job briefings |
| `weekly_pay_periods`, `job_payment_allocations` | payroll / finance |
| `admin_alert_settings`, `user_bookmarks` | admin preferences |
| `pinned_messages`, `typing_indicators`, `user_presence` | messaging |

These were applied directly to the live database and their seed files never landed in the
repository. **The schema is not reproducible from a clean database for any of them**, which is the
thing to know: a fresh environment built from `seeds/` alone would be missing eleven tables and
would fail wherever they are read.

Reported, not fixed. Writing DDL to match a live table is how a "migration" that does not actually
match gets shipped — the shape would be reverse-engineered from column names and the constraints,
defaults and indexes invented. Recovering these properly means dumping the real definitions, which
is a separate piece of work with the owner's environment in front of it.

Views are excluded from that list. The parser only looks for `CREATE TABLE`, so all 11 live views
are unmatched *by construction*; folding them in reported 22 where 11 are real, and half a finding
list that is an artefact is worse than no list.

---

## Seed numbering

`596_fieldbook_notes_mobile_columns.sql` (C44z) is numbered 596, not 594. The phone work's
migrations occupy 594 and 595 in the live database's history even though those files are not in the
repository — `calls` and `call_events` above are the evidence. Reusing 594 would have made two
different migrations share a number in a project that has no migration table to disambiguate them.

---

## Applied and verified in this document

| Seed | Applied | Verified |
|---|---|---|
| 592 vehicle MPG + fuel price | C0b2 | columns + `app_settings` row, live |
| 593 jobs geofence columns | C0d1 | three columns on `jobs`, live |
| 596 fieldbook_notes mobile columns | C44z, 2026-08-15 | five columns + three indexes read back from `information_schema`, and the routes' exact `SELECT` run successfully against the live table |
