import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Phase E1: the county GIS parcel polygon is persisted with the run result so the review page can
// draw the actual lot outline. The run had it (it frames the maps and finds the adjoiners from it)
// and dropped it at persist — the result carried the metes-and-bounds `boundary` reconstruction
// but not the polygon the county draws.

const SRC = path.resolve(process.cwd(), 'src');
const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
const read = (rel: string) => strip(fs.readFileSync(path.join(SRC, rel), 'utf8'));

describe('the parcel polygon reaches the persisted result', () => {
  it('PipelineResult carries the polygon, distinct from the metes-and-bounds boundary', () => {
    const types = read('types/index.ts');
    expect(types).toContain('parcelBoundary?: number[][][] | null;');
  });

  it('the Bell path persists property.parcelBoundary into result', () => {
    const index = read('index.ts');
    expect(index).toContain('parcelBoundary: property.parcelBoundary ?? null,');
  });

  it('the generic path persists whatever the result carries (null when it has no polygon)', () => {
    const index = read('index.ts');
    expect(index).toContain('parcelBoundary: r.parcelBoundary ?? null,');
  });
});
