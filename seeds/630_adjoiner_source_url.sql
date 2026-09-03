-- 630_adjoiner_source_url.sql
-- A neighbour carries the page it was found on.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────────────────────
--
-- > "The user can then review everything and even visit the sites and sources the data … was
-- >  pulled from."
--
-- Until 2026-09-03 the only writer of `research_adjoiners` sat behind a Testing-Lab route and
-- passed owner names only. A normal Bell run now files its GIS-identified neighbours with parcel
-- id, situs address, acreage and legal description (plan E4) — and the page a reviewer can open
-- to see that parcel at the appraisal district. The register had nowhere to keep that page.
--
-- Nullable: rows written before this seed, and deed-call neighbours with no parcel, have none.

ALTER TABLE research_adjoiners
  ADD COLUMN IF NOT EXISTS source_url TEXT;

COMMENT ON COLUMN research_adjoiners.source_url IS
  'The neighbour''s page at its source — the appraisal district property view for a GIS-identified parcel. Null when unknown (seed 630).';
