import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assessArtifact } from '../services/artifact-uploader.js';
import { assessLegibility } from '../services/ocr-legibility.js';

// ── "UNREADABLE" HAS TO MEAN THE PAPER ─────────────────────────────────────────────────────────
//
// D4 stopped `extracted_text` from holding a conclusion where an extraction belonged. That alone
// does not let anyone tell these two apart, and they have opposite fixes:
//
//   · the scan is too poor for any model to read  → the DOCUMENT is the problem. Buy a better copy,
//                                                   or send someone to the courthouse.
//   · the scan is fine, our extraction produced   → WE are the problem. Re-run the analysis. Buying
//     nothing                                       another copy of a good scan wastes money.
//
// On screen they looked identical: "unreadable". `assessLegibility` answers the second question
// from the image's own dimensions — no model, no text — which is the independent signal
// `project_receipt_confidence_and_editing` records: faded ink gives a CONFIDENT WRONG answer, so
// legibility has to be rated on its own.

/** A page spec at a given DPI, letter-size portrait. */
const letterAt = (dpi: number) => ({
  widthIn: 8.5, heightIn: 11,
  pixelWidth: Math.round(8.5 * dpi), pixelHeight: Math.round(11 * dpi),
});
const quad = { rows: 2, cols: 2 };

/** Text dense enough to pass the extraction floor on a one-page land record. */
const GOOD_TEXT = Array.from({ length: 14 }, (_, i) =>
  `N ${10 + i}°15'30" E 152.${i}0 feet to a 1/2" iron rod set for corner, LOT ${i + 1}`,
).join('\n');

describe('CONTROL — the two scan verdicts really do differ', () => {
  it('a 300 DPI letter scan is legible and a 60 DPI one is not', () => {
    // Without this, every assertion below could pass because both fixtures land on one verdict.
    expect(assessLegibility(letterAt(300), quad).verdict).toBe('good');
    expect(assessLegibility(letterAt(60), quad).verdict).toBe('unreadable');
  });
});

describe('the same empty text, two different answers', () => {
  const goodScan = assessLegibility(letterAt(300), quad);
  const badScan = assessLegibility(letterAt(60), quad);

  it('no text + an unreadable scan: the DOCUMENT is the problem', () => {
    const v = assessArtifact('', 1, 'deed', badScan);
    expect(v.status).toBe('unreadable');
    expect(v.readability).toBe('unreadable');
    // The reason names the scan, so an operator knows to get a better copy.
    expect(v.reason).toBe(badScan.statement);
  });

  it('no text + a legible scan: WE are the problem, and it is recoverable', () => {
    const v = assessArtifact('', 1, 'deed', goodScan);
    // Not 'unreadable'. Telling an operator to buy another copy of a good scan wastes money.
    expect(v.status).toBe('pending');
    expect(v.readability).not.toBe('unreadable');
    expect(v.reason).toContain('failed extraction, not an unreadable document');
    expect(v.reason).toContain('re-run the analysis');
  });

  it('THE DEFECT: without a scan verdict, both collapse to "unreadable"', () => {
    // This is the behaviour that stamped sixteen legible deeds unreadable. Preserved as the
    // fallback for when the image cannot be measured — "we do not know" must not become "the scan
    // is fine" — and pinned here so the difference the scan makes is visible.
    expect(assessArtifact('', 1, 'deed', null).status).toBe('unreadable');
    expect(assessArtifact('', 1, 'deed').status).toBe('unreadable');
  });

  it('good text is analysed regardless, and the scan does not override it', () => {
    expect(assessArtifact(GOOD_TEXT, 1, 'deed', goodScan).status).toBe('analyzed');
    // A model that read a page we thought was too poor has proven us wrong about the page.
    // Still marked unreadable, because the scan verdict is the stronger claim about the artifact —
    // and this is asserted so the choice is deliberate rather than incidental.
    expect(assessArtifact(GOOD_TEXT, 1, 'deed', badScan).status).toBe('unreadable');
  });
});

describe('the filing path uses it — assert the CALLER', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'services/artifact-uploader.ts'), 'utf8',
  );
  const code = src.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');

  it('CONTROL: the probe is reading the uploader', () => {
    expect(code).toContain('resilientInsertDocument');
  });

  it('both insert sites rate the scan before they rate the text', () => {
    expect(code).toContain('const scan = await scanLegibility(firstPage.imageBase64)');
    expect(code).toContain('const incScan = await scanLegibility(firstPage.imageBase64)');
  });

  it('and assessArtifact is called ONCE per document, not three times', () => {
    // It used to be called three times with identical arguments — harmless until the call does
    // I/O, and rating the scan reads the image.
    expect(code.split('assessArtifact(').length - 1).toBeLessThanOrEqual(3); // 1 definition + 2 sites
  });

  it('the verdict is stored with the evidence behind it', () => {
    // `readability_signals` has existed as a column since the readability slice and held [] here.
    expect(code.split('readability_signals: ').length - 1).toBe(2);
    expect(code).toContain('`scan:${scan.verdict}`');
  });

  it('an unmeasurable image means "we do not know", never "the scan is fine"', () => {
    const at = src.indexOf('async function scanLegibility');
    expect(at).toBeGreaterThan(-1);
    // The doc comment sits above the declaration, so look on both sides of it.
    expect(src.slice(at - 800, at)).toContain('It never means "the scan is fine"');
    expect(src.slice(at, at + 1200)).toContain('return null;');
  });
});
