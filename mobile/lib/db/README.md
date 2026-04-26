# Starr Field — local DB + sync (PowerSync)

This directory wires up the offline-first SQLite database that backs
every Starr Field feature, plus the bidirectional sync engine that
keeps it in step with the Supabase Postgres the web admin uses.

## What's here

```
lib/db/
├── schema.ts      # PowerSync schema — 12 tables matching plan §6.3
├── connector.ts   # SupabaseConnector (fetchCredentials + uploadData)
├── index.ts       # Lazy singleton + DatabaseProvider
└── README.md      # this file
```

The choice of PowerSync over WatermelonDB is documented in plan §6.1
v3 audit pass (decision deadline = end of Phase F0).

## Running mode matrix

| `EXPO_PUBLIC_POWERSYNC_URL` | Local SQLite | Cloud sync | Useful for |
|---|---|---|---|
| missing / empty | works fully | disabled | dev before PowerSync is provisioned, demos, F1 prototyping against canned data |
| set but service down | works fully | retrying with backoff | flaky-network field testing |
| set + service up | works fully | live bidirectional | production |

The local SQLite is the source of truth for the UI either way — the
sync engine is invisible from the screen layer's perspective.

## F0 / F1 status

What's wired:
- [x] PowerSync schema reconciled to real Supabase shape (F1 #1):
      jobs (full column set per `app/api/admin/jobs/route.ts`),
      daily_time_logs + job_time_entries (the actual time-tracking
      pair — plan §6.3 referenced a single `time_entries` table that
      doesn't exist), fieldbook_notes (per `seeds/099_fieldbook.sql`),
      plus the 8 fully-owned Starr Field tables.
- [x] SupabaseConnector with PUT/PATCH/DELETE → Supabase replay
- [x] DatabaseProvider connects/disconnects with auth state
- [x] Local DB works offline-only when `EXPO_PUBLIC_POWERSYNC_URL` is unset

Activation gates (each blocks live sync but NOT local-only dev):
- [ ] **Schema snapshot** (plan §15): run
      `scripts/snapshot-existing-schema.sql` in the Supabase SQL
      Editor; copy the output into a new
      `seeds/214_starr_field_existing_schema_snapshot.sql` (wrap in
      `BEGIN; … COMMIT;` per the seed convention). Validate the
      column-list against `lib/db/schema.ts` and add any columns the
      mobile UI references but the snapshot didn't include.
- [ ] Apply `seeds/220_starr_field_receipts.sql` to the live Supabase
      project (Phase F2 #1 — adds `receipts` + `receipt_line_items`
      tables, RLS, and the private `starr-field-receipts` storage
      bucket). Subsequent Starr Field tables ship as 221_*, 222_*,
      etc. — one phase per file rather than the original monolithic
      `220_starr_field_tables.sql` proposed in the plan.
- [ ] Provision PowerSync service (Cloud or self-hosted, see below).
- [ ] Author sync rules — see "Sync rules" below.
- [ ] Set `EXPO_PUBLIC_POWERSYNC_URL` in `mobile/.env.local` (dev) and
      in your EAS build profile (TestFlight / production).

## Provisioning PowerSync

### Option 1: PowerSync Cloud (recommended for v1)

1. Sign up at <https://powersync.com>.
2. Create a new instance — point it at the Starr Surveying Supabase
   Postgres connection string. PowerSync needs the connection string
   AND a Postgres role with `REPLICATION` privilege; the standard
   Supabase service-role connection works.
3. Copy the instance URL (e.g. `https://abc123.powersync.journeyapps.com`)
   to `EXPO_PUBLIC_POWERSYNC_URL`.
4. Configure auth — point PowerSync at the same JWT issuer Supabase
   uses (the Supabase project URL + JWT secret). PowerSync verifies
   tokens against this issuer; sync rules then read JWT claims for
   per-user scoping.

Cost: free up to 1k MAU on Cloud. At 5 employees we're nowhere near
that. Re-evaluate at Phase F (public go-live) when paying customer
counts could grow.

### Option 2: Self-host (if Cloud limits become an issue)

PowerSync ships a Docker image. Deploy it on the Hetzner host
alongside the worker (per plan §6 monorepo footprint). The
`docs/platform/STORAGE_LIFECYCLE.md` runbook is the closest analog
for ops conventions.

## Sync rules

Sync rules are declarative SQL-flavored YAML stored on the PowerSync
service, not in this repo. They define which Postgres rows replicate
to which mobile clients. Per plan §5.10.1 the privacy contract is
"only the user themselves and explicit admins can read another user's
location records" — that translates to bucket scoping like:

```yaml
bucket_definitions:
  by_user:
    parameters: |
      SELECT
        request.user_id()  AS user_id,
        request.jwt() ->> 'email' AS user_email
    data:
      - SELECT * FROM field_data_points WHERE created_by = bucket.user_id
      - SELECT * FROM daily_time_logs   WHERE user_email = bucket.user_email
      - SELECT * FROM job_time_entries  WHERE user_email = bucket.user_email
      - SELECT * FROM location_stops    WHERE user_id    = bucket.user_id
      - SELECT * FROM location_segments WHERE user_id    = bucket.user_id
      - SELECT * FROM receipts          WHERE user_id    = bucket.user_id

  by_company:
    # Jobs and reference tables — visible to all employees of the
    # company. The is_company_member() helper is a SECURITY DEFINER
    # function defined in seeds/210_hardening.sql.
    parameters: SELECT request.user_id() AS user_id
    data:
      - SELECT * FROM jobs WHERE is_company_member(bucket.user_id, jobs.company_id)
      - SELECT * FROM vehicles WHERE is_company_member(bucket.user_id, vehicles.company_id)
      - SELECT * FROM point_codes
```

(That snippet is illustrative — author the real rules with PowerSync's
schema-aware editor against the live Postgres once the schema is
applied.)

## Testing without sync

For F0 dev work and feature development before PowerSync provisioning:

1. Leave `EXPO_PUBLIC_POWERSYNC_URL` empty in `.env.local`.
2. The connector returns `null` credentials → PowerSync silently sits
   in disconnected mode.
3. Use `usePowerSync()` and `useQuery()` from `@powersync/react`
   normally. Reads return local rows; writes hit local SQLite and
   queue indefinitely (PowerSync replays the queue when sync resumes,
   so no work is lost).
4. Seed local data with `db.execute('INSERT INTO ...')` from a dev
   utility screen, OR import a fixture JSON in your screen's effect.

## Phase F1 follow-ups

- Bucket-aware upload prioritization (plan §6.4: time entries first,
  then receipts, then notes, then media). PowerSync queues are FIFO
  today; need a custom strategy.
- Soft-delete for `receipts` per plan §5.11.9 IRS 7-year retention.
- Idempotency keys for clock-in / clock-out so a flaky network retry
  doesn't double-stamp.
- Conflict resolution policy for time-entry edits (plan §5.9 says
  pre-approval edits use last-write-wins, post-approval edits require
  admin — needs server-side logic enforced via Postgres trigger or
  Supabase RPC, NOT mobile-side rules).
