// "The AI said" vs "here is the deed, at this line" (research plan R17).
//
// Every extracted fact rendered identically in the review UI. The collapsed row showed one number —
// `extraction_confidence` — which is the model's opinion of its own output, not evidence. So a fact
// the model asserted with nothing behind it, at 95% confidence, outranked a fact quoted verbatim
// from a deed at 70%. And "View in source document" was offered on EVERY row, including rows with no
// excerpt to find and no region to scroll to, where the button opens a document and lands nowhere.
//
// `extracted_data_points.source_bounding_box` has existed since seed 090 and is written as a literal
// `null` at the only place data points are built. The column has never held a value.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  evidenceFor,
  evidenceTotals,
  isNormalisedBox,
  locateExcerpt,
} from '@/lib/research/fact-evidence';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const dp = (over: Record<string, unknown> = {}) => ({
  document_id: 'doc-1',
  source_bounding_box: null,
  source_text_excerpt: null,
  source_page: null,
  source_location: null,
  ...over,
} as Parameters<typeof evidenceFor>[0]);

describe('a bounding box is fractions of the page, never pixels', () => {
  it('accepts a normalised box', () => {
    expect(isNormalisedBox({ x: 0.1, y: 0.2, width: 0.3, height: 0.05 })).toBe(true);
  });

  it('rejects pixel values that leaked in', () => {
    // A box in pixels is correct exactly once — against the one rendering it was measured on — and
    // silently points at the wrong part of the page ever after, because page images are re-rendered
    // at whatever width the viewer is.
    expect(isNormalisedBox({ x: 120, y: 400, width: 300, height: 40 })).toBe(false);
  });

  it('rejects a box that runs off the page or has no area', () => {
    expect(isNormalisedBox({ x: 0.9, y: 0.1, width: 0.5, height: 0.1 })).toBe(false);
    expect(isNormalisedBox({ x: 0.1, y: 0.1, width: 0, height: 0.1 })).toBe(false);
    expect(isNormalisedBox(null)).toBe(false);
  });
});

describe('the five strengths, because each changes what a reviewer can do', () => {
  it('located: page plus region', () => {
    const e = evidenceFor(dp({ source_page: 3, source_bounding_box: { x: 0.1, y: 0.2, width: 0.3, height: 0.05 } }));
    expect(e.strength).toBe('located');
    expect(e.canLocate).toBe(true);
    expect(e.detail).toContain('scrolls to the region');
  });

  it('quoted: a verbatim excerpt the viewer can highlight', () => {
    const e = evidenceFor(dp({ source_page: 3, source_text_excerpt: 'N 45°12\'30" E, 210.5 feet' }));
    expect(e.strength).toBe('quoted');
    expect(e.canLocate).toBe(true);
  });

  it('page: attributed but not quoted', () => {
    const e = evidenceFor(dp({ source_page: 3 }));
    expect(e.strength).toBe('page');
    expect(e.detail).toContain('you will have to find it');
  });

  it('document: we know which document, not where in it', () => {
    expect(evidenceFor(dp()).strength).toBe('document');
  });

  it('asserted: nothing at all, and it says so plainly', () => {
    // Not a bug to hide — some facts legitimately come from cross-referencing. The bug is showing
    // them as though they came from a line on a page.
    const e = evidenceFor(dp({ document_id: '' }));
    expect(e.strength).toBe('asserted');
    expect(e.canLocate).toBe(false);
    expect(e.detail).toContain('came from the model, not from a line on a page');
  });

  it('will not call a pixel box "located"', () => {
    // It would scroll a reviewer to the wrong line and let them believe it.
    const e = evidenceFor(dp({ source_page: 3, source_bounding_box: { x: 120, y: 400, width: 300, height: 40 } }));
    expect(e.strength).not.toBe('located');
  });

  it('ranks evidence independently of confidence', () => {
    // A 95%-confident unevidenced fact must rank below a quoted one.
    const quoted = evidenceFor(dp({ source_text_excerpt: 'called for an iron rod' }));
    const asserted = evidenceFor(dp({ document_id: '' }));
    expect(quoted.rank).toBeLessThan(asserted.rank);
  });

  it('treats a whitespace-only excerpt as no excerpt', () => {
    expect(evidenceFor(dp({ source_text_excerpt: '   ' })).strength).not.toBe('quoted');
  });
});

describe('finding the quote in the page, without a bounding box', () => {
  const page = 'THENCE North 45 degrees 12 minutes\n  30 seconds East, a distance of\n210.5 feet to an iron rod;';

  it('matches across the line breaks OCR puts in', () => {
    // A quote that reads cleanly in the packet rarely matches the page's raw text byte for byte,
    // because OCR breaks lines wherever the scan does.
    const hit = locateExcerpt('45 degrees 12 minutes 30 seconds East', page);
    expect(hit).not.toBeNull();
    expect(page.slice(hit!.start, hit!.end).replace(/\s+/g, ' ')).toBe('45 degrees 12 minutes 30 seconds East');
  });

  it('returns offsets into the REAL text, not the normalised copy', () => {
    const hit = locateExcerpt('210.5 feet', page);
    expect(page.slice(hit!.start, hit!.end)).toBe('210.5 feet');
  });

  it('is case-insensitive', () => {
    expect(locateExcerpt('thence north', page)).not.toBeNull();
  });

  it('refuses a match too short to be unique', () => {
    expect(locateExcerpt('to', page)).toBeNull();
  });

  it('returns null rather than a wrong guess', () => {
    expect(locateExcerpt('South 12 degrees West', page)).toBeNull();
    expect(locateExcerpt('anything', null)).toBeNull();
  });
});

describe('the count a reviewer sees first', () => {
  it('leads with what is unevidenced, not with the total', () => {
    // "412 data points extracted" reads as thoroughness. "412 extracted, 38 with no source" reads as
    // a work list.
    const t = evidenceTotals([dp({ source_page: 1 }), dp({ document_id: '' }), dp({ document_id: '' })]);
    expect(t.unevidenced).toBe(2);
    expect(t.headline).toContain('2 with no source recorded');
  });

  it('says so when every fact is attributed', () => {
    expect(evidenceTotals([dp({ source_page: 1 })]).headline).toContain('every one attributed');
  });

  it('does not report an empty set as a clean bill', () => {
    expect(evidenceTotals([]).headline).toContain('No data points have been extracted');
  });
});

describe('the surface', () => {
  const panel = read('app/admin/research/components/DataPointsPanel.tsx');

  it('shows evidence beside confidence, not instead of it', () => {
    expect(panel).toContain('research-review__dp-evidence');
    expect(panel).toContain('research-review__dp-confidence');
  });

  it('does not style evidence on the confidence scale', () => {
    // Two different questions; sharing a visual language would merge them back together.
    const css = read('app/admin/styles/AdminResearch.css');
    expect(css).toContain('.research-review__dp-evidence {');
    expect(css).toContain('Evidence is not confidence');
  });

  it('stops offering a source button with nothing to open', () => {
    expect(panel).toContain('canLocate');
    expect(panel).toContain('Nothing to open');
  });

  it('answers "how do you know that?" on every expanded fact', () => {
    expect(panel).toContain('Evidence:');
  });
});

describe('the column that has never held a value', () => {
  it('is still written as a literal null at the extraction site', () => {
    // Recorded so this is a known gap rather than a surprise: text-based extraction cannot produce
    // pixel coordinates at all, which is why `quoted` is the honest ceiling today and locateExcerpt
    // is what the viewer uses. Vision-based extraction (R18) is what fills this in.
    const svc = read('lib/research/analysis.service.ts');
    expect(svc).toContain('source_bounding_box: null');
  });
});
