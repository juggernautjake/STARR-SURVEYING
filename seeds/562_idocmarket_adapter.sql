-- 562_idocmarket_adapter.sql — Bosque routed, and an empty field that answered 182,715 (R39).
--
-- IDocMarketAdapter now exists and Bosque routes to it. Twenty-two counties are served by a proven
-- adapter, across six vendors.
--
-- ── THE ONE VENDOR THAT MARKS UP ITS DATA PROPERLY ──────────────────────────────────────────────
--
-- Every other vendor in this build hid its data behind something, and each cost a wrong answer
-- before it cost a fix: Kofile's department codes, Tyler's per-deployment search IDs and card
-- layout, Avenu's flat cell sequence and trusted-click requirement, Aumentum's zero-size button and
-- watermark field.
--
-- iDocMarket does not:
--
--     div.row.result-item
--       .doc-title                 [aria-label="Instrument: AFFIDAVIT"]
--       span[sort-desc=docnum]     [aria-label="Document Number: 2025-00232"]
--       p                          [aria-label="Record Date: 1/24/2025"]
--       .full-parties
--         .party-line.grantor-line > .party-value
--         .party-line.grantee-line > .party-value
--
-- The party ROLES are in the class names. Nothing is inferred from position, marker letters or a
-- summary string — which is why this adapter carries no trap comments and the others are full of
-- them.
--
-- ── THE BUG THAT MATTERED, AND IT WAS OURS ──────────────────────────────────────────────────────
--
-- The first driven run returned 1,000 records and reported "1000 of 182,715 results". None of them
-- matched the search name. The page re-initialises its form AFTER DOMContentLoaded and clears the
-- inputs, so filling too early left the party field empty — and an empty party field does not fail
-- on this vendor. It searches the ENTIRE county index.
--
-- So a name search answered with 182,715 unrelated records: a wrong answer wearing a very large
-- number, and more convincing than an empty one because it looks like thorough work.
--
-- Fixed by waiting for the form to settle, and by VERIFYING the field holds the term before
-- submitting — the same guard the Aumentum watermark needed. With it: 99 records, "all 99 result(s)
-- returned", every party actually matching.
--
-- ── HONEST TRUNCATION, PRESERVED ────────────────────────────────────────────────────────────────
--
-- This vendor states both numbers, so the adapter reports the shortfall exactly rather than warning
-- vaguely: "returned 1000 of 3639 result(s), so 2639 are missing".
--
-- ── BOSQUE STILL HAS A HOLE ─────────────────────────────────────────────────────────────────────
--
-- This adapter covers the MODERN index only (2012→). Bosque's historical portal (Kofile QuickLink,
-- 1847-1905) has no adapter, and 1906-2011 is in neither. bosqueGapWarning() fires on any search
-- reaching into that century, so it is stated rather than silently answered with nothing.
--
-- ── NOT BUILT ───────────────────────────────────────────────────────────────────────────────────
--
-- Instrument-number, book/page and legal-description search all have form fields and have NOT been
-- driven; each throws rather than returning []. Image retrieval goes through viewDoc() with an
-- opaque token and is charged. Pagination past the 1,000-row page is not implemented, and any
-- shortfall is reported exactly.

UPDATE research_site_adapters a
SET status = 'active'::research_adapter_status_enum,
    config = a.config
      || jsonb_build_object(
           'second_portal_status', 'driven_end_to_end',
           'adapter_class', 'IDocMarketAdapter',
           'routed', true,
           'routed_portal', 'iDocMarket (modern index 2012→). The historical QuickLink portal has NO adapter.',
           'markup_note', 'Party roles are in the CLASS NAMES (.grantor-line / .grantee-line) — nothing inferred from position or marker letters. The only vendor in this build that marks up its results properly.',
           'empty_field_hazard', 'The page re-initialises its form after DOMContentLoaded and CLEARS the inputs. An empty party field does NOT fail — it searches the entire county index and returned 182,715 unrelated records for a name search. The adapter now waits for the form to settle and VERIFIES the field before submitting.',
           'live_proof', 'Party "SMITH JAMES" through the compiled adapter: 99 records, "all 99 result(s) returned", 94/99 carrying both parties.',
           'truncation', 'HONEST — states "Showing: N of M results", so the shortfall is reported exactly rather than warned about vaguely.',
           'not_built', 'Instrument-number, book/page and legal-description search (fields exist, undriven); image retrieval (viewDoc token, charged); pagination past 1,000 rows.',
           'supersedes_seed', 561
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Bosque';
