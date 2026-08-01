-- seeds/514_search_indexes.sql
--
-- Unified document + record search (platform audit §3b, owner objective 2026-08-01).
--
-- ── WHAT WAS MISSING ─────────────────────────────────────────────────────────────────────────────
--
-- Full-text search and pgvector both already exist in this database — and both are pointed entirely
-- at the LEARNING corpus (kb_articles, fs_reference_chunks, lessons, flashcards). Not one business
-- document or record had either. And `pg_trgm` was not installed at all, so nothing anywhere
-- tolerated a misspelling.
--
-- ── WHY BOTH TRIGRAM AND FULL-TEXT ───────────────────────────────────────────────────────────────
--
-- They fail in opposite directions, and surveying data needs both at once:
--
--   · Trigram survives a typo ("Waggner" → "Waggoner") but is blind to word order and useless on a
--     40-page deed body, which is similar to nothing.
--   · Full-text handles long text and stemming, but one wrong letter means the lexeme does not exist,
--     so the match is not weaker — it is absent.
--
-- The data is dense with proper nouns nobody spells right (Waggoner, Killeen, Nolanville, abstract
-- and surveyor names) sitting inside long OCR'd legal text. Either mechanism alone leaves a whole
-- class of searches returning nothing.
--
-- ── EVERY INDEX HERE IS `IF NOT EXISTS` ──────────────────────────────────────────────────────────
--
-- The lesson from seeds 450 and 468: a seed that has never been run twice has never been tested, and
-- a seed that breaks on re-run breaks the ONE path that rebuilds this database from the repo.
--
-- Note: no BEGIN/COMMIT in this file. `CREATE INDEX CONCURRENTLY` cannot run inside a transaction,
-- and scripts/verify-baseline-schema.mjs wraps seeds in one of its own — a seed's own COMMIT would
-- commit the verifier's transaction and leak its scratch schema into production (fixed 2026-08-01,
-- and worth not re-creating).

-- ── The extension ────────────────────────────────────────────────────────────────────────────────
-- Supabase puts extensions in their own schema; `public` is on the search_path for the app role.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── `word_similarity`, not `similarity`, and the threshold is MEASURED ───────────────────────────
--
-- `similarity()` compares two whole strings, so it is length-sensitive: a short query against a long
-- field scores low no matter how exact the match. Measured on this database's own rows:
--
--     "Waggoner"  vs  "3424 Waggoner Dr, Belton, TX"   similarity = 0.33   word_similarity = 1.00
--
-- A perfect match, sitting at 0.33 — barely above the 0.3 default, and it would have been missed
-- entirely inside a slightly longer label. `word_similarity()` compares the query against the best
-- matching WORD SEQUENCE inside the field, which is what somebody typing a street name into a search
-- box actually means.
--
-- The threshold then has to come down, because the default of 0.6 rejects nearly every real typo.
-- Measured, again on this data:
--
--     esment    → Easement: 2022039607           0.429
--     Belon     → …Belton, TX                    0.500
--     Waggner   → …Waggoner Dr…                  0.545
--     easment   → Easement: 2022039607           0.545
--     Killen    → Killeen, TX                    0.714
--     Nolanvile → The Reserve at Nolanville      0.800
--
-- Single-letter slips cluster at 0.43–0.55. At the 0.6 default, "matching spellings" would have
-- shipped matching nothing — the feature would look built and behave as though it were not. 0.4
-- catches all of the above; lower starts admitting unrelated words that happen to share trigrams.
--
-- ── AND THE THRESHOLD CANNOT BE SET ON THE SESSION OR THE DATABASE ──────────────────────────────
--
-- The obvious `ALTER DATABASE … SET pg_trgm.word_similarity_threshold = 0.4` was tried first, and it
-- is a trap. It APPLIES — `pg_db_role_setting` shows the value — and then a fresh connection still
-- reports 0.6, because this app reaches Postgres through the Supabase **pooler**, which hands back an
-- already-established backend that never re-read the database defaults. `SET LOCAL` fails the same
-- way for the same reason: the next statement may land on a different backend.
--
-- Silent, and exactly the wrong shape of bug: the setting looks applied, the seed reports success,
-- and typo tolerance quietly does not work in production while working in psql.
--
-- So the threshold is pinned to the FUNCTION instead — see `search_everything` in seed 515, declared
-- with `SET pg_trgm.word_similarity_threshold = 0.4`. A per-function setting is applied by Postgres
-- on entry to every call, on whatever backend the pooler chose, and cannot drift.
--
-- The ALTER DATABASE is still issued below as a convenience for psql sessions and scripts — it is a
-- nicety, and nothing depends on it.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET pg_trgm.word_similarity_threshold = 0.4', current_database());
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not set the database-level word_similarity_threshold (insufficient privilege). Harmless — search_everything() pins its own.';
END $$;

-- ── Trigram indexes: spelling-tolerant matching on the columns people type into ──────────────────
--
-- GIN over gist here: these columns are read far more than written, and GIN answers similarity
-- queries faster at the cost of slower updates — the right trade for an archive.

-- Research documents — the largest real corpus (654 rows), and the one holding deeds and plats.
CREATE INDEX IF NOT EXISTS idx_research_documents_label_trgm
  ON research_documents USING gin (coalesce(document_label, '') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_research_documents_filename_trgm
  ON research_documents USING gin (coalesce(original_filename, '') gin_trgm_ops);
-- `recorded_date` is the date a title chain is searched by, and differs from `created_at` by decades.
CREATE INDEX IF NOT EXISTS idx_research_documents_recorded ON research_documents (recorded_date);
CREATE INDEX IF NOT EXISTS idx_research_documents_type     ON research_documents (document_type);

-- Job files.
CREATE INDEX IF NOT EXISTS idx_job_files_name_trgm
  ON job_files USING gin (coalesce(file_name, '') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_job_files_created ON job_files (created_at);

-- Field media — `transcription` is often the only written record of what happened on site.
CREATE INDEX IF NOT EXISTS idx_field_media_transcription_trgm
  ON field_media USING gin (coalesce(transcription, '') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_field_media_captured ON field_media (captured_at);

-- Records. People search for a job by address or subdivision far more than by job number.
CREATE INDEX IF NOT EXISTS idx_jobs_name_trgm
  ON jobs USING gin (coalesce(name, '') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_address_trgm
  ON jobs USING gin (coalesce(address, '') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_client_trgm
  ON jobs USING gin (coalesce(client_name, '') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_subdivision_trgm
  ON jobs USING gin (coalesce(subdivision, '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin (coalesce(display_name, '') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_company_trgm
  ON customers USING gin (coalesce(company, '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm
  ON contacts USING gin (coalesce(name, '') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_company_trgm
  ON contacts USING gin (coalesce(company, '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_name_trgm
  ON leads USING gin (coalesce(name, '') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_address_trgm
  ON leads USING gin (coalesce(property_address, '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customer_invoices_number_trgm
  ON customer_invoices USING gin (coalesce(invoice_number, '') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_customer_trgm
  ON customer_invoices USING gin (coalesce(customer_name, '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_file_nodes_name_trgm
  ON file_nodes USING gin (coalesce(name, '') gin_trgm_ops);

-- ── Full-text: the long bodies, where trigram is helpless ────────────────────────────────────────
--
-- Expression indexes rather than stored `tsvector` columns. A stored column needs a trigger to stay
-- current, and a stale search index is a search that confidently returns yesterday's answer. The
-- expression is recomputed by Postgres on write, so it cannot drift.
--
-- `english` config: these are English legal documents, and stemming "easements" → "easement" is most
-- of the value. `simple` would make plurals miss.

CREATE INDEX IF NOT EXISTS idx_research_documents_fts
  ON research_documents USING gin (
    to_tsvector('english',
      coalesce(document_label, '') || ' ' ||
      coalesce(original_filename, '') || ' ' ||
      coalesce(extracted_text, '') || ' ' ||
      coalesce(recording_info, '')
    )
  );

CREATE INDEX IF NOT EXISTS idx_jobs_fts
  ON jobs USING gin (
    to_tsvector('english',
      coalesce(job_number, '') || ' ' ||
      coalesce(name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(address, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(county, '') || ' ' ||
      coalesce(subdivision, '') || ' ' ||
      coalesce(client_name, '') || ' ' ||
      coalesce(notes, '')
    )
  );

CREATE INDEX IF NOT EXISTS idx_field_media_fts
  ON field_media USING gin (
    to_tsvector('english', coalesce(transcription, '') || ' ' || coalesce(point_name, ''))
  );
