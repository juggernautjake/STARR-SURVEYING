-- 568_adjoiner_failures_surface.sql — a dead field swallowed every adjoiner step failure (R39).
--
-- Seeds 566 and 567 audited the adapters. Auditing the layer ABOVE them found the same defect,
-- and this instance is structural rather than a single bad catch block.
--
-- ── THE DEAD FIELD ──────────────────────────────────────────────────────────────────────────────
--
-- `AdjacentResearchWorker` declared `private errors: string[]`, reset it at the end of every run,
-- and NEVER merged it into the returned result.
--
-- It was dead. Every step that recorded a failure into it was writing to nothing:
--
--     AI deed selection failed      -> logged, recorded nowhere, returned null
--     Image download failed         -> logged, recorded nowhere, returned []
--     Boundary extraction crashed   -> logged, recorded nowhere, returned null
--
-- A log line is not a result. The caller received a null deed, an empty image list and a null
-- boundary — indistinguishable from an adjoiner that genuinely has no deed, no images and no metes
-- and bounds. All three of those are REAL, COMMON situations, which is exactly what made the
-- failures invisible.
--
-- ── AND THE RUN CALLED ITSELF COMPLETE ──────────────────────────────────────────────────────────
--
-- `researchStatus` was 'complete' whenever any boundary calls were extracted, regardless of what
-- had failed on the way. So a run that lost its images and could not pick a deed still reported
-- complete, and a reviewer would stop looking at precisely the adjoiner needing a second look.
--
-- Now: 'complete' requires a boundary AND a clean run; anything else is 'partial', with a line
-- saying how many steps failed.
--
-- ── ONE FIX MADE THIS WORSE BEFORE IT MADE IT BETTER ────────────────────────────────────────────
--
-- Seeds 566/567 made the adapters THROW informative errors — "the absence of ACCESS, not the
-- absence of images", "goes through the site's paid cart". The image-download catch here caught
-- those and returned [], discarding exactly the information the change had created. Fixing the leaf
-- without following it upward would have produced better errors that nobody ever saw.
--
-- ── VERIFIED ────────────────────────────────────────────────────────────────────────────────────
--
-- `adjoiner-failures-surface.test.ts` pins the drain, its ordering before the reset, the three
-- recorded failures, and the complete-requires-clean rule. Worker suite 836/836.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'adjoiner_failure_reporting', 'FIXED 2026-08-02 — AdjacentResearchWorker.errors was a dead field: declared, reset, never merged into the result. Deed-selection, image-download and extraction failures were logged and then discarded.',
           'adjoiner_status_rule', 'researchStatus is only "complete" when a boundary was extracted AND no step failed. Previously any boundary made it complete regardless of what had failed.',
           'adjoiner_leaf_vs_caller', 'Making the adapters throw informative errors was not enough — the worker caught them and returned []. A leaf fix has to be followed upward or it produces better errors nobody sees.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum;
