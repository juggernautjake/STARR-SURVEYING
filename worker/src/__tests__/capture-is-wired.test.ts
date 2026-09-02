// worker/src/__tests__/capture-is-wired.test.ts — plan F1–F7, the half that decides if any of it
// is real.
//
// `imagery-plan.ts` is the cautionary tale this file exists because of. It is a good module: it
// computes the zoom that actually frames a parcel, models licensing posture per source, and insists
// on a capture date. It shipped with a header explaining that it "deliberately does NOT fetch", and
// its only callers were its own tests. Meanwhile the capture code twenty files away took Google
// satellite at a fixed zoom 20.
//
// A test that exercised `planCaptures()` alone would pass just as happily in that world. So every
// assertion here reads index.ts and asks whether the run actually does this.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const index = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
const runner = readFileSync(join(__dirname, '..', 'research', 'capture-runner.ts'), 'utf8');
const uploader = readFileSync(join(__dirname, '..', 'services', 'artifact-uploader.ts'), 'utf8');

describe('the run actually captures imagery', () => {
  it('imports the planner and the runner', () => {
    expect(index).toMatch(/from '\.\/research\/capture-plan\.js'/);
    expect(index).toMatch(/from '\.\/research\/capture-runner\.js'/);
  });

  it('CALLS the capture phase from the completion path', () => {
    expect(index).toContain('await captureImageryForRun(projectId, county, unifiedResult)');
  });

  it('and the phase actually plans and runs captures', () => {
    expect(index).toContain('const plan = planCaptures(input)');
    expect(index).toContain('await runCaptures(plan,');
  });

  it('runs BEFORE endFiling, or every screenshot is filed again every run', () => {
    // The filing context holds the project library and this run's id. After endFiling it is gone,
    // so a capture would take the no-context path — a bare insert — which is what produced 19 of
    // the 53 duplicate document groups measured in production.
    const capture = index.indexOf('await captureImageryForRun(');
    const endFiling = index.indexOf('const filing = endFiling(projectId)');
    expect(capture).toBeGreaterThan(-1);
    expect(endFiling).toBeGreaterThan(-1);
    expect(capture).toBeLessThan(endFiling);
  });

  it('never lets the imagery phase fail the run', () => {
    // The research is the point; imagery is supporting evidence. Losing a completed run because a
    // map server was slow would be a bad trade.
    const at = index.indexOf('await captureImageryForRun(');
    const around = index.slice(Math.max(0, at - 400), at + 300);
    expect(around).toMatch(/try \{/);
    expect(around).toMatch(/catch \(e\)/);
  });
});

describe('it is county-general, which was the point', () => {
  it('reads the GIS viewer URL from the registry that already had it', () => {
    // BIS_CONFIGS has carried gisBaseUrl for 19 counties and used it only to query features.
    expect(index).toMatch(/from '\.\/services\/bis-cad\.js'/);
    expect(index).toContain('function gisBaseUrlFor(county: string)');
    expect(index).toContain('cfg?.gisBaseUrl');
  });

  it('does not hardcode a Bell URL in the capture path', () => {
    const at = index.indexOf('function capturePlanInputFor(');
    const fn = index.slice(at, at + 2500);
    expect(fn).not.toMatch(/bellcad/i);
    expect(fn).toContain('gisBaseUrlFor(county)');
  });

  it('passes the adjoining parcels through, so "surrounding properties" is real', () => {
    expect(index).toContain('data.adjacentProperties');
    expect(index).toContain('neighbours,');
  });

  it('honours the run\'s refreshImagery setting', () => {
    // The re-run dialog offers it; if the capture phase ignored it the toggle would be decorative,
    // which is exactly what allow_paid_documents was until plan C3.
    expect(index).toMatch(/refreshImagery.*activePipelines\.get\(projectId\)\?\.settings|settings as \{ refreshImagery/s);
  });
});

describe('a capture is filed like any other document', () => {
  it('goes through the shared insert path, not a bare insert of its own', () => {
    expect(uploader).toContain('export async function fileCaptureRow');
    const at = uploader.indexOf('export async function fileCaptureRow');
    expect(uploader.slice(at, at + 500)).toContain('resilientInsertDocument');
  });

  it('is attributed to the run that produced it', () => {
    expect(runner).toContain('research_run_id: ctx.runId');
    expect(runner).toContain('last_seen_run_id: ctx.runId');
  });

  it('carries a content hash — the only identity an image has', () => {
    // A screenshot has no instrument number and no recording date, so the citation-based identity
    // that catches a duplicate deed cannot see it at all.
    expect(runner).toContain('content_sha256: contentHash(bytes)');
  });

  it('carries its provenance INTO THE ROW, not just the log', () => {
    // An aerial whose capture date, scale and source live only in a log cannot support a conclusion
    // in a packet six months later.
    expect(runner).toContain('provenance,');
    expect(runner).toContain('caption: captionForCapture(item, provenance)');
  });

  it('files NOTHING when the upload failed', () => {
    // 22 documents in this database once advertised a file that was never written, and every viewer
    // believed them.
    const at = runner.indexOf("status: 'store-failed'");
    expect(at).toBeGreaterThan(-1);
    expect(runner.slice(at, at + 400)).toMatch(/worse than no row/i);
  });
});

describe('OCR', () => {
  it('is requested for the CAD GIS map, whose whole value is its text', () => {
    const plan = readFileSync(join(__dirname, '..', 'research', 'capture-plan.ts'), 'utf8');
    // Anchored on `source:`, not `kind:`. The first `kind: 'cad_gis'` in that file belongs to the
    // SKIP branch, so the probe was reading the wrong block — the behaviour was never wrong, and
    // capture-plan.test.ts asserts it directly.
    const at = plan.indexOf("source: 'cad_gis'");
    expect(at).toBeGreaterThan(-1);
    expect(plan.slice(at, at + 1200)).toContain('ocr: true');
  });

  it('is wired to the real reader', () => {
    expect(index).toContain('adaptiveVisionOcr');
    expect(index).toContain('out.mergedText');
  });

  it('never fails the capture', () => {
    // A map with no extracted text is still the map.
    expect(runner).toMatch(/OCR failed .* the image is still filed/);
  });
});
