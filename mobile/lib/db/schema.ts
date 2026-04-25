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
  storage_url: column.text,
  thumbnail_url: column.text,
  original_url: column.text,
  duration_seconds: column.integer,
  file_size_bytes: column.integer,
  device_lat: column.real,
  device_lon: column.real,
  device_compass_heading: column.real,
  captured_at: column.text,
  uploaded_at: column.text,
  transcription: column.text,
  annotations: column.text, // JSON-encoded
  created_by: column.text,
  client_id: column.text,
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
  ai_confidence_per_field: column.text, // JSON-encoded
  status: column.text, // 'pending' | 'approved' | 'rejected' | 'exported'
  approved_by: column.text,
  approved_at: column.text,
  client_id: column.text,
  created_at: column.text,
});

const receipt_line_items = new Table({
  receipt_id: column.text,
  description: column.text,
  amount_cents: column.integer,
  quantity: column.real,
  position: column.integer,
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
  status: column.text, // 'open' | 'submitted' | 'approved' | 'locked'
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

/**
 * Top-level schema. Order doesn't matter for sync; alphabetical here
 * for human grep-ability.
 *
 * Note the time_entry_edits audit table from plan §6.3 is gone — we
 * write edits as new rows on job_time_entries with a
 * `superseded_by_id` pointer (or use the existing activity_log table)
 * rather than a separate audit table. F1 will pin which one.
 */
export const AppSchema = new Schema({
  daily_time_logs,
  field_data_points,
  field_media,
  fieldbook_notes,
  job_time_entries,
  jobs,
  location_segments,
  location_stops,
  point_codes,
  receipt_line_items,
  receipts,
  vehicles,
});

export type AppDatabase = (typeof AppSchema)['types'];
