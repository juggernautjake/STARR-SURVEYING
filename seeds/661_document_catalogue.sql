-- seeds/661_document_catalogue.sql
--
-- WHAT A DOCUMENT SAYS, NOT JUST WHAT IT IS CALLED (2026-09-23)
-- ════════════════════════════════════════════════════════════
--
-- Owner: *"If the document has specific names and dates and locations and surveying
-- companies/rpls names/numbers listed, we catalogue all of that information and save it to the
-- file... entering in a keyword that matches with the metadata of one or more files will help parse
-- through the documents more quickly."*
--
-- The firm holds 8,077 Bell County plats and knows the filename of each. `extracted_text` is NULL on
-- every one, `processing_status` is 'pending' on every one, and nothing sweeps pending rows. So a
-- search for "Maclin Survey" or "RPLS 719" matches nothing, and a search for "HIGHLAND OAKS" matches
-- only because those words happen to be in the filename. Sampling forty of the PDFs found ZERO with
-- an embedded text layer — every sheet is a scan — so there is nothing to index without reading them.
--
-- ── WHY THIS IS NOT A NEW ENTITY TABLE ──────────────────────────────────────────────────────────
--
-- `extracted_data_points` (seeds/090) already exists with the right categories — `surveyor_info`,
-- `recording_reference`, `date_reference`, `subdivision_name`, `lot_block`, `adjoiner` — and already
-- carries `extraction_confidence`, `confidence_reasoning` and `source_text_excerpt`. The individual
-- facts go there, where `lib/research/cross-validation.service.ts` can already read them. This seed
-- adds only what that table cannot answer: "has this document been catalogued, and what does the
-- whole sheet say" in ONE indexed row, so a keyword search is one scan rather than a join per hit.
--
-- ── CONFIDENCE IS PER FIELD, AND IT CHANGES WHAT THE FIELD MAY BE USED FOR ──────────────────────
--
-- Owner: *"Please make there be a confidence rating for everything. Like, if we are not confident
-- about the rpls number, then it should make that known."*
--
-- A wrong RPLS number catalogued confidently is worse than a blank one: blank makes somebody look
-- at the sheet, wrong makes them cite it. So every extracted value carries its own rating and the
-- VERBATIM text it was read from — "CHARLES L. MILLER, REGISTERED PUBLIC SURVEYOR NO. 719" beside
-- the value 719 — because a human checks a quote in a second and cannot check a number at all.
--
-- The rating is an ordinal (high / medium / low), not a percentage. A model asked for "0.73" emits
-- false precision; asked whether it is sure, it is usefully honest. `extraction_confidence` on
-- `extracted_data_points` is a DECIMAL, so the ordinal is bucketed into it for compatibility and the
-- word itself is kept in `confidence_reasoning`, which is the authority.
--
-- The rule that makes this more than decoration lives in `lib/research/catalogue-schema.ts`: a `low`
-- value is stored and shown to people, and never used to satisfy a research want automatically.

-- ── PER-DOCUMENT CATALOGUE ──────────────────────────────────────────────────────────────────────
ALTER TABLE research_documents
  ADD COLUMN IF NOT EXISTS catalogued_at        TIMESTAMPTZ,
  /** The structured record: every field with its value, rating and source quote. */
  ADD COLUMN IF NOT EXISTS catalogue            JSONB,
  /** Which model and prompt produced it, so a better prompt can re-catalogue only the stale rows. */
  ADD COLUMN IF NOT EXISTS catalogue_model      TEXT,
  ADD COLUMN IF NOT EXISTS catalogue_version    INTEGER,
  /** Why a document has no catalogue: unreadable scan, file missing, API error. Null when fine. */
  ADD COLUMN IF NOT EXISTS catalogue_error      TEXT;

COMMENT ON COLUMN research_documents.catalogue IS
  'Structured reading of the sheet. Every field is {value, confidence: high|medium|low, source_text}. A low-confidence value is shown to people and never used to satisfy a want automatically — see lib/research/catalogue-schema.ts.';
COMMENT ON COLUMN research_documents.catalogue_version IS
  'Bumped when the prompt or field set changes. The sweeper re-catalogues rows below the current version, so improving the prompt does not mean re-reading everything by hand.';

-- ── THE SEARCHABLE TEXT ─────────────────────────────────────────────────────────────────────────
--
-- Generated, not written: a trigger or an application write can drift from the catalogue it is
-- supposed to reflect, and a stale search index is the kind of wrong that looks like "we don't have
-- that document". `jsonb_path_query_array` flattens every string in the catalogue — values, source
-- quotes and keywords alike — so a search hits the surveyor's name whether it was stored as a value
-- or only quoted.
--
-- `to_tsvector('english', …)` with an explicit config is IMMUTABLE, which is what makes a generated
-- column legal here; `to_tsvector(x)` without one is not.
ALTER TABLE research_documents
  ADD COLUMN IF NOT EXISTS catalogue_search tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(document_label, '') || ' ' ||
      coalesce(original_filename, '') || ' ' ||
      coalesce(jsonb_path_query_array(catalogue, 'strict $.**?(@.type() == "string")')::text, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS research_documents_catalogue_search_idx
  ON research_documents USING GIN (catalogue_search);

-- The sweeper's queue: "library documents not yet catalogued, oldest first". Partial, because it
-- only ever asks about shareable rows with a file behind them.
CREATE INDEX IF NOT EXISTS research_documents_uncatalogued_idx
  ON research_documents (county_fips, created_at)
  WHERE catalogued_at IS NULL AND shareable = TRUE AND storage_path IS NOT NULL;

-- ── SUBDIVISION LOOKUP WAS AN UNINDEXED LEADING-WILDCARD SCAN ───────────────────────────────────
--
-- `heldPlatForSubdivision` matches with `ilike '%KEY%'` on `document_label`. A leading wildcard
-- cannot use a b-tree, so every library question was a sequential scan of 8,000 rows and growing.
-- pg_trgm indexes exactly this shape. Created only if the extension is available; a deployment
-- without it keeps working, just slowly, which is better than a seed that refuses to apply.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS research_documents_label_trgm_idx
    ON research_documents USING GIN (document_label gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm unavailable (%) — subdivision lookup stays a sequential scan.', SQLERRM;
END $$;

-- ── WHAT IS WAITING ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  todo INTEGER;
  done INTEGER;
BEGIN
  SELECT count(*) INTO todo FROM research_documents
    WHERE catalogued_at IS NULL AND shareable = TRUE AND storage_path IS NOT NULL;
  SELECT count(*) INTO done FROM research_documents WHERE catalogued_at IS NOT NULL;
  RAISE NOTICE 'catalogue: % document(s) already read, % waiting.', done, todo;
END $$;
