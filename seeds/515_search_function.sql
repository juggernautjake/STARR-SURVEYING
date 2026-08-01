-- seeds/515_search_function.sql
--
-- `search_everything()` — one query across every document and record (platform audit §3b).
--
-- ── WHY THIS IS SQL AND NOT ELEVEN FETCHES IN A ROUTE ────────────────────────────────────────────
--
-- Three reasons, in order of how much they cost to get wrong:
--
--  1. **The threshold has to live here.** `pg_trgm.word_similarity_threshold` cannot be set on the
--     session (the Supabase pooler hands back a backend that never read it) or on the database (same
--     reason, and it LOOKS applied — see seed 514). The function applies it per call instead.
--
--     It is applied by `SET LOCAL` in a plpgsql body rather than by the tidier `CREATE FUNCTION …
--     SET pg_trgm.word_similarity_threshold = 0.4` clause, because Supabase denies that outright:
--     `42501 permission denied to set parameter`. The definition-time clause is privilege-checked
--     against the role creating the function; the runtime `SET LOCAL` is checked against the role
--     calling it, and that one is permitted. Same effect, one indirection, and the only version that
--     can actually be deployed here.
--  2. **Ranking across corpora only means something if one query does it.** Eleven fetches merged in
--     JavaScript can only interleave by table order or re-score in memory over a truncated page —
--     which silently drops the best hit from the eleventh table.
--  3. It keeps the trigram and full-text indexes reachable. PostgREST cannot express
--     `word_similarity(…)` or `ts_rank_cd(…)`; an RPC can, and the route still talks to PostgREST.
--
-- ── PERMISSION IS AN ARGUMENT, NOT AN ASSUMPTION ────────────────────────────────────────────────
--
-- This runs as the service role and reads across tables whose own pages gate access individually.
-- That makes it a permission bypass by construction, so the caller's roles are passed in and every
-- branch is gated on them. `p_roles` is required and empty means empty — a search that defaults to
-- "show everything" when the caller is unknown is how a search box becomes a data leak.
--
-- `org_id` is filtered the same way (§1.2). Today there is one org and it is nullable, so the filter
-- is `org_id IS NULL OR org_id = p_org` — which is correct now and stays correct after the backfill.

DROP FUNCTION IF EXISTS search_everything(text, text[], text[], text[], text, timestamptz, timestamptz, uuid, int);

CREATE FUNCTION search_everything(
  p_query     text,
  p_roles     text[],
  p_corpora   text[]     DEFAULT NULL,   -- NULL = every corpus the roles allow
  p_types     text[]     DEFAULT NULL,   -- NULL = any type
  p_date_role text       DEFAULT 'created',
  p_from      timestamptz DEFAULT NULL,
  p_to        timestamptz DEFAULT NULL,
  p_org       uuid       DEFAULT NULL,
  p_limit     int        DEFAULT 50
)
RETURNS TABLE (
  corpus      text,
  row_id      text,
  title       text,
  snippet     text,
  doc_type    text,
  created_at  timestamptz,
  effective_at timestamptz,
  score       real,
  context_id  text
)
LANGUAGE plpgsql
STABLE
AS $$
-- `RETURNS TABLE (corpus, title, score, …)` declares those names as plpgsql OUT VARIABLES, and they
-- then shadow the identically-named columns inside the query — `column reference "corpus" is
-- ambiguous`. A hazard the LANGUAGE sql version did not have; it arrived only because Supabase
-- forced the move to plpgsql (see above). Resolve bare references to the COLUMN, which is what every
-- reference in this body means — the OUT variables are never read, only returned through.
#variable_conflict use_column
BEGIN
  -- The whole reason this is a function rather than a view or a route-side join. See seed 514: at
  -- the 0.6 default, every single-letter typo measured against this data (0.43–0.55) misses, so
  -- "matching spellings" would ship matching nothing.
  BEGIN
    SET LOCAL pg_trgm.word_similarity_threshold = 0.4;
  EXCEPTION WHEN OTHERS THEN
    -- A role without permission to set it still gets a working search, just a stricter one. Failing
    -- the whole query over a tuning parameter would be the worse trade.
    NULL;
  END;

  RETURN QUERY
  WITH q AS (
  SELECT
    p_query AS raw,
    -- Prefix-matched AND-ed tsquery, built defensively: `plainto_tsquery` would drop the prefix
    -- behaviour, and hand-built strings are a syntax error waiting for a customer called "Smith & Co".
    websearch_to_tsquery('english', p_query) AS tsq,
    lower(trim(p_query)) AS norm
),
-- Which corpora the caller may see AND asked for. Both filters, deliberately: asking for a corpus you
-- cannot see must return nothing rather than an error, so the UI can offer a fixed filter list.
allowed AS (
  SELECT unnest AS id FROM unnest(ARRAY[
    'research-documents','job-files','field-media','maintenance-documents','files',
    'customers','jobs','contacts','leads','invoices'
  ])
  WHERE p_corpora IS NULL OR unnest = ANY(p_corpora)
),
hits AS (
  -- ── research_documents — the largest real corpus, and where deeds and plats live ──────────────
  SELECT
    'research-documents'::text AS corpus,
    d.id::text                 AS row_id,
    coalesce(nullif(d.document_label,''), d.original_filename, 'Untitled document') AS title,
    left(coalesce(d.extracted_text, d.recording_info, ''), 300) AS snippet,
    d.document_type            AS doc_type,
    d.created_at,
    d.recorded_date::timestamptz AS effective_at,
    (
      word_similarity(q.norm, coalesce(d.document_label,'') || ' ' || coalesce(d.original_filename,'')) * 3
      + word_similarity(q.norm, left(coalesce(d.extracted_text,''), 4000)) * 1
      + coalesce(ts_rank_cd(to_tsvector('english',
          coalesce(d.document_label,'') || ' ' || coalesce(d.original_filename,'') || ' ' ||
          coalesce(d.extracted_text,'') || ' ' || coalesce(d.recording_info,'')), q.tsq), 0) * 2
      + CASE WHEN lower(coalesce(d.document_label,'')) = q.norm THEN 5 ELSE 0 END
    )::real AS score,
    d.research_project_id::text AS context_id
  FROM research_documents d, q
  WHERE 'research-documents' IN (SELECT id FROM allowed)
    AND (p_roles && ARRAY['admin','developer','researcher','drawer','tech_support'])
    AND (d.org_id IS NULL OR p_org IS NULL OR d.org_id = p_org)
    AND (p_types IS NULL OR d.document_type = ANY(p_types))
    AND (
      q.norm <% coalesce(d.document_label,'')
      OR q.norm <% coalesce(d.original_filename,'')
      OR to_tsvector('english',
           coalesce(d.document_label,'') || ' ' || coalesce(d.original_filename,'') || ' ' ||
           coalesce(d.extracted_text,'') || ' ' || coalesce(d.recording_info,'')) @@ q.tsq
    )
    AND (p_from IS NULL AND p_to IS NULL OR CASE p_date_role
          WHEN 'effective' THEN d.recorded_date::timestamptz
          WHEN 'modified'  THEN d.updated_at
          ELSE d.created_at END BETWEEN coalesce(p_from, '-infinity') AND coalesce(p_to, 'infinity'))

  UNION ALL
  -- ── job_files ────────────────────────────────────────────────────────────────────────────────
  SELECT 'job-files', f.id::text,
    coalesce(nullif(f.file_name,''), f.name, 'Untitled file'),
    left(coalesce(f.description,''), 300),
    coalesce(f.file_type, f.mime_type),
    f.created_at, f.created_at,
    (word_similarity(q.norm, coalesce(f.file_name,'') || ' ' || coalesce(f.name,'')) * 3
     + word_similarity(q.norm, coalesce(f.description,'')) * 1
     + CASE WHEN lower(coalesce(f.file_name,'')) = q.norm THEN 5 ELSE 0 END)::real,
    f.job_id::text
  FROM job_files f, q
  WHERE 'job-files' IN (SELECT id FROM allowed)
    AND (p_roles && ARRAY['admin','developer','field_crew','tech_support','researcher'])
    AND coalesce(f.is_deleted, false) = false
    AND (f.org_id IS NULL OR p_org IS NULL OR f.org_id = p_org)
    AND (p_types IS NULL OR coalesce(f.file_type, f.mime_type) = ANY(p_types))
    AND (q.norm <% coalesce(f.file_name,'') OR q.norm <% coalesce(f.name,'') OR q.norm <% coalesce(f.description,''))
    AND (p_from IS NULL AND p_to IS NULL OR f.created_at BETWEEN coalesce(p_from,'-infinity') AND coalesce(p_to,'infinity'))

  UNION ALL
  -- ── field_media — transcribed voice notes are often the ONLY written record of a site visit ──
  SELECT 'field-media', m.id::text,
    coalesce(nullif(m.point_name,''), 'Field ' || coalesce(m.media_type,'capture')),
    left(coalesce(m.transcription,''), 300),
    m.media_type,
    m.created_at, m.captured_at,
    (word_similarity(q.norm, coalesce(m.point_name,'')) * 3
     + word_similarity(q.norm, coalesce(m.transcription,'')) * 1
     + coalesce(ts_rank_cd(to_tsvector('english',
         coalesce(m.transcription,'') || ' ' || coalesce(m.point_name,'')), q.tsq), 0) * 2)::real,
    m.job_id::text
  FROM field_media m, q
  WHERE 'field-media' IN (SELECT id FROM allowed)
    AND (p_roles && ARRAY['admin','developer','field_crew','tech_support'])
    AND (p_types IS NULL OR m.media_type = ANY(p_types))
    AND (q.norm <% coalesce(m.point_name,'')
      OR to_tsvector('english', coalesce(m.transcription,'') || ' ' || coalesce(m.point_name,'')) @@ q.tsq)
    AND (p_from IS NULL AND p_to IS NULL OR CASE p_date_role
          WHEN 'effective' THEN m.captured_at ELSE m.created_at END
         BETWEEN coalesce(p_from,'-infinity') AND coalesce(p_to,'infinity'))

  UNION ALL
  -- ── maintenance_event_documents ──────────────────────────────────────────────────────────────
  SELECT 'maintenance-documents', md.id::text,
    coalesce(nullif(md.filename,''), 'Maintenance document'),
    left(coalesce(md.description,''), 300),
    md.kind, md.uploaded_at, md.uploaded_at,
    (word_similarity(q.norm, coalesce(md.filename,'')) * 3
     + word_similarity(q.norm, coalesce(md.description,'')) * 1)::real,
    md.event_id::text
  FROM maintenance_event_documents md, q
  WHERE 'maintenance-documents' IN (SELECT id FROM allowed)
    AND (p_roles && ARRAY['admin','developer','tech_support','equipment_manager'])
    AND (md.org_id IS NULL OR p_org IS NULL OR md.org_id = p_org)
    AND (p_types IS NULL OR md.kind = ANY(p_types))
    AND (q.norm <% coalesce(md.filename,'') OR q.norm <% coalesce(md.description,''))
    AND (p_from IS NULL AND p_to IS NULL OR md.uploaded_at BETWEEN coalesce(p_from,'-infinity') AND coalesce(p_to,'infinity'))

  UNION ALL
  -- ── file_nodes (File Explorer) ───────────────────────────────────────────────────────────────
  SELECT 'files', n.id::text, n.name, '', n.node_type, n.created_at, n.updated_at,
    (word_similarity(q.norm, coalesce(n.name,'')) * 3
     + CASE WHEN lower(coalesce(n.name,'')) = q.norm THEN 5 ELSE 0 END)::real,
    n.parent_id::text
  FROM file_nodes n, q
  WHERE 'files' IN (SELECT id FROM allowed)
    AND (p_roles && ARRAY['admin','developer','tech_support'])
    AND n.deleted_at IS NULL
    AND (n.org_id IS NULL OR p_org IS NULL OR n.org_id = p_org)
    AND (p_types IS NULL OR n.node_type = ANY(p_types))
    AND q.norm <% coalesce(n.name,'')
    AND (p_from IS NULL AND p_to IS NULL OR CASE p_date_role
          WHEN 'modified' THEN n.updated_at ELSE n.created_at END
         BETWEEN coalesce(p_from,'-infinity') AND coalesce(p_to,'infinity'))

  UNION ALL
  -- ── jobs — searched by address and subdivision far more than by job number ───────────────────
  SELECT 'jobs', j.id::text,
    coalesce(nullif(j.job_number,'') || ' — ', '') || coalesce(nullif(j.name,''), j.address, 'Job'),
    left(coalesce(j.address,'') || ' ' || coalesce(j.city,'') || ' ' || coalesce(j.description,''), 300),
    j.survey_type, j.created_at, j.date_received::timestamptz,
    (word_similarity(q.norm, coalesce(j.job_number,'') || ' ' || coalesce(j.name,'')) * 3
     + word_similarity(q.norm, coalesce(j.address,'') || ' ' || coalesce(j.subdivision,'') || ' ' ||
         coalesce(j.client_name,'') || ' ' || coalesce(j.lot_number,'')) * 1
     + coalesce(ts_rank_cd(to_tsvector('english',
         coalesce(j.job_number,'') || ' ' || coalesce(j.name,'') || ' ' || coalesce(j.description,'') || ' ' ||
         coalesce(j.address,'') || ' ' || coalesce(j.city,'') || ' ' || coalesce(j.county,'') || ' ' ||
         coalesce(j.subdivision,'') || ' ' || coalesce(j.client_name,'') || ' ' || coalesce(j.notes,'')), q.tsq), 0) * 2
     + CASE WHEN lower(coalesce(j.job_number,'')) = q.norm THEN 5 ELSE 0 END)::real,
    j.id::text
  FROM jobs j, q
  WHERE 'jobs' IN (SELECT id FROM allowed)
    AND (p_roles && ARRAY['admin','developer','field_crew','tech_support','researcher'])
    AND j.deleted_at IS NULL
    AND (j.org_id IS NULL OR p_org IS NULL OR j.org_id = p_org)
    AND (p_types IS NULL OR j.survey_type = ANY(p_types))
    AND (q.norm <% coalesce(j.job_number,'') OR q.norm <% coalesce(j.name,'')
      OR q.norm <% coalesce(j.address,'') OR q.norm <% coalesce(j.subdivision,'')
      OR q.norm <% coalesce(j.client_name,'')
      OR to_tsvector('english',
           coalesce(j.job_number,'') || ' ' || coalesce(j.name,'') || ' ' || coalesce(j.description,'') || ' ' ||
           coalesce(j.address,'') || ' ' || coalesce(j.city,'') || ' ' || coalesce(j.county,'') || ' ' ||
           coalesce(j.subdivision,'') || ' ' || coalesce(j.client_name,'') || ' ' || coalesce(j.notes,'')) @@ q.tsq)
    AND (p_from IS NULL AND p_to IS NULL OR CASE p_date_role
          WHEN 'effective' THEN j.date_received::timestamptz
          WHEN 'modified'  THEN j.updated_at ELSE j.created_at END
         BETWEEN coalesce(p_from,'-infinity') AND coalesce(p_to,'infinity'))

  UNION ALL
  -- ── customers — no viewer page exists, so the RESULT carries the contact details ─────────────
  SELECT 'customers', cu.id::text,
    coalesce(nullif(cu.display_name,''), cu.company, 'Customer'),
    left(concat_ws(' · ', nullif(cu.company,''), nullif(cu.primary_email,''), nullif(cu.primary_phone,''), nullif(cu.notes,'')), 300),
    NULL, cu.created_at, cu.updated_at,
    (word_similarity(q.norm, coalesce(cu.display_name,'') || ' ' || coalesce(cu.company,'')) * 3
     + word_similarity(q.norm, coalesce(cu.primary_email,'') || ' ' || coalesce(cu.primary_phone,'')) * 1
     + CASE WHEN lower(coalesce(cu.display_name,'')) = q.norm THEN 5 ELSE 0 END)::real,
    NULL
  FROM customers cu, q
  WHERE 'customers' IN (SELECT id FROM allowed)
    AND (p_roles && ARRAY['admin','developer','tech_support'])
    AND (cu.org_id IS NULL OR p_org IS NULL OR cu.org_id = p_org)
    AND (q.norm <% coalesce(cu.display_name,'') OR q.norm <% coalesce(cu.company,'')
      OR q.norm <% coalesce(cu.primary_email,'') OR q.norm <% coalesce(cu.primary_phone,''))
    AND (p_from IS NULL AND p_to IS NULL OR CASE p_date_role
          WHEN 'modified' THEN cu.updated_at ELSE cu.created_at END
         BETWEEN coalesce(p_from,'-infinity') AND coalesce(p_to,'infinity'))

  UNION ALL
  -- ── contacts ─────────────────────────────────────────────────────────────────────────────────
  SELECT 'contacts', ct.id::text,
    coalesce(nullif(ct.name,''), ct.company, 'Contact'),
    left(concat_ws(' · ', nullif(ct.company,''), nullif(ct.title,''), nullif(ct.email,''), nullif(ct.phone,''), nullif(ct.notes,'')), 300),
    NULL, ct.created_at, ct.updated_at,
    (word_similarity(q.norm, coalesce(ct.name,'') || ' ' || coalesce(ct.company,'')) * 3
     + word_similarity(q.norm, concat_ws(' ', ct.email, ct.phone, ct.title, ct.city)) * 1
     + CASE WHEN lower(coalesce(ct.name,'')) = q.norm THEN 5 ELSE 0 END)::real,
    NULL
  FROM contacts ct, q
  WHERE 'contacts' IN (SELECT id FROM allowed)
    AND (p_roles && ARRAY['admin','developer','tech_support'])
    AND (ct.org_id IS NULL OR p_org IS NULL OR ct.org_id = p_org)
    AND (q.norm <% coalesce(ct.name,'') OR q.norm <% coalesce(ct.company,'')
      OR q.norm <% coalesce(ct.email,'') OR q.norm <% coalesce(ct.phone,''))
    AND (p_from IS NULL AND p_to IS NULL OR CASE p_date_role
          WHEN 'modified' THEN ct.updated_at ELSE ct.created_at END
         BETWEEN coalesce(p_from,'-infinity') AND coalesce(p_to,'infinity'))

  UNION ALL
  -- ── leads ────────────────────────────────────────────────────────────────────────────────────
  SELECT 'leads', l.id::text,
    coalesce(nullif(l.name,''), l.company, 'Lead'),
    left(concat_ws(' · ', nullif(l.property_address,''), nullif(l.email,''), nullif(l.phone,''), nullif(l.notes,'')), 300),
    l.status, l.created_at, l.updated_at,
    (word_similarity(q.norm, coalesce(l.name,'') || ' ' || coalesce(l.company,'')) * 3
     + word_similarity(q.norm, concat_ws(' ', l.property_address, l.email, l.phone, l.city)) * 1
     + CASE WHEN lower(coalesce(l.name,'')) = q.norm THEN 5 ELSE 0 END)::real,
    l.converted_job_id::text
  FROM leads l, q
  WHERE 'leads' IN (SELECT id FROM allowed)
    AND (p_roles && ARRAY['admin','developer','tech_support'])
    AND (l.org_id IS NULL OR p_org IS NULL OR l.org_id = p_org)
    AND (p_types IS NULL OR l.status = ANY(p_types))
    AND (q.norm <% coalesce(l.name,'') OR q.norm <% coalesce(l.company,'')
      OR q.norm <% coalesce(l.property_address,'') OR q.norm <% coalesce(l.email,''))
    AND (p_from IS NULL AND p_to IS NULL OR CASE p_date_role
          WHEN 'modified' THEN l.updated_at ELSE l.created_at END
         BETWEEN coalesce(p_from,'-infinity') AND coalesce(p_to,'infinity'))

  UNION ALL
  -- ── customer_invoices ────────────────────────────────────────────────────────────────────────
  SELECT 'invoices', i.id::text,
    coalesce(nullif(i.invoice_number,''), 'Invoice') || ' — ' || coalesce(i.customer_name,''),
    -- `billing_address` is JSONB. `nullif(jsonb, '')` coerces the empty string to json and fails with
    -- "invalid input syntax for type json" — '' is not valid JSON. Cast to text first, and search the
    -- rendered object, which is what somebody typing a street name is looking for anyway.
    left(concat_ws(' · ', nullif(i.customer_email,''), nullif(i.billing_address::text,''), nullif(i.notes,'')), 300),
    i.status, i.created_at, i.issued_at,
    (word_similarity(q.norm, coalesce(i.invoice_number,'') || ' ' || coalesce(i.customer_name,'')) * 3
     + word_similarity(q.norm, concat_ws(' ', i.customer_email, i.billing_address::text)) * 1
     + CASE WHEN lower(coalesce(i.invoice_number,'')) = q.norm THEN 5 ELSE 0 END)::real,
    i.job_id::text
  FROM customer_invoices i, q
  WHERE 'invoices' IN (SELECT id FROM allowed)
    AND (p_roles && ARRAY['admin','developer','tech_support'])
    AND (i.org_id IS NULL OR p_org IS NULL OR i.org_id = p_org)
    AND (p_types IS NULL OR i.status = ANY(p_types))
    AND (q.norm <% coalesce(i.invoice_number,'') OR q.norm <% coalesce(i.customer_name,'')
      OR q.norm <% coalesce(i.customer_email,''))
    AND (p_from IS NULL AND p_to IS NULL OR CASE p_date_role
          WHEN 'effective' THEN i.issued_at
          WHEN 'modified'  THEN i.updated_at ELSE i.created_at END
         BETWEEN coalesce(p_from,'-infinity') AND coalesce(p_to,'infinity'))
)
SELECT corpus, row_id, title, snippet, doc_type, created_at, effective_at, score, context_id
FROM hits
-- Recency TILTS rather than sorts: a 1974 deed is often exactly what was wanted, so it must never be
-- buried, but between two equal matches the recent one is nearly always the target. Bounded at 0.75
-- so age can never overturn a materially better match.
ORDER BY score * (CASE
    WHEN created_at IS NULL THEN 1.0
    WHEN now() - created_at < interval '30 days' THEN 1.0
    WHEN now() - created_at > interval '5 years' THEN 0.75
    ELSE 1.0 - 0.25 * (EXTRACT(epoch FROM now() - created_at) - 2592000) / (157680000 - 2592000)
  END) DESC,
  created_at DESC NULLS LAST
LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$$;

COMMENT ON FUNCTION search_everything IS
  'Unified search across documents and business records (platform audit §3b). Pins pg_trgm.word_similarity_threshold to 0.4 because the pooler makes session- and database-level settings silently ineffective — see seed 514.';

-- The service role calls this from the API route; `authenticated` is granted so a future RLS-scoped
-- path can use it without a second function.
GRANT EXECUTE ON FUNCTION search_everything(text, text[], text[], text[], text, timestamptz, timestamptz, uuid, int)
  TO service_role, authenticated;
