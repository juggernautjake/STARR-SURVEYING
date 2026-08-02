-- seeds/527_phone_points_two_clocks.sql — the phone gets the same two clocks as the collector.
--
-- Audit §3d step 4, item 8p: *"Our own mobile app as the true-instant path. The repo already captures
-- field media, GPS and notes on the phone. For a crew willing to carry it alongside the collector, a
-- point can appear ACTUALLY instantly — no vendor cloud in the loop. This is the only route to the
-- literal version of the owner's request, and it is entirely under our control."*
--
-- ── THE PROBLEM THIS FIXES IS THE EXACT ONE seed 522 EXISTS TO PREVENT, INVERTED ────────────────
--
-- `instrument_points` was built with two clocks from the start because a collector file arrives hours
-- after the shot. `field_data_points` — the phone capture table, seed 221 — has ONE timestamp:
--
--     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
--
-- and that default almost never fires, because the row does not originate here. PowerSync writes the
-- row the phone composed, `created_at` included (mobile/lib/db/connector.ts upserts the row it is
-- handed). So `created_at` is a **device clock, captured at Store time**, wearing the name of a
-- server column. On a phone that shot forty points in a dead zone and synced at the truck, every one
-- of those rows says it was created at the moment of the shot — which is the RIGHT fact, correctly
-- recorded, and is *measured_at* by any other name.
--
-- What was missing is the other clock: when did WE first see it. Without it the app cannot answer
-- "what is new since I last looked" (the whole point of a live feed) without asking a question it
-- would answer with a device clock — and a phone whose owner has automatic time off, or who crossed
-- into another zone, or who is simply out of a signal for six hours, answers it wrong.
--
--   `created_at`  — unchanged, and now documented for what it always was: the device clock at the
--                   moment the surveyor pressed "+". This is the point's MEASURED time.
--   `received_at` — when this server first saw the row. Defaulted, and never written by the client:
--                   the connector upserts only the columns the phone's schema declares, and this is
--                   not one of them. An update-on-conflict therefore leaves the original arrival
--                   time alone, which is what makes it an arrival time rather than a touch time.
--
-- Deliberately NOT renaming `created_at` to `measured_at`. The column is read by the mobile client's
-- own schema, by /admin/field-data, by the job manifest and by the ZIP export; renaming it to say
-- what it means would break a shipped mobile build that cannot be forced to update. The comment
-- carries the meaning instead, and `lib/field-live/feed.ts` is the one place that maps it.
--
-- Idempotent.

-- Added NULLABLE first, then backfilled, then constrained. The one-line form —
-- `ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT now()` — stamps every existing
-- row with the moment the seed ran, so "arrived in the last hour" would briefly contain the entire
-- history of the table. The honest backfill for a row that predates anybody recording arrivals is
-- `created_at`: for the overwhelming majority (synced within minutes, in town) it is within seconds
-- of correct, and it is never a fabrication in the other direction.
--
-- Three statements rather than one also makes the re-run safe, which matters more than the line
-- count: an unconditional `UPDATE … WHERE received_at > created_at` would, on a second run months
-- from now, rewrite every genuinely-late arrival — exactly the rows this column exists to record —
-- back to its device clock. Backfilling only NULLs cannot do that, because after the first run there
-- are none.
ALTER TABLE field_data_points
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

UPDATE field_data_points SET received_at = created_at WHERE received_at IS NULL;

ALTER TABLE field_data_points
  ALTER COLUMN received_at SET DEFAULT now();
ALTER TABLE field_data_points
  ALTER COLUMN received_at SET NOT NULL;

COMMENT ON COLUMN field_data_points.created_at IS
  'DEVICE clock at the moment the surveyor pressed "+" — this point''s MEASURED time. Written by the '
  'phone through PowerSync, not by this server, so the column default almost never fires. Use it to '
  'order a day''s work and to answer "when was this shot". Named created_at for history; see seed 527.';

COMMENT ON COLUMN field_data_points.received_at IS
  'When this server first saw the row. Set by the default and never by a client, so it survives the '
  'connector''s upsert-on-conflict. Use it for "what is new since I last looked" and NEVER for "when '
  'was this shot" — after an afternoon with no signal those are hours apart. Mirrors '
  'instrument_points.received_at so the live feed can merge the two sources on one clock.';

-- The live-feed query: newest arrivals across the org, whichever job. Mirrors
-- idx_instrument_points_received so the merged feed reads one index shape on both sides.
CREATE INDEX IF NOT EXISTS idx_field_data_points_received
  ON field_data_points (received_at DESC);

-- "What arrived on this job since I last looked", the per-job half of the same question.
CREATE INDEX IF NOT EXISTS idx_field_data_points_job_received
  ON field_data_points (job_id, received_at DESC);
