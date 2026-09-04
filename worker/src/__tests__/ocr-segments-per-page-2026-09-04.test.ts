import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mergePageSegments } from '../services/artifact-uploader.js';
import type { ArtifactPageImage } from '../services/artifact-uploader.js';

// ── E4: multi-page OCR segments carried per page, not first page only ────────────────────────────
//
// The artifact uploader stored `firstPage.ocrSegments` and dropped pages 2..N. A document re-read
// by the reading pass has its segments overwritten with a per-page set, but a document read cleanly
// at filing is never re-read — so its ocr_segments stayed page-1-only for good. mergePageSegments
// carries every page, tagged by page number, and both uploader sites now use it.

const SRC = path.resolve(process.cwd(), 'src');
const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
const read = (rel: string) => strip(fs.readFileSync(path.join(SRC, rel), 'utf8'));

const page = (pageNumber: number, ocrSegments: unknown): ArtifactPageImage =>
  ({ pageNumber, imageBase64: '', ocrSegments } as unknown as ArtifactPageImage);

describe('mergePageSegments carries every page', () => {
  it('flattens all pages\' segments and tags each with its page number', () => {
    const merged = mergePageSegments([
      page(1, [{ segmentId: 'a', text: 'one' }, { segmentId: 'b', text: 'two' }]),
      page(2, [{ segmentId: 'c', text: 'three' }]),
      page(3, [{ segmentId: 'd', text: 'four' }]),
    ]);
    expect(merged).toHaveLength(4);                                  // 2 + 1 + 1, not just page 1's 2
    expect(merged).toContainEqual({ segmentId: 'a', text: 'one', page: 1 });
    expect(merged).toContainEqual({ segmentId: 'c', text: 'three', page: 2 });
    expect(merged).toContainEqual({ segmentId: 'd', text: 'four', page: 3 });
    // every page beyond the first is represented
    const pagesSeen = new Set((merged as Array<{ page: number }>).map((s) => s.page));
    expect([...pagesSeen].sort()).toEqual([1, 2, 3]);
  });

  it('keeps a non-array per-page payload whole under its page tag', () => {
    const merged = mergePageSegments([
      page(1, { gridUsed: '2x2', totalSegments: 4 }),
      page(2, { gridUsed: '3x3', totalSegments: 9 }),
    ]);
    expect(merged).toEqual([
      { page: 1, segments: { gridUsed: '2x2', totalSegments: 4 } },
      { page: 2, segments: { gridUsed: '3x3', totalSegments: 9 } },
    ]);
  });

  it('returns null when no page has segments (a null column, not an empty array)', () => {
    expect(mergePageSegments([page(1, null), page(2, undefined)])).toBeNull();
    expect(mergePageSegments([])).toBeNull();
  });
});

describe('both uploader sites use the per-page merge, not firstPage only', () => {
  const src = read('services/artifact-uploader.ts');
  it('neither insert stores firstPage.ocrSegments any more', () => {
    expect(src).not.toContain('ocr_segments: firstPage.ocrSegments');
  });
  it('the batch insert merges across `pages`, the incremental insert across `sorted`', () => {
    expect(src).toContain('ocr_segments: mergePageSegments(pages)');
    expect(src).toContain('ocr_segments: mergePageSegments(sorted)');
    // exactly the two document inserts write ocr_segments
    expect((src.match(/ocr_segments: mergePageSegments\(/g) ?? []).length).toBe(2);
  });
});
