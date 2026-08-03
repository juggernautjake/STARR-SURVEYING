-- 557_last_three_counties.sql — Bastrop, Lee and San Saba, hunted (plan R39).
--
-- These were the last three counties in the 80-mile ring with no answer. All three now have one,
-- and the three answers are different in a way that matters.
--
-- ── BASTROP: A FOURTH VENDOR, OPEN TO VISITORS ──────────────────────────────────────────────────
--
--     http://www.cc.co.bastrop.tx.us/RealEstate/SearchEntry.aspx
--
-- Harris Recording Solutions / Aumentum Recorder — the fourth vendor this platform had no name for,
-- after eDocTec, the corrected Tyler host pattern and Avenu 20/20.
--
-- Entry is as "Visitor" with NO login once the disclaimer is acknowledged. The Real Estate index
-- exposes party name, party type, grantor, grantee, instrument-number range, book, page and
-- document-type filters. The portal states its own coverage:
--
--     Permanent index   01/01/1973 – 07/30/2026
--     Temporary index   07/31/2026 – 08/02/2026
--     Images            from 01/01/1973
--
-- Pre-1973 Bastrop is not online at all.
--
-- NOT DRIVEN TO RESULTS. The visible Search control refuses both a synthetic and a trusted click
-- (Playwright reports it as never stable). So this is LOCATED, not working — the same line Tyler and
-- Avenu were held to until their results were actually read.
--
-- ── LEE AND SAN SABA: NO ONLINE PORTAL AT ALL ───────────────────────────────────────────────────
--
-- NETR lists both clerks as "Website Only", and neither county site carries a records search. These
-- counties appear not to publish land records online.
--
-- That is a CONCLUSION, and the schema now distinguishes it from an unfinished search:
--
--     no_online_portal   we looked, and the county publishes nothing online
--     not_found          we have not finished looking
--
-- Collapsing those two would turn "we stopped looking" into "there is nothing there", which is this
-- document's defect in its purest form. Either way neither says anything about whether a deed
-- exists: the records are on paper at the courthouse (Giddings, San Saba) and TexasFile indexes
-- them. A search here must never be reported as "no records".
--
-- Hays remains the only genuine `not_found`: Henschen names it, no Henschen URL resolves (confirmed
-- in a browser, not merely by fetch), and no replacement has been located.

UPDATE research_site_adapters a
SET base_url = 'http://www.cc.co.bastrop.tx.us/RealEstate/SearchEntry.aspx',
    config = a.config
      || jsonb_build_object(
           'system', 'harris_aumentum',
           'vendor', 'Harris Recording Solutions — Aumentum Recorder',
           'survey_status', 'portal_located_results_not_driven',
           'surveyed_at', '2026-08-02',
           'access', 'Visitor — NO login required once the disclaimer is acknowledged.',
           'index_coverage', 'Permanent 01/01/1973-07/30/2026; temporary to 08/02/2026; images from 01/01/1973. Pre-1973 is not online.',
           'form_fields', 'cphNoMargin_f_txtParty, drbPartyType, cphNoMargin_f_txtGrantor, cphNoMargin_f_txtGrantee, txtInstrumentNoFrom/To, txtBook, txtPage, dclDocType checkboxes',
           'blocker', 'The visible Search control (#cphNoMargin_SearchButtons1_btnSearch) refuses both synthetic and trusted clicks — Playwright never sees it as stable. Located, not working.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Bastrop';

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'survey_status', 'no_online_portal',
           'surveyed_at', '2026-08-02',
           'evidence', 'NETR lists the clerk as "Website Only"; the county site carries no records search.',
           'meaning', 'A CONCLUSION, not an unfinished search: this county appears not to publish land records online. It says NOTHING about whether a deed exists — the records are on paper at the courthouse and TexasFile indexes them.',
           'never_report', 'A search here must never be reported as "no records found".'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('Lee', 'San Saba');
