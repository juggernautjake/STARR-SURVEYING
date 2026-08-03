-- 564_aumentum_legal_search.sql — search by land in a second county, and a begins-with trap (R39).
--
-- Bastrop's legal-description search is now implemented, so searching by LAND rather than by name
-- works in two counties: Bosque (iDocMarket) and Bastrop (Aumentum).
--
-- ── THE FREE-FORM LEGAL FIELD MATCHES "BEGINS WITH", NOT "CONTAINS" ─────────────────────────────
--
-- The portal states its own rule in the results header: `Freeform Legal begins with ORTIZ`. Driven
-- on 2026-08-02:
--
--     ORTIZ         0 records
--     JOSE        100 records
--     JOSE ORTIZ  100 records
--
-- Bastrop's records reference the JOSE ORTIZ SURVEY constantly. "ORTIZ" — the obvious thing for a
-- surveyor to type, because the distinctive part of a survey name is rarely the first word —
-- returns nothing.
--
-- That zero reads as "no documents touch this land". It actually means "your term is not at the
-- START of the legal description". It is the same defect as every other one in this document, and
-- this instance is particularly cruel: it fails precisely on the search a surveyor is most likely
-- to run.
--
-- The portal offers no contains-mode for this field, so it cannot be fixed from our side. Instead an
-- empty result is returned WITH the reason and the remedy:
--
--     "0 records for legal description "ORTIZ". NOTE: this field matches BEGINS WITH, not contains
--      — a term from the middle of a legal description (e.g. "ORTIZ" for "JOSE ORTIZ SURVEY")
--      returns nothing. Try the LEADING words. This is not evidence that no documents touch this
--      land."
--
-- `looksLikeMidStringLegal()` is a pure function flagging terms likely to hit this — anything naming
-- a SURVEY or ABSTRACT, or starting with LOT/BLOCK/TRACT — so the warning is testable rather than
-- only observed.
--
-- ── DRIVEN ──────────────────────────────────────────────────────────────────────────────────────
--
--     legal begins-with "JOSE ORTIZ"  → 100 records (capped; truncation reported)
--         2004-806  07/06/2010  DEED           AUGUST GERALD -> HARLOW PETER M ET UX (+)
--         2004-810  07/06/2010  DEED OF TRUST  HARLOW PETER M ET UX (+) -> ENVOY MORTGAGE LTD (+)
--
--     legal "ORTIZ"                   → 0 records, with the begins-with explanation attached
--
-- ── THE TWO COUNTIES BEHAVE DIFFERENTLY, AND BOTH SAY SO ────────────────────────────────────────
--
--     Bosque   (iDocMarket)  Subdivision is a <select> of 396 names — an EXACT vocabulary. A near
--                            miss is refused with the real names offered.
--     Bastrop  (Aumentum)    Free-form text, BEGINS WITH. A miss returns 0 with the reason attached.
--
-- Neither silently answers "no documents". That is the only thing they have to have in common.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'legal_description_search', 'IMPLEMENTED via the free-form legal field (#cphNoMargin_f_txtLDFreeForm).',
           'legal_match_mode', 'begins with',
           'legal_match_note', 'The portal states this itself: "Freeform Legal begins with ORTIZ". Driven proof — ORTIZ: 0 records; JOSE: 100; JOSE ORTIZ: 100. Bastrop records reference the JOSE ORTIZ SURVEY constantly, so the obvious surveyor search returns nothing.',
           'legal_empty_handling', 'A zero result is returned WITH the reason and remedy attached, never bare: the field matches begins-with, so try the LEADING words. Explicitly not evidence that no documents touch the land.',
           'legal_search_proof', 'legal begins-with "JOSE ORTIZ" → 100 records (capped, truncation reported); legal "ORTIZ" → 0 with explanation.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Bastrop';
