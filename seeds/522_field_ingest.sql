-- seeds/522_field_ingest.sql — points from a data collector, arriving late and out of order.
--
-- Audit §3d, items 8n and 8o. The owner's question was *"when a data collector stores a point, that
-- point shows up on the app shortly thereafter"*, and the researched answer was: yes, in seconds to
-- minutes, on the next sync — not instantly, and not by push, because **no vendor emits an event when
-- a surveyor presses Store**. Collectors sync at the job/file level.
--
-- ── TWO CLOCKS, AND THE APP MUST NEVER SHOW THE SECOND AS THE FIRST ─────────────────────────────
--
-- §3d: *"Rural Texas boundary work regularly has no cell service. Whatever the vendor path, ingestion
-- must be store-and-forward: points arrive late, in bursts, and out of order, hours after they were
-- shot. A design that assumes ordered near-real-time arrival will look perfect in town and lose data
-- in the field."*
--
--   `measured_at`  — when the surveyor pressed Store. From the file. **NULLABLE**, because plenty of
--                    formats do not record it, and inventing one is worse than admitting it is
--                    unknown: a point stamped with its upload time looks like it was shot at 6pm from
--                    the office car park.
--   `received_at`  — when this server first saw it. NOT NULL, defaulted, never supplied by a client.
--
-- Sorting a day's work by `received_at` reorders the shots. Billing from it bills the drive home.
-- Both are stored so neither has to be guessed, and the column comments say which is which because
-- the next person to write a query will otherwise pick whichever one autocompletes first.
--
-- ── IDEMPOTENCY IS THE OTHER HALF OF STORE-AND-FORWARD ──────────────────────────────────────────
--
-- A poller with a cursor re-reads its window on every retry, and a watched folder re-sees a file
-- whose mtime changed. Without a dedupe key, one flaky afternoon doubles a day's points — and
-- duplicate survey points are not obviously wrong, they are two markers in the same place.
--
-- Idempotent.

-- ── A configured intake ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instrument_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES organizations(id),
  name          text NOT NULL,
  -- 'watched_folder' works with all five vendors and needs no partner agreement (§3d step 1).
  -- 'trimble_connect' is the near-live path and the only vendor cloud with a public API (§3d step 3).
  -- 'manual_upload' is a drag-and-drop, recorded the same way so one code path handles every arrival.
  kind          text NOT NULL CHECK (kind IN ('watched_folder', 'trimble_connect', 'manual_upload')),
  -- Provider-specific settings. Folder path and provider for a watched folder; project id for
  -- Trimble Connect. NOT credentials — see the comment below.
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Trimble Connect has no webhooks; its Core API offers Object Sync, which reports changes SINCE a
  -- timestamp. So the architecture is a poller with a cursor, and "how fresh" is a dial we set rather
  -- than something the vendor pushes. This is that cursor.
  sync_cursor   text,
  poll_seconds  integer NOT NULL DEFAULT 300,
  enabled       boolean NOT NULL DEFAULT true,
  last_polled_at timestamptz,
  last_ok_at    timestamptz,
  -- The last failure, kept rather than logged and lost. A source that has been quietly failing for a
  -- week is the exact thing store-and-forward makes invisible: no error on screen, just no new points.
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_instrument_sources_due ON instrument_sources (enabled, last_polled_at);

COMMENT ON COLUMN instrument_sources.config IS
  'Non-secret settings only. Vendor credentials belong in the deployment environment, not in a row '
  'the app reads and renders — a token in a jsonb column ends up in a log line, an error report and a '
  'support screenshot.';

-- ── One arrival: a file, or one poll that returned something ────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingest_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES organizations(id),
  source_id     uuid REFERENCES instrument_sources(id) ON DELETE SET NULL,
  job_id        uuid REFERENCES jobs(id) ON DELETE SET NULL,
  file_name     text,
  -- Content hash. The idempotency anchor: the same bytes arriving twice is the same batch, whatever
  -- the file was called or when its mtime last changed.
  file_hash     text,
  format        text,                     -- 'landxml' | 'gsi' | 'rw5' | 'jobxml' | 'csv'
  received_at   timestamptz NOT NULL DEFAULT now(),
  point_count   integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'partial', 'failed')),
  -- Warnings from the format reader, kept verbatim. "14 points had no coordinates" is the sentence
  -- that explains a short import, and throwing it away is how a short import becomes a mystery.
  warnings      text[],
  error         text,
  created_by    text
);
CREATE INDEX IF NOT EXISTS idx_ingest_batches_source ON ingest_batches (source_id, received_at DESC);
-- One batch per (source, content). A retry of the same bytes finds the existing row instead of
-- importing a second copy of the day.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingest_batches_dedupe
  ON ingest_batches (source_id, file_hash) WHERE file_hash IS NOT NULL;

-- ── The points ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instrument_points (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES organizations(id),
  batch_id      uuid NOT NULL REFERENCES ingest_batches(id) ON DELETE CASCADE,
  job_id        uuid REFERENCES jobs(id) ON DELETE SET NULL,

  point_name    text NOT NULL,
  code          text,
  description   text,

  northing      double precision NOT NULL,
  easting       double precision NOT NULL,
  elevation     double precision,          -- NULL is a real answer: two numbers means no Z.
  -- As written in the source file. Not converted on the way in — converting to a house unit and back
  -- is how precision quietly disappears, and 'USSurveyFoot' vs 'foot' differ by 2 ppm.
  unit          text NOT NULL DEFAULT 'unknown',

  -- ── The two clocks ──
  measured_at   timestamptz,               -- when it was SHOT. Null when the format did not say.
  received_at   timestamptz NOT NULL DEFAULT now(),

  source_ref    text,                      -- the line or element it came from, for tracing
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN instrument_points.measured_at IS
  'When the surveyor pressed Store, from the source file. NULL when the format did not record it — '
  'which is common, and honest. Never fall back to received_at here: a point stamped with its upload '
  'time looks like it was shot at 6pm from the office car park.';

COMMENT ON COLUMN instrument_points.received_at IS
  'When this server first saw the point. Always set, never supplied by a client. Use it to answer '
  '"what is new since I last looked" and NEVER to answer "when was this shot" — after a day with no '
  'signal those are hours apart, and sorting a day''s work by this reorders the shots.';

CREATE INDEX IF NOT EXISTS idx_instrument_points_batch ON instrument_points (batch_id);
CREATE INDEX IF NOT EXISTS idx_instrument_points_job ON instrument_points (job_id, measured_at DESC NULLS LAST);
-- "What arrived since I last looked" — the live-feed query, on the clock that actually answers it.
CREATE INDEX IF NOT EXISTS idx_instrument_points_received ON instrument_points (org_id, received_at DESC);

-- Same point name from the same batch twice is the same point. Scoped to the batch rather than to the
-- job, because two different days legitimately reuse point numbers and collapsing those would delete
-- real observations.
CREATE UNIQUE INDEX IF NOT EXISTS idx_instrument_points_dedupe
  ON instrument_points (batch_id, point_name);
