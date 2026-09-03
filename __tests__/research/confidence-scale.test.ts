import { describe, it, expect } from 'vitest';
import { toConfidenceFraction, confidencePercentLabel } from '@/lib/research/confidence-scale';
import { readCode, readSource } from '../helpers/read-source';

// ── TWO SCALES IN ONE COLUMN, AND TWO VIEWERS EACH ASSUMING A DIFFERENT ONE ─────────────────────
//
// `research_documents.ocr_confidence` was written on 0–100 by the app (prompts.ts asks the model
// for `"overall_confidence": 0-100`) and on 0–1 by the worker (ai-extraction.ts's prompt says "Set
// confidence per-call (0.0-1.0)"). SourceDocumentViewer appended "%" to the raw value; ReviewDocCard
// multiplied by 100 first. So the same document read as "92%" on one screen and "0.92%" on another,
// and neither screen said which number was the lie.

describe('one scale, whichever scale it arrived on', () => {
  it('a fraction passes through untouched', () => {
    expect(toConfidenceFraction(0.92)).toBeCloseTo(0.92);
    expect(toConfidenceFraction(0)).toBe(0);
  });

  it('a percentage is divided down', () => {
    expect(toConfidenceFraction(92)).toBeCloseTo(0.92);
    expect(toConfidenceFraction(90)).toBeCloseTo(0.9);
  });

  it('THE TIE: exactly 1 is read as 100%, and that choice is stated', () => {
    // 1 is 100% on one scale and 1% on the other. Read as 100%, matching the worker's own rule —
    // a 0–100 provider landing on 1 describes an extraction every other measure in assessOcr
    // already condemns, while a 0–1 provider hitting 1.0 is ordinary.
    expect(toConfidenceFraction(1)).toBe(1);
    expect(confidencePercentLabel(1)).toBe('100%');
    expect(readSource('lib/research/confidence-scale.ts')).toContain('THE AMBIGUITY THAT CANNOT BE RESOLVED');
  });

  it('a provider with a bug is clamped, not believed', () => {
    expect(toConfidenceFraction(105)).toBe(1);
  });

  it('absent stays absent — "we never measured" is not "0%"', () => {
    // Rendering 0% for a document nobody scored reads as "we checked and it is terrible".
    expect(toConfidenceFraction(null)).toBeNull();
    expect(toConfidenceFraction(undefined)).toBeNull();
    expect(toConfidenceFraction(Number.NaN)).toBeNull();
    expect(toConfidenceFraction(-1)).toBeNull();
    expect(confidencePercentLabel(null)).toBeNull();
  });

  it('the label is what a person reads', () => {
    expect(confidencePercentLabel(0.92)).toBe('92%');
    expect(confidencePercentLabel(92)).toBe('92%');
  });

  it('THE DEFECT, both directions, would now render the same', () => {
    // An app-written row (0–100) and a worker-written row (0–1) describing the same 92% document.
    expect(confidencePercentLabel(92)).toBe(confidencePercentLabel(0.92));
  });
});

describe('the callers, not the helper', () => {
  it('neither viewer does its own arithmetic any more', () => {
    const viewer = readCode('app/admin/research/components/SourceDocumentViewer.tsx');
    expect(viewer).toContain('confidencePercentLabel(doc.ocr_confidence)');
    expect(viewer).not.toContain('{doc.ocr_confidence}%');

    const card = readCode('app/admin/research/[projectId]/ReviewDocCard.tsx');
    expect(card).toContain('confidencePercentLabel(doc.ocr_confidence)');
    expect(card).not.toContain('Math.round(doc.ocr_confidence * 100)');
  });

  it('both app writers normalise on the way in', () => {
    expect(readCode('lib/research/analysis.service.ts')).toContain('toConfidenceFraction(');
    expect(readCode('lib/research/document.service.ts')).toContain('ocr_confidence: toConfidenceFraction(');
  });

  it('the worker writer finally calls the function written for this', () => {
    // `normaliseConfidence` has carried a doc comment describing this exact hazard since it was
    // written, and had no callers outside its own module.
    expect(readCode('worker/src/research/file-generic-document.ts'))
      .toContain('ocr_confidence: normaliseConfidence(');
  });

  it('the boundary readout normalises instead of trusting an undeclared scale', () => {
    // `confidence: number` on ExtractedBoundaryData declares no scale and has more than one
    // producer. Multiplying by 100 there is a guess whose failure mode is "6800%" shown to a
    // surveyor as high confidence.
    const panel = readCode('app/admin/research/components/PipelineProgressPanel.tsx');
    expect(panel).toContain('confidencePercentLabel(result.boundary?.confidence)');
    expect(panel).not.toContain('Math.round(confidence * 100)');
  });

  it('the seed brings the stored rows onto the same scale', () => {
    const seed = readSource('seeds/627_ocr_confidence_one_scale.sql');
    expect(seed).toContain('ocr_confidence / 100.0');
    // Only rows that cannot be fractions are touched.
    expect(seed).toContain('AND ocr_confidence > 1');
  });
});
