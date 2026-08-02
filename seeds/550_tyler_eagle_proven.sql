-- 550_tyler_eagle_proven.sql — the nine Tyler counties work, and seed 549 was wrong (plan R39).
--
-- Seed 549 recorded that Tyler's search POST "returns totalPages=0 for a name the autocomplete
-- confirms is indexed" and called the contradiction unresolved. The contradiction was mine.
--
-- Screenshotting the page settled it in one look. Tyler renders:
--
--     "We found more documents than the maximum allowed. It may be necessary to refine your search."
--
-- `totalPages: 0` is an OVER-LIMIT signal, not an empty one. It means the search matched MORE than
-- the portal will return. Reading it as "no records" inverts the truth exactly: it turns the largest
-- result set the portal can produce into "this property has nothing recorded".
--
-- This is the sharpest instance of the defect this document exists to close, because the wrong
-- reading is the one a careful person arrives at — the field is called totalPages, and it says zero.
-- Only the rendered page distinguishes the two, so the reader now requires the page text and refuses
-- to decide from the JSON alone.
--
-- Proven by narrowing the same search:
--
--     SMITH,       no date range     totalPages 0    over limit
--     SMITH,       one month         totalPages 1    real results
--     SMITH JAMES, 2025              totalPages 1    14 documents
--
-- ── ALSO WRONG IN 549: WHERE THE RESULTS LIVE ───────────────────────────────────────────────────
--
-- Results are `li.ss-search-row` cards, not table rows. Every probe that reported "0 rows" was
-- querying for <tr> on a page that was showing fourteen documents.
--
-- ── DRIVEN END TO END ───────────────────────────────────────────────────────────────────────────
--
-- McLennan, grantor "SMITH JAMES", 2025, through the compiled TylerEagleAdapter: 8 documents,
-- 8 of 8 parsed, banner agreeing. The legal descriptions are why this county matters to a surveyor:
--
--     Subdivision: INDIAN TRAILS ADDITION Lot: 10 Block: 2 Acres: .241 408 NAVAJO TRAIL, MCGREGOR
--     Survey Name: T J CHAMBERS Acres: 0.995
--
-- Subdivision, lot, block, survey name and acreage, straight off the index.
--
-- ── WILLIAMSON MOVES OFF KOFILE ─────────────────────────────────────────────────────────────────
--
-- Williamson was in the Kofile set because its portal answered 200 — but that portal serves ONLY
-- Commissioners Court, with no land records at all. Kofile is checked first, so it won the routing
-- and every Williamson deed search returned an empty page. It now routes to Tyler Eagle, where its
-- deeds actually are. A reachable portal for the WRONG index is worse than no portal.

UPDATE research_site_adapters a
SET status = 'active'::research_adapter_status_enum,
    config = a.config
      || jsonb_build_object(
           'survey_status', 'driven_end_to_end',
           'surveyed_at', '2026-08-02',
           'results_selector', 'li.ss-search-row (CARDS, not table rows)',
           'total_pages_zero_means', 'OVER LIMIT — too many documents, not none. Never record as "no records found".',
           'over_limit_banner', 'We found more documents than the maximum allowed',
           'narrowing_strategy', 'Slice the date range into contiguous windows (no gaps — a gap is a deed nobody sees) and re-search each.',
           'supersedes_seed', 549,
           'correction', 'Seed 549 called the totalPages=0 result an unresolved contradiction. It was an over-limit signal, and the misreading was ours.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('McLennan', 'Burnet', 'Hamilton', 'Hill', 'Mills', 'Erath', 'Navarro', 'Somervell', 'Williamson');

-- McLennan carries the end-to-end proof.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'live_proof', 'Grantor "SMITH JAMES", 2025, through the compiled adapter: 8 documents, 8/8 parsed, banner agreed. Legal descriptions include subdivision/lot/block and survey name/acreage.',
           'search_id', 'DOCSEARCH402S1',
           'search_id_note', 'Per deployment — this county''s marriage index is DOCSEARCH392S3. Discovered from the menu, never hardcoded across counties.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name = 'McLennan';

-- Williamson: say plainly why it left Kofile, so nobody adds it back on the strength of a 200.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'removed_from_kofile', true,
           'removed_reason', 'Its Kofile portal answers 200 but exposes ONLY Commissioners Court — no land records. Kofile is checked first, so it won the routing and every deed search returned an empty page that read as "no deeds". A reachable portal for the WRONG index is worse than no portal.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name = 'Williamson';
