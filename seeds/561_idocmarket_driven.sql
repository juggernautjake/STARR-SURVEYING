-- 561_idocmarket_driven.sql — Bosque's modern window works, and a fourth kind of truncation (R39).
--
-- Seed 556 recorded Bosque's iDocMarket portal as located but not driven. It is driven now.
--
--     https://www.idocmarket.com/BOSTX1/Document/Search
--     Party "SMITH" → "Showing: 1000 of 3639 results", no login.
--
-- The submit control is the LAST element in #SearchForm — `input.btn-primary[value="Search"]`,
-- below every date-picker button. Grabbing the first control matching "search" lands on the date
-- picker's own buttons, which is what made the earlier attempt look like a broken form.
--
-- Records render as `div.row`, not table rows:
--
--     DEED #2026-02531  7/28/2026  5 Pages  MAIN KELLY  GUILD MORTGAGE COMPANY LLC  View »
--
-- Document type, instrument number, recorded date, page count, then the two parties.
--
-- The form also carries legal-description fields — StartLot, EndLot, Block, Legal, LegalNotes —
-- alongside VolCert/Book/Page and DocNotes.
--
-- ── FOUR VENDORS TRUNCATE, AND ALL FOUR SAY SO DIFFERENTLY ──────────────────────────────────────
--
--     Tyler        a banner    "more documents than the maximum allowed"
--     Avenu        a modal     "reached the configured timeout period"
--     iDocMarket   a COUNT     "Showing: 1000 of 3639 results"
--     Aumentum     NOTHING     100 rows and a counter that reads like an answer
--
-- iDocMarket's is the only one stating BOTH numbers, so a caller knows exactly how much is missing
-- rather than merely that something is. `describeShowing()` reports the shortfall precisely —
-- "returned 1000 of 3639, so 2639 are missing" — instead of the generic warning Aumentum's silent
-- cap forces.
--
-- Preserving that difference is the point. Flattening every cap into "here are the results" is how a
-- partial answer becomes a wrong one.
--
-- ── BOSQUE'S TWO FREE WINDOWS, NOW BOTH DRIVEN ──────────────────────────────────────────────────
--
--     Kofile QuickLink   1847-1905   free, no login   (search form driven earlier)
--     iDocMarket         2012-2026   free, no login   (driven here; validated through 7/30/2026)
--     NEITHER            1906-2011   the century-wide hole recorded in seed 556
--
-- ── NOT BUILT ───────────────────────────────────────────────────────────────────────────────────
--
-- No adapter class exists for iDocMarket, so Bosque is still NOT routed. The search runs; the
-- platform cannot yet research this county.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'second_portal_status', 'search_driven_no_adapter',
           'second_portal_driven_at', '2026-08-02',
           'second_portal_proof', 'Party "SMITH" → "Showing: 1000 of 3639 results", no login. Validated Through 7/30/2026.',
           'second_portal_submit', 'input.btn-primary[value="Search"] — the LAST element in #SearchForm. The first "search"-matching control is a date-picker button.',
           'second_portal_row_shape', 'div.row, not table rows: docType, #instrument, recorded date, page count, then the two parties.',
           'second_portal_extra_fields', 'StartLot, EndLot, Block, Legal, LegalNotes, VolCert, Book, Page, DocNotes',
           'second_portal_cap', 1000,
           'second_portal_truncation', 'HONEST — states "Showing: N of M results", so the shortfall is exact rather than merely suspected. Contrast Aumentum, which caps at 100 and announces nothing.',
           'second_portal_not_routed', 'No adapter class exists for iDocMarket. The search runs; the platform cannot yet research this county.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Bosque';
