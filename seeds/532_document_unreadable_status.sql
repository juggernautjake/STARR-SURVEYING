-- 532_document_unreadable_status.sql — an unreadable page is not an error (plan R18).
--
-- `processDocument()` set `processing_status: 'extracted'` unconditionally, so a scanned 1940s deed
-- that OCR'd to noise became a document with a little garbage text, no facts, and no explanation.
-- The packet then reported the property as having no easements, rather than as having a deed nobody
-- could read. That is the quiet failure this state exists to make loud.
--
-- WHY NOT REUSE 'error':
--   `error` is the retry bucket — a transient API failure, a timeout, a bad download. An unreadable
--   scan will fail identically on every retry, forever, because nothing about it is transient. It
--   needs a better scan or a person's eyes, which is a different queue and a different action.

ALTER TABLE research_documents DROP CONSTRAINT IF EXISTS research_documents_processing_status_check;

ALTER TABLE research_documents
  ADD CONSTRAINT research_documents_processing_status_check
  CHECK (processing_status IN (
    'pending', 'extracting', 'extracted', 'analyzing', 'analyzed', 'error', 'unreadable'
  ));

-- Why it was judged unreadable, so a reviewer is not left to guess and a wrong verdict can be
-- diagnosed without re-running the OCR.
ALTER TABLE research_documents ADD COLUMN IF NOT EXISTS readability          TEXT;
ALTER TABLE research_documents ADD COLUMN IF NOT EXISTS readability_reason   TEXT;
ALTER TABLE research_documents ADD COLUMN IF NOT EXISTS readability_signals  JSONB NOT NULL DEFAULT '[]';

ALTER TABLE research_documents DROP CONSTRAINT IF EXISTS research_documents_readability_check;
ALTER TABLE research_documents
  ADD CONSTRAINT research_documents_readability_check
  CHECK (readability IS NULL OR readability IN ('good', 'partial', 'unreadable'));

-- Finding the documents a person has to look at is the whole point, so it gets an index rather than
-- a full scan of every document in every project.
CREATE INDEX IF NOT EXISTS idx_research_documents_unreadable
  ON research_documents (research_project_id)
  WHERE processing_status = 'unreadable';
