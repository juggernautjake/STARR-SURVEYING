-- seeds/516_document_embeddings.sql
--
-- Semantic retrieval over BUSINESS documents (platform audit §3b, item 8d).
--
-- Owner objective: *"using AI to help find specific documents or information"* — the questions
-- keywords cannot express. *"The deed that mentions a 40-foot access easement on the north line"*
-- shares almost no distinctive words with the document that answers it; trigram and full-text both
-- fail on it, and they fail silently, returning an empty list that reads as an empty archive.
--
-- ── DELIBERATELY THE SAME SHAPE AS seeds/403 ────────────────────────────────────────────────────
--
-- `fs_reference_chunks` already does this for the learning corpus and has been in production for
-- months: `vector(1024)`, Voyage `voyage-3.5`, exact cosine, a `match_*` RPC. Inventing a second
-- pattern would mean two chunkers, two dimensions, two failure modes, and a coin-flip about which one
-- a future reader is looking at. Same dimension, same provider, same query shape.
--
-- ── WHY A SEPARATE TABLE RATHER THAN A COLUMN ON research_documents ─────────────────────────────
--
-- A deed's `extracted_text` is tens of thousands of characters. One vector for a whole document
-- averages every clause in it into a single point and retrieves nothing precisely — the easement
-- paragraph disappears into the metes-and-bounds. Chunking is what makes the answer findable, and a
-- chunk table is the only place chunks can live.
--
-- It is also corpus-agnostic on purpose: `source_table` + `source_id` rather than a foreign key to
-- `research_documents`. Job files, field-media transcriptions and future deliverables all become
-- searchable by inserting rows, with no schema change and no second RPC.
--
-- No BEGIN/COMMIT — a seed's own transaction control commits verify-baseline-schema's wrapping
-- transaction and leaks its scratch schema into production. Fixed once (2026-08-01); not re-created.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_embeddings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which corpus this came from. Matches the ids in lib/search/corpora.ts, so a chunk can always be
  -- traced back to a row somebody can open.
  source_table  text NOT NULL,
  source_id     uuid NOT NULL,
  ordinal       integer NOT NULL DEFAULT 0,
  content       text NOT NULL,
  embedding     vector(1024),
  -- The text this chunk was built from, hashed. Re-embedding 654 documents costs money and time; if
  -- the source text has not changed there is nothing to redo, and without this the backfill has no
  -- way to know that other than re-embedding everything to find out.
  content_hash  text NOT NULL,
  org_id        uuid REFERENCES organizations(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY; -- service role (app code) bypasses.

CREATE INDEX IF NOT EXISTS idx_document_embeddings_source
  ON document_embeddings (source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_org
  ON document_embeddings (org_id);
-- One chunk per (row, ordinal). Makes the backfill an UPSERT rather than a delete-then-insert, so a
-- crash halfway through leaves the old chunks in place instead of a half-emptied index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_embeddings_unique
  ON document_embeddings (source_table, source_id, ordinal);

-- Exact cosine, like seeds/403. At a few thousand chunks this is comfortably fast, and an approximate
-- index (hnsw/ivfflat) trades recall for speed — the wrong trade while the corpus is small, and a
-- one-line addition when it is not.
CREATE OR REPLACE FUNCTION match_document_embeddings(
  query_embedding vector(1024),
  p_sources       text[]  DEFAULT NULL,
  match_count     int     DEFAULT 12,
  min_similarity  float   DEFAULT 0.35,
  p_org           uuid    DEFAULT NULL
)
RETURNS TABLE (
  source_table text,
  source_id    uuid,
  ordinal      int,
  content      text,
  similarity   float
)
LANGUAGE sql STABLE AS $$
  SELECT e.source_table, e.source_id, e.ordinal, e.content,
         1 - (e.embedding <=> query_embedding) AS similarity
  FROM document_embeddings e
  WHERE e.embedding IS NOT NULL
    AND (p_sources IS NULL OR e.source_table = ANY(p_sources))
    AND (e.org_id IS NULL OR p_org IS NULL OR e.org_id = p_org)
    AND 1 - (e.embedding <=> query_embedding) >= min_similarity
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_document_embeddings IS
  'Semantic retrieval over business documents (platform audit §3b/8d). Corpus-agnostic: source_table matches the ids in lib/search/corpora.ts. Permission filtering happens in the CALLER, which knows the requesting roles — this function does not gate.';

GRANT EXECUTE ON FUNCTION match_document_embeddings(vector, text[], int, float, uuid)
  TO service_role, authenticated;
