-- seeds/624_research_structured_address.sql — the address stops being one string.
--
-- ── THE MEASUREMENT THAT PROMPTED THIS ──────────────────────────────────────────────────────────
--
-- The create route collects street, city, county, state and ZIP as five separate values from the
-- operator, and then throws four of them away:
--
--     property_address = [property_address, city, state, zip].filter(Boolean).join(', ')
--
-- `city` and `zip` are copied into `analysis_metadata`, which the pipeline route does not select,
-- so the worker never sees them. What the worker receives is one flattened string, and it tries to
-- guess the parts back out of it. There are TWO such guessers, and on 2026-09-02 both were measured
-- against the string the app actually produces:
--
--   1. `services/address-normalizer.ts parseAddress()` — its full pattern is
--
--          ^(\d+[A-Z]?)\s+(.+?)...\s*,\s*(.+?)\s*,\s*(TX|TEXAS)\s*(\d{5})?$
--
--      which expects `..., TEMPLE, TX 76501`. The app emits `..., TEMPLE, TX, 76501` — a comma
--      between the state and the ZIP, because it joins every component the same way. The pattern
--      does not match. It falls through to the simple pattern and yields
--
--          streetNumber = "123"
--          streetName   = "MAIN ST, TEMPLE, TX, 76501"      ← typed into the CAD street-name box
--          city         = ""
--
--      That is what goes to `generateAddressVariants` and then into the county search form, for
--      every county on the generic adapter path. It matches nothing, and the run reports that the
--      appraisal district has no record of the property.
--
--   2. `counties/bell/scrapers/cad-scraper.ts parseAddressComponents()` strips the city using a
--      HARDCODED LIST OF FIFTEEN Bell-area towns. For a property in Waco, Georgetown, Round Rock or
--      any of the other routed counties, the city is never stripped and lands inside the street
--      name, with the same result.
--
-- Both are best-effort reconstructions of information the operator had already typed correctly into
-- separate boxes thirty seconds earlier. The fix is not a better regex. It is to stop discarding it.
--
-- ── WHY REAL COLUMNS AND NOT MORE analysis_metadata ─────────────────────────────────────────────
--
-- `analysis_metadata` already held `city` and `zip` and it changed nothing, because a jsonb blob is
-- invisible to every consumer that does not already know to look inside it — and the one consumer
-- that mattered, the pipeline route, selects an explicit column list. A column is legible to
-- `select *`, to a Supabase table view, to the writes-hit-real-columns guard, and to the next person.
--
-- `county`, `state` and `parcel_id` are already columns and are not duplicated here.
--
-- ── NOTHING IS BACKFILLED, ON PURPOSE ───────────────────────────────────────────────────────────
--
-- Splitting the existing flattened strings would mean running the very parser this seed exists
-- because it is unreliable, and writing its guesses into columns that everything downstream will
-- then trust as operator-entered fact. Existing projects keep `property_address` and keep taking the
-- parsing path, which is what they have always done. New and edited projects get the real thing.

ALTER TABLE research_projects
  -- Separate because the county CAD search forms ask for them separately — Bell's wants
  -- `StreetNumber:123 MAIN` as two indexed fields, not one string.
  ADD COLUMN IF NOT EXISTS street_number text,
  ADD COLUMN IF NOT EXISTS street_name   text,
  -- Suite/apt/lot. Kept apart from the street name because CAD indexes almost never contain it, so
  -- including it in a search term turns a match into a miss.
  ADD COLUMN IF NOT EXISTS unit          text,
  ADD COLUMN IF NOT EXISTS city          text,
  ADD COLUMN IF NOT EXISTS zip           text,
  -- What the operator knows and no record will say: "the fence is not the line", "seller says
  -- 2.3 acres", "look for the 1997 partition". Free text, given to the AI as context.
  --
  -- `analysis_metadata.user_notes` has been written by the create route since it was built and is
  -- read by NOTHING — grepped across app/, lib/ and worker/src on 2026-09-02. The operator's
  -- context has been going into the database and stopping there.
  ADD COLUMN IF NOT EXISTS intake_notes  text;

COMMENT ON COLUMN research_projects.street_number IS
  'House/site number, separate from the street name because CAD search forms index them separately.';
COMMENT ON COLUMN research_projects.street_name IS
  'Street name WITHOUT number, unit, city, state or ZIP. Goes into the CAD street-name field as-is.';
COMMENT ON COLUMN research_projects.unit IS
  'Suite/apt/lot. Deliberately excluded from CAD search terms — appraisal indexes rarely carry it.';
COMMENT ON COLUMN research_projects.city IS
  'Was in analysis_metadata, where the pipeline route could not see it.';
COMMENT ON COLUMN research_projects.zip IS
  'Was in analysis_metadata, where the pipeline route could not see it.';
COMMENT ON COLUMN research_projects.intake_notes IS
  'Operator context at intake, passed to the AI. Replaces analysis_metadata.user_notes, which nothing read.';

-- Finding a project by its street is a real operator action ("what did we do on Ave H?") and the
-- flattened column could only support it with a leading-wildcard LIKE.
CREATE INDEX IF NOT EXISTS idx_research_projects_street_name
  ON research_projects (lower(street_name))
  WHERE street_name IS NOT NULL;
