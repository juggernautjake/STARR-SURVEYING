/**
 * PowerSync local-SQLite schema for Starr Field.
 *
 * This file is the mobile projection of the live Supabase schema.
 * PowerSync replicates rows from Postgres to local SQLite according
 * to sync rules defined server-side; this schema tells the client
 * which tables exist and what shape rows have when they arrive.
 *
 * Three categories of tables:
 *
 *   1. Fully-owned by Starr Field — full schema declared here, mobile
 *      reads and writes everything. New tables landing in
 *      seeds/220_starr_field_tables.sql:
 *        field_data_points, field_media, location_stops,
 *        location_segments, receipts, receipt_line_items, vehicles,
 *        point_codes
 *
 *   2. Shared with web admin — schema pre-dates Starr Field. The
 *      mobile UI consumes specific columns; we declare those plus the
 *      mobile-specific columns added by ALTERs in seeds/220_*. The
 *      shapes here come from inspecting app/api/admin/jobs/** and
 *      app/api/admin/time-logs/**; validate against the snapshot
 *      output of scripts/snapshot-existing-schema.sql when it lands.
 *        jobs, daily_time_logs, job_time_entries, fieldbook_notes
 *
 *   3. Read-only enrichment — mobile reads but doesn't mutate
 *      (point_codes — the 179-code Starr Surveying taxonomy, vehicles
 *      until F1+ adds in-app vehicle creation).
 *
 * F1 #1 schema reconciliation:
 *
 *   Plan §6.3 originally referenced a `time_entries` table. The
 *   actual schema has TWO tables: daily_time_logs (per-day per-user
 *   pay calculation) and job_time_entries (per-job duration_minutes
 *   slices of a daily log). Mobile clock-in/out writes one row per
 *   tab per day plus N job-time-entry rows. The plan §6.3 SQL is
 *   superseded by this file + the snapshot output; treat the plan
 *   text as historical context.
 *
 * F2 #1 receipts schema:
 *
 *   `receipts` and `receipt_line_items` are created by
 *   seeds/220_starr_field_receipts.sql. Identity is `auth.users.id`
 *   (UUID stored as text) — different from daily_time_logs which
 *   uses user_email TEXT. Plan §5.10 calls out the unification
 *   contract: both web and mobile resolve to the same auth.users row.
 *   Mobile reads session.user.id for receipt writes.
 *
 *   Extraction tracking lives on the receipts row itself
 *   (extraction_status / *_at / *_cost_cents) rather than a separate
 *   table — the worker updates these in-place when AI extraction
 *   completes. Mobile shows "AI working…" while extraction_status is
 *   'queued' or 'running'.
 *
 * F3 #1 data points + media schema:
 *
 *   `field_data_points` and `field_media` are created by
 *   seeds/221_starr_field_data_points.sql. Same UUID-identity
 *   convention as receipts (created_by references auth.users.id).
 *
 *   Media has three storage tiers — storage_url (display, fast-sync
 *   medium quality), thumbnail_url (list tiles), original_url (full
 *   resolution; WiFi-only sync by default per plan §5.4). Plus an
 *   optional annotated_url for the rendered overlay when the user
 *   adds arrows / circles / text — the original is ALWAYS preserved
 *   unmodified.
 *
 *   upload_state (pending → wifi-waiting → done) lets the UI surface
 *   "where's my high-res?" without polling storage. Burst captures
 *   share a burst_group_id with monotonic `position` so the admin
 *   timeline groups a 12-shot panorama instead of flooding.
 *
 *   Storage buckets: starr-field-photos / -videos / -voice (separate
 *   so each can have its own size + MIME limits per audit #17). All
 *   three follow the F2 path convention {user_id}/{...}.{ext} so the
 *   per-user-folder RLS pattern applies identically.
 *
 * Notes on column types:
 *
 *   - PowerSync supports `text`, `integer`, `real`. UUIDs land as text;
 *     timestamps land as ISO-8601 text; JSONB lands as text (parse on
 *     read). PostGIS GEOMETRY (location_segments.path_simplified) is
 *     intentionally NOT declared in the local schema — it never syncs
 *     to mobile. Mileage display reads distance_meters; the simplified
 *     polyline is server-only.
 *
 *   - Every table includes `id` (uuid text) implicitly per PowerSync's
 *     model — don't redeclare it.
 *
 *   - `client_id` columns are mobile-only dedup keys for the offline
 *     sync queue (plan §6.4). Not enforced as unique here; the server
 *     uploadData adapter merges by client_id when present.
 */
import { Schema, Table, column } from '@powersync/react-native';

/**
 * Mobile read/write tables — full local shape matches Postgres.
 */

const field_data_points = new Table({
  job_id: column.text,
  name: column.text,
  code_category: column.text,
  description: column.text,
  device_lat: column.real,
  device_lon: column.real,
  device_altitude_m: column.real,
  device_accuracy_m: column.real,
  device_compass_heading: column.real,
  is_offset: column.integer, // 0/1 boolean
  is_correction: column.integer,
  corrects_point_id: column.text,
  created_by: column.text,
  created_at: column.text,
  updated_at: column.text,
  client_id: column.text,
});

const field_media = new Table({
  job_id: column.text,
  data_point_id: column.text,
  media_type: column.text, // 'photo' | 'video' | 'voice'
  // Three storage tiers + an optional rendered-overlay layer (plan §5.4
  // photo annotation). Original is ALWAYS preserved unmodified;
  // annotated_url renders arrows / circles / text on top.
  storage_url: column.text,
  thumbnail_url: column.text,
  original_url: column.text,
  annotated_url: column.text,
  // 'pending' | 'wifi-waiting' | 'done' | 'failed' — drives the mobile
  // "is my high-res synced yet?" indicator and the admin diagnostic.
  upload_state: column.text,
  // Burst / sequence support — multi-shot panoramas group under one
  // burst_group_id; position is the order within the burst (or 0 for
  // single captures).
  burst_group_id: column.text,
  position: column.integer,
  duration_seconds: column.integer,
  file_size_bytes: column.integer,
  device_lat: column.real,
  device_lon: column.real,
  device_compass_heading: column.real,
  captured_at: column.text,
  uploaded_at: column.text,
  transcription: column.text,
  /** Worker-driven transcription lifecycle. 'queued' (mobile sets
   *  on insert) → 'running' (worker claim) → 'done' / 'failed'.
   *  Mirrors receipts.extraction_status. Backed by seeds/228. */
  transcription_status: column.text,
  transcription_error: column.text,
  transcription_started_at: column.text,
  transcription_completed_at: column.text,
  transcription_cost_cents: column.integer,
  annotations: column.text, // JSON-encoded JSONB
  created_by: column.text,
  client_id: column.text,
  created_at: column.text,
});

const vehicles = new Table({
  company_id: column.text,
  name: column.text,
  license_plate: column.text,
  vin: column.text,
  active: column.integer, // 0/1
});

// time_entry_edits table from plan §6.3 is intentionally not declared
// here — see schema reconciliation note above.

const location_stops = new Table({
  user_id: column.text,
  // FK to job_time_entries (granular: which clock-in slice was the
  // user clocked into when this stop happened). For day-level
  // grouping queries, JOIN through job_time_entries.daily_time_log_id.
  job_time_entry_id: column.text,
  job_id: column.text,
  category: column.text,
  category_source: column.text, // 'geofence' | 'ai' | 'manual'
  ai_confidence: column.real,
  lat: column.real,
  lon: column.real,
  place_name: column.text,
  place_address: column.text,
  arrived_at: column.text,
  departed_at: column.text,
  duration_minutes: column.integer,
  user_overridden: column.integer,
});

// ── location_pings — append-only GPS samples while clocked in ──────────────
//
// Per the user's resilience requirement: "if the gps signal is lost,
// we just need to keep track of the last known location of the user's
// phone until they get reception again."
//
// Mobile writes one row every ~30 s while a job_time_entries row is
// open (lib/locationTracker.ts). PowerSync's CRUD queue buffers
// inserts when offline and replays on reception. Sync rule scopes
// reads to current user (privacy contract per plan §5.10.1).
//
// Backed by seeds/223_starr_field_location_pings.sql. No UPDATE /
// DELETE from mobile — append-only.
const location_pings = new Table({
  user_id: column.text,
  user_email: column.text,
  job_time_entry_id: column.text,
  /** Required — row is meaningless without these. */
  lat: column.real,
  lon: column.real,
  accuracy_m: column.real,
  altitude_m: column.real,
  /** Degrees, 0=N. Some Android devices never report this. */
  heading: column.real,
  /** Meters per second. */
  speed_mps: column.real,
  /** 0-100; null when expo-battery hasn't reported. */
  battery_pct: column.integer,
  /** 0/1 boolean. */
  is_charging: column.integer,
  /** 'foreground' | 'background' | 'clock_in' | 'clock_out'. */
  source: column.text,
  captured_at: column.text,
  created_at: column.text,
  /** Idempotency key for offline-replayed inserts. */
  client_id: column.text,
});

const location_segments = new Table({
  user_id: column.text,
  job_time_entry_id: column.text,
  vehicle_id: column.text,
  start_stop_id: column.text,
  end_stop_id: column.text,
  started_at: column.text,
  ended_at: column.text,
  distance_meters: column.real,
  // path_simplified (GEOMETRY) intentionally omitted — server-only.
  is_business: column.integer,
  business_purpose: column.text,
});

const receipts = new Table({
  user_id: column.text,
  job_id: column.text,
  job_time_entry_id: column.text,
  location_stop_id: column.text,
  vendor_name: column.text,
  vendor_address: column.text,
  transaction_at: column.text,
  subtotal_cents: column.integer,
  tax_cents: column.integer,
  tip_cents: column.integer,
  total_cents: column.integer,
  payment_method: column.text,
  payment_last4: column.text,
  category: column.text,
  category_source: column.text, // 'ai' | 'user' | 'rule'
  tax_deductible_flag: column.text, // 'full' | 'partial_50' | 'none' | 'review'
  notes: column.text,
  photo_url: column.text,
  ai_confidence_per_field: column.text, // JSON-encoded JSONB
  status: column.text, // 'pending' | 'approved' | 'rejected' | 'exported'
  approved_by: column.text,
  approved_at: column.text,
  rejected_reason: column.text,
  // Worker AI-extraction tracking — null until the worker queues the
  // receipt; matches columns in seeds/220_starr_field_receipts.sql.
  extraction_status: column.text, // 'queued' | 'running' | 'done' | 'failed'
  extraction_started_at: column.text,
  extraction_completed_at: column.text,
  extraction_error: column.text,
  extraction_cost_cents: column.integer,
  // Duplicate detection + user-review-before-save (Batch Z, seeds/229).
  // Worker computes dedup_fingerprint after extraction completes
  // (`{normVendor}|{cents}|{YYYY-MM-DD}`), looks for a prior matching
  // receipt for the same user, and writes dedup_match_id when it
  // finds one. The mobile detail screen shows a duplicate-warning
  // card and the user picks 'keep' or 'discard'. user_reviewed_at
  // gates the "needs review" badge on the list.
  dedup_fingerprint: column.text,
  dedup_match_id: column.text,
  dedup_decision: column.text, // 'keep' | 'discard' | NULL
  user_reviewed_at: column.text,
  user_review_edits: column.text, // JSON-encoded JSONB
  // Soft-delete + IRS retention (Batch CC, seeds/230). NULL =
  // visible; non-null = soft-deleted. Mobile filters out
  // deleted rows; the worker retention sweep purges rows whose
  // deleted_at exceeds the IRS retention threshold.
  deleted_at: column.text,
  deletion_reason: column.text, // 'user_undo' | 'duplicate' | 'wrong_capture' | NULL
  client_id: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const receipt_line_items = new Table({
  receipt_id: column.text,
  description: column.text,
  amount_cents: column.integer,
  quantity: column.real,
  position: column.integer,
  created_at: column.text,
});

const point_codes = new Table({
  // Note: PowerSync gives every row a synthetic `id` (uuid). The
  // domain key for point_codes is the `code` column; queries look
  // up by code, not id.
  code: column.text,
  category: column.text,
  display_color: column.text,
  description: column.text,
  is_custom: column.integer,
});

/**
 * Shared-with-web tables — minimal local shape (mobile-relevant
 * columns only) until the Phase F0 schema-snapshot bootstrapping
 * item completes (plan §15).
 *
 * If you add a mobile feature that needs a column not declared here,
 * add it both to this schema AND verify the column actually exists
 * in the live Postgres before shipping — sync will fail loudly if
 * the server projection doesn't match.
 */

// jobs columns reflect what app/api/admin/jobs/route.ts actually
// reads + writes (POST body + .from('jobs').select('*')). Run
// scripts/snapshot-existing-schema.sql against your live Supabase to
// validate the column-list and types here against ground truth — the
// resulting seeds/214_starr_field_existing_schema_snapshot.sql is the
// source of truth; this Table is the mobile projection.
const jobs = new Table({
  // Identity / display
  name: column.text,
  job_number: column.text,
  description: column.text,
  // Location
  address: column.text,
  city: column.text,
  state: column.text,
  zip: column.text,
  county: column.text,
  // Survey type + size
  survey_type: column.text,
  acreage: column.real,
  // Client
  client_name: column.text,
  client_email: column.text,
  client_phone: column.text,
  client_company: column.text,
  client_address: column.text,
  // Lifecycle
  stage: column.text, // 'quote' | 'research' | …  per /admin/jobs/components/jobs/JobCard
  is_legacy: column.integer,
  is_priority: column.integer,
  is_archived: column.integer,
  date_received: column.text,
  date_quoted: column.text,
  date_accepted: column.text,
  date_started: column.text,
  deadline: column.text,
  // Money
  quote_amount: column.real,
  // Lead surveyor
  lead_rpls_email: column.text,
  // Notes
  notes: column.text,
  // Audit
  created_by: column.text, // email
  created_at: column.text,
  updated_at: column.text,
  // Columns added by seeds/220_starr_field_tables.sql ALTER:
  field_state: column.text,
  pinned_for_users: column.text, // text[] in Postgres → JSON array string
  centroid_lat: column.real,
  centroid_lon: column.real,
  geofence_radius_m: column.integer,
});

// IMPORTANT — schema reconciliation (F1 #1):
//
// Plan §6.3 originally referenced a `time_entries` table. The actual
// schema has TWO tables for time tracking, discovered by inspecting
// app/api/admin/time-logs/** and app/api/admin/jobs/time/route.ts:
//
//   - daily_time_logs   : one row per (user_email, date). Holds the
//                         day-level rate calculation (work_type,
//                         effective_rate, role/seniority/credential
//                         bonuses, total minutes).
//   - job_time_entries  : per-job slice of a daily_time_logs row.
//                         duration_minutes attributed to a specific
//                         job_id. A daily log fan-outs to N job
//                         entries.
//
// Mobile clock-in/out flow:
//   1. On clock-in : ensure today's daily_time_logs row exists; start
//                    a job_time_entries row with started_at = now.
//   2. On clock-out: stop the job_time_entries row (ended_at = now,
//                    duration_minutes computed). The daily_time_logs
//                    total_minutes is recomputed by a server-side
//                    trigger or aggregated read-side.
//
// Column lists below match what the existing API uses. Validate
// against the snapshot SQL output before F2 ships.

const daily_time_logs = new Table({
  user_email: column.text,
  log_date: column.text, // ISO date (YYYY-MM-DD)
  work_type: column.text,
  notes: column.text,
  // Pay calc snapshot (frozen at log time):
  base_rate: column.real,
  role_bonus: column.real,
  seniority_bonus: column.real,
  credential_bonus: column.real,
  effective_rate: column.real,
  // Aggregation:
  total_minutes: column.integer,
  total_pay_cents: column.integer,
  // Approval:
  // Unified status enum — see DailyLogStatus in lib/timesheet.ts.
  // Mobile clock-in creates rows as 'open'; useSubmitWeek flips
  // 'open' → 'pending' so the web admin's hours-approval queue
  // surfaces them. Approved/rejected/adjusted/disputed/locked all
  // come from the web side. 'submitted' is a legacy alias for
  // 'pending' kept for back-compat with rows from earlier builds.
  status: column.text,
  submitted_at: column.text,
  approved_at: column.text,
  approved_by: column.text,
  created_at: column.text,
  updated_at: column.text,
  client_id: column.text,
});

const job_time_entries = new Table({
  daily_time_log_id: column.text,
  job_id: column.text,
  user_email: column.text,
  duration_minutes: column.integer,
  started_at: column.text, // ISO datetime
  ended_at: column.text,
  notes: column.text,
  // Columns added by seeds/220_starr_field_tables.sql ALTER for
  // mobile clock-in/out:
  vehicle_id: column.text,
  is_driver: column.integer,
  entry_type: column.text, // 'on_site' | 'travel' | 'office' | 'overhead'
  clock_in_lat: column.real,
  clock_in_lon: column.real,
  clock_out_lat: column.real,
  clock_out_lon: column.real,
  prompted_continue_at: column.text,
  geofence_trigger_id: column.text,
  client_id: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const fieldbook_notes = new Table({
  // Existing columns from seeds/099_fieldbook.sql.
  user_email: column.text,
  body: column.text,
  is_public: column.integer,
  is_current: column.integer,
  job_id: column.text,
  job_name: column.text,
  job_number: column.text,
  created_at: column.text,
  updated_at: column.text,
  // Columns added by seeds/220_starr_field_tables.sql ALTER for
  // Starr Field:
  data_point_id: column.text,
  note_template: column.text,
  structured_data: column.text, // JSON-encoded
  voice_transcript_media_id: column.text,
  client_id: column.text,
});

// time_edits — F1 #6 audit trail.
//
// F1 #1 left the audit destination open between three options
// (dedicated table, superseded_by_id chain on job_time_entries, or
// the generic activity_log table). F1 #6 pinned the dedicated-table
// option:
//   - cleaner queries (no WHERE-superseded filter on every read)
//   - simpler PowerSync sync surface (append-only inserts, no
//     destructive parent-row updates to track edit history)
//   - direct UI rendering (one row → one history line)
//   - direct CSV export for F1 #9 / IRS-grade audit trails
//
// One row per field changed per edit. Editing started_at + ended_at
// in one save creates two rows so each field's old/new value is
// queryable independently.
const time_edits = new Table({
  job_time_entry_id: column.text,
  field_name: column.text, // 'started_at' | 'ended_at' | 'notes' | 'entry_type' | 'job_id'
  old_value: column.text,
  new_value: column.text,
  // Required when a time-field edit moves the boundary by >15 min;
  // free-text otherwise (the plan §5.8.3 spec lets surveyors leave
  // a "rounded to nearest minute" note even on small edits).
  reason: column.text,
  // Computed on the client at save time for time-field edits;
  // null for non-time fields (notes, entry_type, job_id).
  delta_minutes: column.integer,
  edited_by: column.text, // user_email
  edited_at: column.text,
  client_id: column.text,
});

// ── notifications — shared web/admin + mobile inbox ─────────────────────────
//
// Per the user's resilience requirement: "the admin/dispatcher needs to
// be able to notify the user that they need to log their hours."
//
// Mobile consumes rows from the EXISTING web-admin notifications table
// (used by NotificationBell + lib/notifications.ts on the web side).
// seeds/222_starr_field_notifications.sql adds Starr Field-specific
// columns (target_user_id, delivered_at, dismissed_at, expires_at) and
// RLS policies on top of that table — non-breaking for the web admin.
//
// Identity duality:
//   - user_email     — the web admin's primary key throughout (every
//                      web-side notify() call writes here).
//   - target_user_id — UUID mirror added by seeds/222 so mobile sync
//                      rules can scope by auth.uid(). A trigger
//                      back-fills it on every insert; mobile filters
//                      by either (RLS allows both).
//
// Lifecycle (matches the existing web shape, plus delivered_at):
//   - is_read / read_at         — flipped when user taps banner.
//   - is_dismissed / dismissed_at — flipped when user swipes away.
//   - delivered_at              — flipped by mobile on first sight
//                                  (admin's "delivered ✓" indicator).
//   - expires_at                — soft-delete; sync rule excludes
//                                  rows past their expiry.
//
// Column-level GRANT (seeds/222) restricts mobile writes to
// is_read / read_at / is_dismissed / dismissed_at / delivered_at —
// owners cannot rewrite title / body / link.
const notifications = new Table({
  /** Web admin's identity (TEXT). Mobile matches via session.user.email. */
  user_email: column.text,
  /** UUID mirror — auth.users.id. Filled by trigger on every insert. */
  target_user_id: column.text,
  /** Free-form category — existing values include 'reminder', 'system',
   *  'assignment', 'payment', etc. Starr Field dispatcher pings use
   *  'reminder' with source_type='log_hours' so existing web filters
   *  ('non-message' check in NotificationBell) still work. */
  type: column.text,
  /** Sub-category that drives the mobile banner glyph + auto-route.
   *  Values mobile recognises: 'log_hours', 'submit_week',
   *  'admin_direct', 'hours_decision' — others render as plain
   *  message banners. */
  source_type: column.text,
  /** Optional FK-ish id for the source object (e.g. job_id when
   *  source_type='job_assignment'). Drives /jobs/{id} deep-links. */
  source_id: column.text,
  /** Headline shown in the OS banner + in-app banner. */
  title: column.text,
  /** Multi-line body; null when the headline is self-explanatory. */
  body: column.text,
  /** Single-glyph emoji from the web side; mobile prefers source_type
   *  for icon mapping but falls back to this. */
  icon: column.text,
  /** Web URL or app deep-link string. Mobile recognises strings
   *  starting with '/(tabs)/' or 'starr-field://' as in-app routes. */
  link: column.text,
  /** 'low' | 'normal' | 'high' | 'urgent' | 'critical'. Mobile elevates
   *  the banner colour for high+, fires a sharper sound for urgent. */
  escalation_level: column.text,
  /** Optional thread grouping — direct-message scenarios. */
  thread_id: column.text,
  /** Lifecycle flags. Owner-writable per seeds/222 column GRANT. */
  is_read: column.integer, // 0/1 boolean
  is_dismissed: column.integer, // 0/1 boolean
  read_at: column.text,
  dismissed_at: column.text,
  delivered_at: column.text,
  /** Soft-delete: sync rule excludes rows where expires_at <= now. */
  expires_at: column.text,
  created_at: column.text,
});

// ── job_files — generic file attachments on jobs + points ──────────────────
//
// Per F5 plan + the user's "make sure we can upload audio and videos
// and pictures and files to job or specific points in a job"
// requirement. field_media handles photo / voice / video; this table
// handles everything else (PDF, CSV, Trimble JobXML, scope-of-work,
// scanned plans, third-party survey records).
//
// Backed by seeds/226_starr_field_files.sql. Same offline-first
// contract as photos / voice / video — INSERT row first, enqueue
// upload to starr-field-files bucket via lib/uploadQueue.ts.
const job_files = new Table({
  job_id: column.text,
  /** Optional FK to a data point. Null = job-level file. */
  data_point_id: column.text,
  name: column.text,
  description: column.text,
  storage_path: column.text,
  content_type: column.text,
  file_size_bytes: column.integer,
  /** 'pending' | 'wifi-waiting' | 'done' | 'failed' — same enum as
   *  field_media.upload_state so the upload queue branches uniformly. */
  upload_state: column.text,
  created_by: column.text,
  created_at: column.text,
  uploaded_at: column.text,
  updated_at: column.text,
  client_id: column.text,
});

// ── pending_uploads — local-only retry queue ────────────────────────────────
//
// Survives reception loss + app crashes. Captures (receipts photo,
// data-point photo, future video / voice) write the bytes to
// FileSystem.documentDirectory and INSERT a row here; the upload
// queue (lib/uploadQueue.ts) drains rows whenever the device is
// online. PowerSync localOnly:true keeps these rows OFF the wire —
// they never sync to Supabase.
//
// Lifecycle:
//   1. Capture writes the file → enqueueAndAttempt() inserts here
//      with retry_count=0, last_error=null.
//   2. uploadQueue picks it up immediately (online) or on next
//      network restore (offline).
//   3. On success, the parent row's upload_state flips to 'done',
//      the local file is deleted, and this row is removed.
//   4. On failure, retry_count++ and last_error is captured.
//      Backoff doubles per attempt (5s, 10s, 20s, 40s, …) capped at
//      ~5 min so a permanently-bad row doesn't burn battery.
const pending_uploads = new Table(
  {
    /** 'receipts' | 'field_media' | future media types — drives the
     *  per-table 'success' update path. */
    parent_table: column.text,
    /** UUID of the parent row. Composite key with parent_table to
     *  avoid collisions across tables. */
    parent_id: column.text,
    /** Storage bucket id (e.g. 'starr-field-receipts'). */
    bucket: column.text,
    /** Final remote path inside the bucket. */
    storage_path: column.text,
    /** file:// URI in FileSystem.documentDirectory. Persistent
     *  across launches; survives app kills + reboots. */
    local_uri: column.text,
    /** MIME type at upload time (image/jpeg etc.). */
    content_type: column.text,
    /** Times we've tried + failed. Drives backoff. */
    retry_count: column.integer,
    /** Last error message (truncated) — populated on every failed
     *  attempt for ops triage. */
    last_error: column.text,
    /** Wall-clock ms timestamp of next eligible attempt. The queue
     *  skips rows where now() < next_attempt_at. */
    next_attempt_at: column.integer,
    created_at: column.text,
  },
  // PowerSync localOnly: these rows never replay to Supabase. The
  // upload itself goes via supabase.storage; the parent row already
  // syncs through the regular CRUD queue.
  { localOnly: true }
);

// ── pinned_files — persistent local copy of a job_files row ────────────────
//
// Lets surveyors mark a plat / deed / CSV for offline re-read. The
// upload queue normally deletes the local file once the upload
// succeeds; pinning fetches the bytes back via a signed URL (or
// keeps the upload-queue copy if pinning happens before the queue
// drains) and persists them under a stable per-file path. Tapping
// a pinned file opens instantly from local storage even with no
// reception.
//
// Lifecycle:
//   1. User taps "Pin" → pinFile() resolves a signed URL, fetches
//      the bytes to FileSystem.documentDirectory/pinned/<file_id>,
//      INSERTs this row.
//   2. The file is now readable offline via shareAsync(local_uri).
//   3. User taps "Unpin" or deletes the parent job_files row →
//      DELETE this row + best-effort FS unlink.
//
// PowerSync localOnly: phone-specific paths shouldn't leak to other
// devices; each device decides independently which files to pin.
const pinned_files = new Table(
  {
    /** FK to job_files.id — the parent file row that's pinned.
     *  Composite-PK semantics handled by the only-one-row-per-file
     *  invariant enforced in pinnedFiles.ts (defensive INSERT after
     *  SELECT). */
    job_file_id: column.text,
    /** file:// URI in FileSystem.documentDirectory/pinned/. Persistent
     *  across launches, app kills, reboots. Matches the
     *  upload-queue's local_uri pattern. */
    local_uri: column.text,
    /** Bytes — drives the Me-tab "N MB pinned" summary so the user
     *  can spot a runaway pin set. */
    file_size_bytes: column.integer,
    /** ISO timestamp the surveyor pinned it. */
    pinned_at: column.text,
  },
  { localOnly: true }
);

/**
 * Top-level schema. Order doesn't matter for sync; alphabetical here
 * for human grep-ability.
 */
export const AppSchema = new Schema({
  daily_time_logs,
  field_data_points,
  field_media,
  fieldbook_notes,
  job_files,
  job_time_entries,
  jobs,
  location_pings,
  location_segments,
  location_stops,
  notifications,
  pending_uploads,
  pinned_files,
  point_codes,
  receipt_line_items,
  receipts,
  time_edits,
  vehicles,
});

export type AppDatabase = (typeof AppSchema)['types'];
