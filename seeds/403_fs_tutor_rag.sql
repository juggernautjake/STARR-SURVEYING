-- seeds/403_fs_tutor_rag.sql — grounded FS tutor: a trusted reference library the AI
-- retrieves from before answering (RAG), with semantic (pgvector) search.
--
-- The tutor (app/api/admin/learn/ai-tutor) embeds the student's question, finds the most
-- relevant passages from the admin-uploaded reference documents, and answers FROM those
-- (citing them); only when the library doesn't cover it does it fall back to web search.
-- Idempotent.

-- pgvector powers the semantic search. Available on Supabase; no-op if already installed.
CREATE EXTENSION IF NOT EXISTS vector;

-- One row per uploaded reference document (a textbook PDF, the FS handbook, notes, a scan…).
CREATE TABLE IF NOT EXISTS fs_reference_docs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  source            text,                 -- author / citation shown with retrieved passages
  kind              text NOT NULL DEFAULT 'pdf',   -- pdf | docx | text | image
  original_filename text,
  storage_path      text,                 -- key in the learn-references bucket
  storage_url       text,
  status            text NOT NULL DEFAULT 'processing', -- processing | ready | failed
  error             text,
  char_count        integer NOT NULL DEFAULT 0,
  chunk_count       integer NOT NULL DEFAULT 0,
  notes             text,                 -- optional admin description
  added_by          text,                 -- admin email
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fs_reference_docs ENABLE ROW LEVEL SECURITY; -- service role (app code) bypasses.

-- Each document split into retrievable passages, one embedding per chunk. The embedding
-- dimension (1024) matches Voyage AI's voyage-3.5 / voyage-3-large default output.
CREATE TABLE IF NOT EXISTS fs_reference_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id       uuid NOT NULL REFERENCES fs_reference_docs(id) ON DELETE CASCADE,
  ordinal      integer NOT NULL DEFAULT 0,
  content      text NOT NULL,
  token_estimate integer NOT NULL DEFAULT 0,
  embedding    vector(1024),
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fs_reference_chunks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fs_ref_chunks_doc ON fs_reference_chunks (doc_id);

-- Exact cosine search — plenty fast for a curated library (a few thousand chunks). An
-- approximate index (hnsw/ivfflat) can be added later if the corpus grows large.
CREATE OR REPLACE FUNCTION match_fs_reference_chunks(
  query_embedding vector(1024),
  match_count int DEFAULT 8,
  min_similarity float DEFAULT 0.35
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
  SELECT c.id, c.doc_id, c.content, c.ordinal,
         1 - (c.embedding <=> query_embedding) AS similarity,
         d.title AS doc_title, d.source AS doc_source
  FROM fs_reference_chunks c
  JOIN fs_reference_docs d ON d.id = c.doc_id
  WHERE d.status = 'ready'
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
