-- seeds/404_fs_tutor_fts.sql — full-text-search retrieval for the grounded FS tutor.
--
-- The base RAG schema (seeds/403) retrieves passages by SEMANTIC similarity, which needs a
-- VOYAGE_API_KEY to embed both the documents and the question. This layer adds a keyword
-- (Postgres full-text) path that needs NO external key, so the tutor is grounded in the
-- uploaded library from day one. Retrieval prefers embeddings when configured and falls
-- back to this FTS function otherwise (see lib/learn/tutor-retrieval.ts), so adding a Voyage
-- key later is a pure upgrade — no data migration required.
-- Idempotent.

-- A generated tsvector over the passage text. 'english' config gives stemming + stop-word
-- removal, which suits the technical prose in surveying references well.
ALTER TABLE fs_reference_chunks
  ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_fs_ref_chunks_tsv
  ON fs_reference_chunks USING gin (tsv);

-- Keyword search over ready documents, ranked with ts_rank_cd (cover density — rewards
-- passages where more query terms appear, closer together). Returns the same shape as
-- match_fs_reference_chunks so the retrieval layer can treat the two interchangeably —
-- `similarity` here is the text rank (small positive float), not a cosine distance.
--
-- Query building: websearch_to_tsquery gives stemming + stop-word removal, but ANDs every
-- term — so a natural-language question ("how many inches in a Texas vara") would only match a
-- passage that ALSO contains "many". Students ask in prose, so we relax the AND to OR by
-- swapping '&' for '|' in the parsed query; ts_rank_cd then floats the passages that cover the
-- most terms to the top. NULLIF guards the all-stop-word case (query parses to empty).
CREATE OR REPLACE FUNCTION search_fs_reference_chunks_fts(
  query_text text,
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  doc_id uuid,
  content text,
  ordinal int,
  similarity float,
  doc_title text,
  doc_source text
)
LANGUAGE sql STABLE AS $$
  WITH q AS (
    SELECT NULLIF(replace(websearch_to_tsquery('english', query_text)::text, '&', '|'), '')::tsquery AS tsq
  )
  SELECT c.id, c.doc_id, c.content, c.ordinal,
         ts_rank_cd(c.tsv, q.tsq)::float AS similarity,
         d.title AS doc_title, d.source AS doc_source
  FROM fs_reference_chunks c
  JOIN fs_reference_docs d ON d.id = c.doc_id
  CROSS JOIN q
  WHERE d.status = 'ready'
    AND q.tsq IS NOT NULL
    AND q.tsq @@ c.tsv
  ORDER BY ts_rank_cd(c.tsv, q.tsq) DESC
  LIMIT match_count;
$$;
