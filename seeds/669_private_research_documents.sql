-- seeds/669_private_research_documents.sql — research files stop being public web pages.
--
-- Until 2026-10-06 the `research-documents` bucket (9,915 files: deeds, plats, captures) was
-- PUBLIC — every file at a permanent URL anybody could open, no sign-in — and that URL was stored on
-- the row. This makes the bucket private and points every stored link at the app's own route,
-- `/api/admin/research/file/<key>`, which checks the session and redirects to a short-lived signed
-- URL (app/api/admin/research/file/[...path]/route.ts).
--
-- ORDER MATTERS: apply only after the code that serves that route is deployed, or links will point
-- at a route that does not exist yet.
--
-- The trigger keeps it true going forward: every writer (the app, the worker, a script) still builds
-- a public-form URL with `getPublicUrl`, and the row is rewritten on the way in — so no writer has to
-- remember, and a worker that has not been redeployed cannot reintroduce a dead public link.
--
-- Idempotent: the rewrite only touches the public form; the trigger is replaced by name.

BEGIN;

CREATE OR REPLACE FUNCTION public.research_public_url_to_route(s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    s,
    'https?://[^/"\s]+/storage/v1/object/public/research-documents/',
    '/api/admin/research/file/',
    'g'
  )
$$;

CREATE OR REPLACE FUNCTION public.research_documents_private_links() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.storage_url IS NOT NULL THEN
    NEW.storage_url := public.research_public_url_to_route(NEW.storage_url);
  END IF;
  IF NEW.pages_pdf_url IS NOT NULL THEN
    NEW.pages_pdf_url := public.research_public_url_to_route(NEW.pages_pdf_url);
  END IF;
  IF NEW.ocr_regions IS NOT NULL AND NEW.ocr_regions::text LIKE '%/object/public/research-documents/%' THEN
    NEW.ocr_regions := public.research_public_url_to_route(NEW.ocr_regions::text)::jsonb;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_research_documents_private_links ON public.research_documents;
CREATE TRIGGER trg_research_documents_private_links
  BEFORE INSERT OR UPDATE OF storage_url, pages_pdf_url, ocr_regions ON public.research_documents
  FOR EACH ROW EXECUTE FUNCTION public.research_documents_private_links();

-- Existing rows. The trigger above does the rewrite; this just touches the rows that need it.
UPDATE public.research_documents
SET storage_url = storage_url, pages_pdf_url = pages_pdf_url, ocr_regions = ocr_regions
WHERE storage_url LIKE '%/object/public/research-documents/%'
   OR pages_pdf_url LIKE '%/object/public/research-documents/%'
   OR ocr_regions::text LIKE '%/object/public/research-documents/%';

UPDATE storage.buckets SET public = false WHERE id = 'research-documents';

COMMIT;
