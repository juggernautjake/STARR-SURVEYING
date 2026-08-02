// lib/research/ocr-quality.ts — one definition of "readable", shared with the worker (plan R18).
//
// The assessment itself lives in `worker/src/infra/ocr-quality.ts` and is re-exported here. Two
// copies is how the rule ends up enforced on one extraction path and not the other — which is
// exactly what had already happened to a neighbouring constant: the app's PDF path required 500
// characters before it accepted an OCR result, the worker's required 800, and a comment at the app's
// call site explained the difference rather than removing it.
//
// The app imports through this module so every existing import keeps working, and so there is a
// single place to look when somebody asks "what counts as unreadable?".

export {
  MIN_CHARS_PER_PAGE,
  PARTIAL_CHARS_PER_PAGE,
  MIN_CONFIDENCE,
  assessOcr,
  isLandRecordType,
  legibleRatio,
  normaliseConfidence,
  statusFor,
  type AssessInput,
  type OcrAssessment,
  type Readability,
} from '@/worker/src/infra/ocr-quality';
