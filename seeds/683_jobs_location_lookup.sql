-- seeds/683_jobs_location_lookup.sql — where each job's map location came from (owner, 2026-11-11).
--
-- "over time the map becomes more and more populated with the jobs we have done." The map now finds
-- a place for every job (lib/jobs/locate-jobs.ts): its own address through Google, or, when that is
-- missing or vague, an address Claude works out from the record, placed by Google. The coordinates
-- go on jobs.latitude / jobs.longitude as before. These columns record HOW, and that a job was tried
-- and could not be found, so it is not asked about again on every visit to the map.
--
-- Safe to re-run. The app works without these columns; it simply re-tries unfound jobs until they exist.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_source text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_checked_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_formatted text;

COMMENT ON COLUMN jobs.location_source IS
  'How latitude/longitude were found: address (the job''s own address, geocoded), ai (an address Claude inferred from the record, geocoded), manual, or not_found.';
COMMENT ON COLUMN jobs.location_checked_at IS
  'When the automatic location lookup last ran for this job. Null = never tried.';
COMMENT ON COLUMN jobs.location_formatted IS
  'The address Google matched, so a wrong pin can be recognised as wrong.';

CREATE INDEX IF NOT EXISTS jobs_location_unchecked_idx
  ON jobs (created_at DESC)
  WHERE latitude IS NULL AND location_checked_at IS NULL AND deleted_at IS NULL;
