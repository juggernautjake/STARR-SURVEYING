// Markup that survives closing the viewer (research plan R24).
//
// `SourceDocumentViewer` has had a full drawing canvas — colours, widths, freehand strokes, per page
// — since it was written. `drawPaths` was React state and nothing else. Close the viewer and every
// mark a surveyor made was gone. A feature that looks complete and keeps nothing is worse than one
// that is missing: somebody marks up a plat, closes the tab, and only then finds out.
//
// Two contracts here. The original file is never modified — annotations are rows keyed to the
// document, and a recorded instrument that has been drawn on is no longer the recorded instrument.
// And coordinates are FRACTIONS of the page, never pixels: the canvas is sized to
// `img.naturalWidth`, so pixel coordinates pin the markup to one rendering of one scan.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  flattenLayers,
  normaliseWidth,
  summariseAnnotations,
  toNormalised,
  toPixels,
  validateStrokes,
  widthInPixels,
  type AnnotationLayer,
  type Stroke,
} from '@/lib/research/document-annotations';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const stroke = (over: Partial<Stroke> = {}): Stroke => ({
  kind: 'freehand',
  points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
  color: '#ff3333',
  width: 0.002,
  ...over,
});

const layer = (over: Partial<AnnotationLayer> = {}): AnnotationLayer => ({
  documentId: 'doc-1',
  page: 0,
  layerName: 'Markup',
  layerOrder: 0,
  visible: true,
  strokes: [stroke()],
  authorEmail: 'jacob@example.com',
  ...over,
});

describe('coordinates are fractions of the page', () => {
  it('round-trips through a rendering of any size', () => {
    // The whole point: the same stroke must land in the same place on a 2000px scan and a 600px one.
    const px = [{ x: 400, y: 300 }];
    const norm = toNormalised(px, 2000, 1500);
    expect(norm[0]).toEqual({ x: 0.2, y: 0.2 });
    expect(toPixels(norm, 600, 450)).toEqual([{ x: 120, y: 90 }]);
  });

  it('clamps a point that strayed outside the page', () => {
    expect(toNormalised([{ x: -10, y: 9999 }], 100, 100)).toEqual([{ x: 0, y: 1 }]);
  });

  it('returns nothing rather than dividing by zero', () => {
    expect(toNormalised([{ x: 1, y: 1 }], 0, 100)).toEqual([]);
  });

  it('keeps a stroke’s visual weight at any render size', () => {
    // A 6px line on a 2000px scan is 0.3% of the width, so it stays 0.3% at any size.
    const w = normaliseWidth(6, 2000);
    expect(widthInPixels(w, 2000)).toBeCloseTo(6, 5);
    expect(widthInPixels(w, 4000)).toBeCloseTo(12, 5);
  });

  it('never lets a stroke round away to nothing', () => {
    // A width that renders as 0 looks exactly like markup being lost again, which is the one
    // impression this whole slice exists to remove.
    expect(widthInPixels(normaliseWidth(3, 2000), 100)).toBeGreaterThanOrEqual(1);
    expect(widthInPixels(0.00001, 50)).toBeGreaterThanOrEqual(1);
  });
});

describe('the boundary refuses pixels rather than squashing them', () => {
  it('rejects coordinates outside 0–1 with a reason', () => {
    // Silently squashing 1400 → 1 would put the markup in the corner of the page and look like a
    // rendering bug for weeks.
    const err = validateStrokes([stroke({ points: [{ x: 1400, y: 900 }] })]);
    expect(err).toContain('fractions of the page, not pixels');
  });

  it('rejects a stroke with no points, no colour, or a silly width', () => {
    expect(validateStrokes([stroke({ points: [] })])).toContain('no points');
    expect(validateStrokes([stroke({ color: 'red' as never })])).toContain('valid colour');
    expect(validateStrokes([stroke({ width: 0 })])).toContain('invalid width');
    expect(validateStrokes([stroke({ width: 40 })])).toContain('invalid width');
  });

  it('caps runaway payloads', () => {
    expect(validateStrokes(Array.from({ length: 2001 }, () => stroke()))).toContain('Too many strokes');
    expect(validateStrokes([stroke({ points: Array.from({ length: 5001 }, () => ({ x: 0.1, y: 0.1 })) })]))
      .toContain('too many points');
  });

  it('accepts a well-formed layer', () => {
    expect(validateStrokes([stroke(), stroke()])).toBeNull();
    expect(validateStrokes([])).toBeNull();
  });
});

describe('layers', () => {
  it('flattens visible layers in draw order', () => {
    const flat = flattenLayers([
      layer({ layerName: 'B', layerOrder: 2, strokes: [stroke({ color: '#0000ff' })] }),
      layer({ layerName: 'A', layerOrder: 1, strokes: [stroke({ color: '#00ff00' })] }),
    ], 0);
    expect(flat.map(s => s.color)).toEqual(['#00ff00', '#0000ff']);
  });

  it('drops a hidden layer instead of drawing it faintly', () => {
    // "visible: false" is a decision the author made; a flattened export that quietly includes it
    // hands somebody markup they had deliberately turned off.
    const flat = flattenLayers([layer({ visible: false })], 0);
    expect(flat).toHaveLength(0);
  });

  it('only takes the requested page', () => {
    expect(flattenLayers([layer({ page: 3 })], 0)).toHaveLength(0);
  });
});

describe('what is on this document, said before opening it', () => {
  it('names the pages and the authors', () => {
    // Markup on page 7 of a 12-page plat is invisible until somebody happens to scroll there.
    const s = summariseAnnotations([
      layer({ page: 6, authorEmail: 'jacob@x' }),
      layer({ page: 0, layerName: 'Questions', authorEmail: 'rpls@x' }),
    ]);
    expect(s.headline).toContain('page(s) 1, 7');
    expect(s.headline).toContain('jacob@x');
    expect(s.headline).toContain('The original document is unchanged');
  });

  it('ignores empty layers in the count', () => {
    expect(summariseAnnotations([layer({ strokes: [] })]).layers).toBe(0);
  });

  it('says plainly when there is none', () => {
    expect(summariseAnnotations([]).headline).toContain('No markup has been saved');
  });
});

describe('the original is never touched', () => {
  it('stores markup in its own table', () => {
    const seed = read('seeds/535_document_annotations.sql');
    expect(seed).toContain('CREATE TABLE IF NOT EXISTS document_annotations');
    // Nothing here re-encodes the image or writes the document row.
    expect(seed).not.toMatch(/UPDATE\s+research_documents/i);
  });

  it('never writes the document row or its stored file', () => {
    // A recorded instrument that has been drawn on is no longer the recorded instrument, so the
    // download must stay byte-identical to what was fetched from the county.
    const route = read('app/api/admin/research/[projectId]/documents/[docId]/annotations/route.ts');
    expect(route).not.toContain('storage_path');

    // `research_documents` is touched exactly once, to check the document belongs to this project —
    // and only ever with .select().
    const uses = route.split("from('research_documents')");
    expect(uses).toHaveLength(2);
    expect(uses[1]!.slice(0, 120)).toContain(".select('id')");
    expect(route).not.toMatch(/from\('research_documents'\)[\s\S]{0,200}\.(update|upsert|insert|delete)\(/);
  });

  it('upserts a layer rather than appending duplicates', () => {
    const seed = read('seeds/535_document_annotations.sql');
    expect(seed).toMatch(/CREATE UNIQUE INDEX[\s\S]*document_id, page, layer_name, author_email/);
    const route = read('app/api/admin/research/[projectId]/documents/[docId]/annotations/route.ts');
    expect(route).toContain("onConflict: 'document_id,page,layer_name,author_email'");
  });

  it('checks the document belongs to the project in the path', () => {
    // Otherwise the project id is decoration and any document could be annotated by guessing an id.
    const route = read('app/api/admin/research/[projectId]/documents/[docId]/annotations/route.ts');
    expect(route).toContain(".eq('research_project_id', projectId)");
  });
});

describe('the viewer actually saves now', () => {
  const viewer = read('app/admin/research/components/SourceDocumentViewer.tsx');

  it('loads saved markup on open', () => {
    expect(viewer).toContain('loadAnnotations');
    expect(viewer).toContain('void loadAnnotations()');
  });

  it('normalises before sending', () => {
    expect(viewer).toContain('toNormalised(p.points, w, h)');
    expect(viewer).toContain('normaliseWidth(p.width, w)');
  });

  it('warns before closing with unsaved strokes', () => {
    // The precise loss this slice exists to end.
    expect(viewer).toContain('unsaved markup');
    expect(viewer).toContain('requestClose');
  });

  it('does not report a failed load as "no markup"', () => {
    expect(viewer).toContain('it has not been lost, this view failed to fetch it');
  });

  it('shows a save failure instead of staying silent', () => {
    // Silence reads as "it saved".
    expect(viewer).toContain('research-viewer__markup-error');
    expect(read('app/admin/styles/AdminResearch.css')).toContain('.research-viewer__markup-error');
  });

  it('is given a projectId at every call site', () => {
    // Without it the viewer draws and cannot save — the state this slice replaced.
    expect(read('app/admin/research/[projectId]/page.tsx')).toContain('projectId={projectId}');
    expect(read('app/admin/research/components/DocumentUploadPanel.tsx')).toContain('projectId={projectId}');
  });
});
