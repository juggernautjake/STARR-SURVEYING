-- 548_edoctec_vendor.sql — a vendor nobody knew about, and two counties off the paywall (plan R39).
--
-- Found on 2026-08-02 by hunting Coryell's portal from the county's own site, one county at a time,
-- after the Tyler Host pattern from R38 failed to generalise.
--
-- ── WHAT CHANGED ────────────────────────────────────────────────────────────────────────────────
--
--   Coryell   48099   TexasFile (paywall, no credentials)  →  eDocTec, fully open
--   Lampasas  48281   TexasFile (paywall, no credentials)  →  eDocTec, fully open
--
-- Coryell is worth two entries on the owner's list by itself: Gatesville AND Copperas Cove.
--
--     https://mclennan.edoctec.com/CoryellPublicRecords
--     https://mclennan.edoctec.com/LampasasPublicRecords
--
-- Both were DRIVEN, not merely pinged. Coryell reported 12,705 documents / 20,267 party records for
-- a single surname and served rows recorded two days before the search. Both were then re-driven
-- through the compiled adapter class itself, which returned 12 and 13 grouped documents.
--
-- ── THE HOSTNAME IS A TRAP ──────────────────────────────────────────────────────────────────────
--
-- Everything is served from `mclennan.edoctec.com` — but McLennan's OWN records are not there.
-- `/McLennan` on that host is a Justice of the Peace ticket-payment portal. Assuming the hostname
-- implied coverage would have pointed Waco deed searches at a page that sells traffic fines.
-- McLennan's records portal is still not found.
--
-- ── ONE ROW PER PARTY, NOT PER DOCUMENT ─────────────────────────────────────────────────────────
--
-- eDocTec's result table is shaped differently from every other vendor here:
--
--     Instrument No | Filed Date | Party Type | Full Name | Document Type | Book/Volume | Page/Line
--
-- The same instrument appears once per party, which is why the site reports 12,705 documents and
-- 20,267 records for one search. Rows are grouped back into documents by instrument number and
-- filed date.
--
-- And the part that matters most: a PARTY search returns only the parties that matched the search
-- term. A deed whose grantee is not a Smith comes back, from a Smith search, with no grantee. That
-- is not a deed without a grantee — it is a question we did not ask. Every document assembled from
-- a party search is therefore flagged `partiesComplete: false`, because recording it otherwise
-- would be this project's recurring defect exactly: an unknown rendered as an answer.

-- ── Coryell ─────────────────────────────────────────────────────────────────────────────────────
UPDATE research_site_adapters a
SET base_url = 'https://mclennan.edoctec.com/CoryellPublicRecords',
    status = 'active'::research_adapter_status_enum,
    config = a.config
      || jsonb_build_object(
           'system', 'edoctec',
           'survey_status', 'driven_end_to_end',
           'surveyed_at', '2026-08-02',
           'party_search_path', '/Search/PartySearch',
           'document_search_path', '/Home/Index',
           'result_model', 'one row per PARTY — group by instrument number + filed date',
           'party_lists_partial', true,
           'live_proof', '12,705 documents / 20,267 party records for surname SMITH; newest row filed 07/30/2026; 20 rows grouped to 12 documents through the compiled adapter',
           'places', 'Gatesville, Copperas Cove',
           'notes', 'Fully open — no login, no paywall. Previously routed to TexasFile, which is a paywall we hold no credentials for, so every search returned nothing.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name = 'Coryell';

-- ── Lampasas ────────────────────────────────────────────────────────────────────────────────────
UPDATE research_site_adapters a
SET base_url = 'https://mclennan.edoctec.com/LampasasPublicRecords',
    status = 'active'::research_adapter_status_enum,
    config = a.config
      || jsonb_build_object(
           'system', 'edoctec',
           'survey_status', 'driven_end_to_end',
           'surveyed_at', '2026-08-02',
           'party_search_path', '/Search/PartySearch',
           'document_search_path', '/Home/Index',
           'result_model', 'one row per PARTY — group by instrument number + filed date',
           'party_lists_partial', true,
           'live_proof', 'Identical column set to Coryell; 20 rows grouped to 13 documents through the compiled adapter; newest row filed 07/28/2026',
           'notes', 'Fully open. Also note: the Henschen adapter had Lampasas filed under FIPS 48283, which is La Salle County — corrected to 48281 in the same change.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name = 'Lampasas';

-- ── McLennan: record the dead end, so nobody re-walks it ─────────────────────────────────────────
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'survey_status', 'portal_not_found',
           'surveyed_at', '2026-08-02',
           'ruled_out', jsonb_build_array(
             'mclennan.edoctec.com/McLennanPublicRecords — 404',
             'mclennan.edoctec.com/McLennan — Justice of the Peace ticket payments, NOT records',
             'mclennantx-web.tylerhost.net — 404',
             'mclennan.tx.publicsearch.us — unreachable'
           ),
           'discovery_note', 'Waco. The edoctec host is NAMED for McLennan but does not serve its land records. Still falls through to TexasFile (paywalled). Next step is the county clerk''s own site.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name = 'McLennan';
