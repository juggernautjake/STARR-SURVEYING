/**
 * PowerSync local-SQLite schema for Starr Field.
 *
 * This file mirrors the Postgres schema declared in
 * `seeds/220_starr_field_tables.sql` (per STARR_FIELD_MOBILE_APP_PLAN.md
 * §6.3). PowerSync replicates rows from Postgres to local SQLite
 * according to sync rules defined server-side; this schema tells the
 * client which tables exist and what shape rows have when they arrive.
 *
 * Three categories of tables:
 *
 *   1. Fully-owned by Starr Field — full schema declared here, mobile
 *      reads and writes everything. (field_data_points, field_media,
 *      time_entry_edits, location_stops, location_segments, receipts,
 *      receipt_line_items, vehicles, point_codes)
 *
 *   2. Shared with web admin — full schema lives in Postgres and
 *      pre-dates this app (jobs, time_entries, fieldbook_notes). For
 *      these, we declare ONLY the columns the mobile UI consumes plus
 *      the mobile-specific columns added by the §6.3 ALTERs. The full
 *      column list lands once Phase F0's "snapshot existing schema"
 *      bootstrapping item completes (plan §15) — at which point we
 *      regenerate this file from the live Postgres.
 *
 *   3. Read-only enrichment — the mobile app reads but doesn't mutate
 *      (point_codes — the 179-code Starr Surveying taxonomy, vehicles
 *      until F1+ adds in-app vehicle creation).
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

const time_entry_edits = new Table({
  time_entry_id: column.text,
  field_name: column.text,
  old_value: column.text,
  new_value: column.text,
  reason: column.text,
  edited_by: column.text,
  edited_at: column.text,
});

const location_stops = new Table({
  user_id: column.text,
  time_entry_id: column.text,
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
  time_entry_id: column.text,
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
  time_entry_id: column.text,
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

const jobs = new Table({
  // Existing columns expected to be present in the live `jobs` table.
  // Names are best-guess from /admin/jobs/page.tsx + /api/admin/jobs;
  // confirm against the F0 snapshot when it lands.
  name: column.text,
  job_number: column.text,
  client_name: column.text,
  address: column.text,
  status: column.text,
  job_type: column.text,
  created_at: column.text,
  updated_at: column.text,
  // Columns added by §6.3 ALTER:
  field_state: column.text,
  pinned_for_users: column.text, // text[] in Postgres → JSON array string
  centroid_lat: column.real,
  centroid_lon: column.real,
  geofence_radius_m: column.integer,
});

const time_entries = new Table({
  // Existing payroll columns — placeholders. Confirm against the
  // F0 snapshot before relying on names.
  user_id: column.text,
  job_id: column.text,
  clock_in: column.text,
  clock_out: column.text,
  notes: column.text,
  status: column.text, // 'open' | 'submitted' | 'approved' | 'locked'
  approved_at: column.text,
  approved_by: column.text,
  // Columns added by §6.3 ALTER:
  vehicle_id: column.text,
  is_driver: column.integer,
  break_minutes: column.integer,
  entry_type: column.text, // 'on_site' | 'travel' | 'office' | 'overhead'
  clock_in_lat: column.real,
  clock_in_lon: column.real,
  clock_out_lat: column.real,
  clock_out_lon: column.real,
  prompted_continue_at: column.text,
  geofence_trigger_id: column.text,
  client_id: column.text,
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
  // Columns added by §6.3 ALTER for Starr Field:
  data_point_id: column.text,
  note_template: column.text,
  structured_data: column.text, // JSON-encoded
  voice_transcript_media_id: column.text,
  client_id: column.text,
});

/**
 * Top-level schema. Order doesn't matter for sync; alphabetical here
 * for human grep-ability.
 */
export const AppSchema = new Schema({
  field_data_points,
  field_media,
  fieldbook_notes,
  jobs,
  location_segments,
  location_stops,
  point_codes,
  receipt_line_items,
  receipts,
  time_entries,
  time_entry_edits,
  vehicles,
});

export type AppDatabase = (typeof AppSchema)['types'];
