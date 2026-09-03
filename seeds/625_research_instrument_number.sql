-- seeds/625_research_instrument_number.sql — the deed you already have gets a box to go in.
--
-- ── A CASCADE ENTRY POINT THAT HAS NEVER BEEN REACHABLE ─────────────────────────────────────────
--
-- The worker has accepted an instrument number since it was written:
--
--   worker/src/counties/router.ts:53          CountyResearchInput.instrumentNumber
--   worker/src/counties/router.ts:502         forwarded to the Bell orchestrator
--   worker/src/counties/bell/orchestrator.ts:142
--       instrumentNumbers: new Set(input.instrumentNumber ? [input.instrumentNumber] : [])
--
-- That last line SEEDS the Bell known-identifiers cascade — the wave that follows deed history,
-- pivots off personal-property accounts and finds related parcels. Handing it a starting instrument
-- is the strongest possible opening move, because it is a document we KNOW belongs to the property
-- rather than one the CAD search has to find first.
--
-- Nothing has ever handed it one. `research_projects` has no such column, the create form has no
-- such field, and `pipeline/route.ts` — the route that actually starts a run — does not mention
-- `instrumentNumber` at all. Grepped 2026-09-02: every other hit in app/ is the document-purchase
-- path, which is a different thing entirely (a number we found, not one we were given).
--
-- So the cascade has always started from nothing, in every run, for every property. Not because the
-- feature was hard, but because the value had nowhere to enter the system.
--
-- ── WHY A COLUMN AND NOT A NOTE ─────────────────────────────────────────────────────────────────
--
-- An operator can already type "the deed is 2019-12345" into the notes, and that reaches the AI as
-- prose. It does NOT reach the cascade, which needs the value in a field it reads. The distinction
-- is the entire lesson of seed 624: a thing written where nothing looks for it is a thing that does
-- not exist.
--
-- Stored as text, raw, exactly as the operator typed it. Instrument numbers are written a dozen ways
-- — `2019-12345`, `201912345`, `Doc# 2019-12345`, `V123P456` — and normalising at the boundary would
-- destroy the form the county clerk actually uses. `purchase-ledger.instrumentKey()` already owns
-- normalisation for comparison, and it deliberately keeps the raw string alongside so a human always
-- sees what the county calls it. Same rule here.

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS instrument_number text;

COMMENT ON COLUMN research_projects.instrument_number IS
  'A deed/instrument number the operator already has. Seeds the Bell known-identifiers cascade '
  '(orchestrator.ts:142), which had no way to be given a starting document before seed 625. '
  'Stored raw — normalisation for comparison belongs to purchase-ledger.instrumentKey().';
