-- 558_bastrop_driven.sql — Bastrop's search runs, and the two traps that hid it (plan R39).
--
-- Seed 557 recorded Bastrop as "located, not working" because the Search control refused every
-- click. It does work. Two separate traps were in the way, neither visible from outside, and BOTH
-- produce exactly the symptom of a county with no records: a form that submits and returns nothing.
--
-- ── 1. THE BUTTON HAS NO BOX ────────────────────────────────────────────────────────────────────
--
-- `#cphNoMargin_SearchButtons1_btnSearch` is an <input> with width 0, height 0 and z-index -1.
-- Playwright refuses to click it, correctly — it is not a visible target. Aumentum renders buttons
-- as table composites, and the real clickable surface is a <td> whose id is the input's id plus
-- `__5`. Clicking `#cphNoMargin_SearchButtons1_btnSearch__5` works.
--
-- ── 2. THE TEXTBOX IS A WATERMARK FIELD ─────────────────────────────────────────────────────────
--
-- Its value is literally "Lastname Firstname" until a focus handler clears it. `page.fill()` sets
-- `.value` without triggering that handler, so the watermark survives, the form posts "Lastname
-- Firstname" as the search term, and the server answers "Please enter search criteria." — a
-- validation message that never reaches a scraper reading only the results area.
--
-- The fix is to click the field, clear it, and TYPE with real key events.
--
-- Both belong to the same family as the trusted-click trap on Avenu: a programmatic shortcut that
-- appears to work, on a page that then behaves as though nothing was entered.
--
-- ── DRIVEN ──────────────────────────────────────────────────────────────────────────────────────
--
-- Party search "SMITH" → SearchResults.aspx, 100 records:
--
--     202607417   05/04/2026   DEED         [E] SMITH AARON THOMAS -> SMITH BARBARA AMBE
--                                           JOSE ORTIZ SURVEY
--     8577 347-249 10/25/1984  DEED         [R] SMITH A BYRON -> MEYERS MCDADE H
--     7553 116-487 12/18/1980  ASSIGNMENT   [E] SMITH A C -> POOL LLOYD
--
-- The grid carries instrument number, book/page, filing date, document type, party names with
-- [R]/[E] role markers (R = grantoR, E = grantEe) and survey names. Coverage is the permanent index
-- 01/01/1973-07/30/2026; pre-1973 Bastrop is not online at all.
--
-- ── WHAT IS STILL NOT DONE ──────────────────────────────────────────────────────────────────────
--
-- No adapter class exists for this vendor, so Bastrop is NOT routed. "The search runs" and "the
-- platform can research this county" are different claims, and this seed only supports the first.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'survey_status', 'search_driven_no_adapter',
           'surveyed_at', '2026-08-02',
           'search_button_selector', '#cphNoMargin_SearchButtons1_btnSearch__5',
           'search_button_note', 'The <input> is 0x0 with z-index -1 and cannot be clicked. Aumentum renders buttons as table composites; the clickable surface is the <td> named <inputId>__5.',
           'party_field_watermark', 'Lastname Firstname',
           'watermark_note', 'The party field''s value IS the watermark until a focus handler clears it. page.fill() leaves it in place, the form posts the watermark as the search term, and the server answers "Please enter search criteria." Click, clear, then TYPE with real key events.',
           'role_markers', jsonb_build_object('R', 'grantor', 'E', 'grantee'),
           'live_proof', 'Party search SMITH returned 100 records with instrument number, book/page, filing date, document type, party names and survey names; oldest sampled 12/18/1980, newest 05/04/2026.',
           'not_routed_reason', 'No adapter class exists for Harris/Aumentum. The search runs; the platform cannot yet research this county.',
           'supersedes_seed', 557
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Bastrop';
