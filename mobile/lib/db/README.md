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
      bucket).
- [ ] Apply `seeds/221_starr_field_data_points.sql` (Phase F3 #1 —
      adds `field_data_points` + `field_media`, three private storage
      buckets `starr-field-photos` / `-videos` / `-voice`, RLS, and
      column-level GRANT allowlists). Apply BEFORE the F3 mobile
      capture flow ships (F3 #2+).
- [ ] Apply `seeds/222_starr_field_notifications.sql` (resilience batch
      — extends the existing web `notifications` table with
      `target_user_id` UUID + `delivered_at` / `dismissed_at` /
      `expires_at`, enables RLS for mobile owners + column-level GRANTs,
      and adds the `notifications_inbox` view). Non-breaking ALTER —
      web admin's NotificationBell + lib/notifications.ts continue to
      work unchanged. Apply BEFORE the mobile NotificationBanner +
      admin /admin/team Ping button ships.
- [ ] Apply `seeds/223_starr_field_location_pings.sql` (background GPS
      tracking — adds the append-only `location_pings` table with
      battery snapshot + RLS owner-only INSERT/SELECT). Powers the
      mobile `lib/locationTracker.ts` background task and the "Last
      seen" column on the dispatcher Team page. Apply BEFORE
      `EAS build` for a release that has background tracking enabled
      (the native config in `app.json` requests Always-On location +
      foreground service permission, which won't make sense without
      the table to write to).
- [ ] Apply `seeds/224_starr_field_location_derivations.sql` (daily
      timeline derivation — adds `location_stops` + `location_segments`
      tables, the `derive_location_timeline(p_user_id, p_log_date)`
      PL/pgSQL aggregator, and the `haversine_m` distance helper).
      Powers the `/admin/timeline` view + the "Recompute" button.
      Apply BEFORE the `/admin/timeline` route is exposed to admins
      (the page reads from these tables). Idempotent — safe to call
      `derive_location_timeline()` repeatedly; user-overridden stops
      are preserved across recomputes.
- [ ] Apply `seeds/225_starr_field_vehicles.sql` (fleet roster — adds
      the `vehicles` table referenced by the mobile schema since
      seeds/220 + the FKs from `job_time_entries.vehicle_id` and
      `location_segments.vehicle_id`). Powers the mobile vehicle
      picker on clock-in (per-clock-in IRS mileage attribution) and
      the `/admin/vehicles` CRUD page. Apply BEFORE the mobile
      vehicle picker ships.
- [ ] Apply `seeds/226_starr_field_files.sql` (F5 generic file
      attachments — adds `job_files` table + `starr-field-files`
      storage bucket + per-user-folder RLS). Powers the
      `lib/jobFiles.ts` capture flow ("+ Attach file" on the point
      detail screen) and the Files block on `/admin/field-data/[id]`.
      Apply BEFORE the mobile file picker ships.
- [ ] Apply `seeds/227_starr_field_geofence_classifier.sql` (F6 v2
      stop-classification — replaces `derive_location_timeline` with
      a version that joins `jobs.{centroid_lat, centroid_lon,
      geofence_radius_m}` to label each derived stop with the
      matching job's name + `category_source='geofence'`). Apply
      AFTER seeds/224. Idempotent — `CREATE OR REPLACE FUNCTION`,
      safe to re-apply. Once applied, dispatchers use the "📍 Set
      as job site" button on `/admin/timeline` to capture each
      job's geofence from a real stop centroid.
- [ ] Apply `seeds/228_starr_field_voice_transcription.sql` (F4
      voice-transcription tracking — adds
      `transcription_status` / `transcription_error` /
      `transcription_started_at` / `transcription_completed_at` /
      `transcription_cost_cents` to `field_media` + two partial
      indexes for the worker poll). Apply AFTER seeds/221. Powers
      the OpenAI Whisper worker job at
      `worker/src/services/voice-transcription.ts` + CLI at
      `worker/src/cli/transcribe-voice.ts` + on-demand endpoint
      `POST /starr-field/voice/transcribe`. Set `OPENAI_API_KEY` on
      the worker before deploying.
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
      # Admin → user pings (resilience batch). seeds/222 adds the
      # target_user_id UUID column to the existing notifications
      # table so this scoping works without an email join. We OR on
      # user_email as a belt-and-braces fallback for rows where the
      # trigger hadn't yet back-filled target_user_id (a race-window
      # of <1 ms in practice, but cheap to cover). The filter
      # excludes dismissed / expired rows so old reminders don't
      # keep replaying to the device.
      - SELECT * FROM notifications
          WHERE (
              target_user_id = bucket.user_id
              OR LOWER(user_email) = LOWER(bucket.user_email)
            )
            AND is_dismissed = false
            AND (expires_at IS NULL OR expires_at > now())
      # Location pings — owner-only, last 24 hours. PowerSync only
      # needs to mirror RECENT pings so the mobile UI can render
      # "today's route." Older pings stay server-side for F6 reports.
      # The local SQLite stays bounded; the row count grows by ~960
      # per 8-hour shift before pruning naturally.
      - SELECT * FROM location_pings
          WHERE user_id = bucket.user_id
            AND captured_at > now() - interval '24 hours'
      # Derived stops + segments — owner-only, last 7 days. These
      # roll up the raw pings into a daily timeline (seeds/224 +
      # /admin/timeline). Mobile reads them on the Me → Privacy
      # screen for "your day, summarised."
      - SELECT * FROM location_stops
          WHERE user_id = bucket.user_id
            AND arrived_at > now() - interval '7 days'
      - SELECT * FROM location_segments
          WHERE user_id = bucket.user_id
            AND started_at > now() - interval '7 days'
      # Vehicle roster — read-only on mobile. Active vehicles only
      # (RLS already filters this server-side; mobile filter is a
      # belt-and-braces guard for the picker query).
      - SELECT * FROM vehicles WHERE active = true
      # Job + point file attachments (F5). Owner-only; mobile
      # surfaces files captured in the last 90 days for the offline
      # gallery while older rows live server-side.
      - SELECT * FROM job_files
          WHERE created_by = bucket.user_id
            AND created_at > now() - interval '90 days'

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
