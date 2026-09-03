-- seeds/627_ocr_confidence_one_scale.sql — `ocr_confidence` held two scales at once.
--
-- ── MEASURED, NOT INFERRED ──────────────────────────────────────────────────────────────────────
--
-- Three writers put values in this column and they do not agree on what the numbers mean:
--
--   lib/research/analysis.service.ts            0–100   prompts.ts asks the model for
--   lib/research/document.service.ts            0–100   `"overall_confidence": 0-100`
--   worker/.../file-generic-document.ts         0–1     ai-extraction.ts's prompt says
--                                                       "Set confidence per-call (0.0-1.0)"
--
-- And two components read it, each assuming a different one:
--
--   SourceDocumentViewer.tsx   `{doc.ocr_confidence}%`        → a worker row renders "0.92%"
--   ReviewDocCard.tsx          `Math.round(x * 100)}%`        → an app row renders "9000%"
--
-- So one document could be 92% confident on one screen and 0.92% on another, and nothing on either
-- screen told the reviewer which number was the lie. Both readers now go through
-- `lib/research/confidence-scale.ts`, both app writers normalise on the way in, and the worker's
-- writer calls the `normaliseConfidence` that had been sitting in `infra/ocr-quality.ts` with a doc
-- comment explaining exactly this hazard and no callers outside its own module.
--
-- This seed brings the rows already stored onto the same scale as the code that now writes them.

-- ── The conversion, and why it is unambiguous ──────────────────────────────────────────────────
--
-- Anything strictly greater than 1 can only have come from the 0–100 writers: a 0–1 confidence
-- cannot exceed 1. Anything at or below 1 is already a fraction and is left alone.
--
-- The one genuinely ambiguous value is exactly 1. It is 100% on one scale and 1% on the other, and
-- it is READ AS 100% — the same tie-break the code makes, for the same reason: a provider emitting
-- 0–100 that lands on 1 is describing an extraction so total a failure that every other measure in
-- `assessOcr` already condemns it, while a 0–1 provider reaching 1.0 is ordinary. Rows at exactly 1
-- are therefore untouched, which is that reading.
--
-- Clamped at 1 because a provider that returns 105 has a bug and 1.05 is not a confidence.
UPDATE research_documents
   SET ocr_confidence = LEAST(ocr_confidence / 100.0, 1.0),
       updated_at     = now()
 WHERE ocr_confidence IS NOT NULL
   AND ocr_confidence > 1;

COMMENT ON COLUMN research_documents.ocr_confidence IS
  'Extraction confidence as a FRACTION, 0–1. Written by the app (lib/research/document.service.ts, '
  'analysis.service.ts) and by the worker (research/file-generic-document.ts); both normalise via '
  'toConfidenceFraction / normaliseConfidence. Held both 0–1 and 0–100 until seed 627, which is why '
  'the same document could read 92% on one screen and 0.92% on another.';

-- ── A row that cannot be a confidence ──────────────────────────────────────────────────────────
--
-- Deliberately NOT VALID: it enforces the rule on everything written from here on without failing
-- the migration on some historical row nobody has looked at. Validating it later is a one-line
-- follow-up once the existing rows have been reviewed.
ALTER TABLE research_documents DROP CONSTRAINT IF EXISTS research_documents_ocr_confidence_fraction;
ALTER TABLE research_documents ADD CONSTRAINT research_documents_ocr_confidence_fraction
  CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1)) NOT VALID;
