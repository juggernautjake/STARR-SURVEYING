import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { citationsFromText, describeCitations, reconcileCitations, describeReconciliation } from '../research/drawing-hunt.js';

// ── C3: the drawing hunt reads the citations a document points at, out of its own text ────────────
//
// A deed/survey names the drawings it depends on. Reading those references out of the reading pass's
// text is the list of documents the run should chase next (the fetch is a later slice).

describe('citationsFromText', () => {
  it('reads cabinet/slide plat-record citations', () => {
    const c = citationsFromText('being the same tract described in Cabinet A, Slide 312 of the Plat Records');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: 'cabinet-slide', cabinet: 'A', slide: '312' });
  });

  it('reads volume/page book citations in several spellings', () => {
    const c = citationsFromText('recorded in Volume 1234, Page 56; see also Vol. 89 Pg. 7');
    expect(c.map((x) => `${x.volume}/${x.page}`).sort()).toEqual(['1234/56', '89/7']);
    expect(c.every((x) => x.kind === 'volume-page')).toBe(true);
  });

  it('reads survey-abstract citations, including the A-123 form', () => {
    const c = citationsFromText('the J. SMITH SURVEY, Abstract No. 123, and the adjoining A-456 tract');
    const abstracts = c.filter((x) => x.kind === 'survey-abstract').map((x) => x.abstract).sort();
    expect(abstracts).toEqual(['123', '456']);
  });

  it('deduplicates the same citation across blocks, keeping the first raw match', () => {
    const c = citationsFromText('Cabinet A, Slide 312', 'again in Cab. A Sl. 312 of said records');
    expect(c).toHaveLength(1);
    expect(c[0].raw).toBe('Cabinet A, Slide 312');
  });

  it('finds nothing in text with no citations, and never throws on null', () => {
    expect(citationsFromText('a warranty deed conveying the surface estate', null, undefined)).toEqual([]);
  });
});

describe('describeCitations', () => {
  it('names each citation, or says none were found', () => {
    expect(describeCitations([])).toContain('No plat');
    const line = describeCitations(citationsFromText('Cabinet B, Slide 9 and Volume 10, Page 11'));
    expect(line).toContain('Cabinet B, Slide 9');
    expect(line).toContain('Volume 10, Page 11');
  });
});

describe('reconcileCitations — held vs stated miss (C3 miss half)', () => {
  it('marks a referenced citation held when a filed document IS that drawing', () => {
    const referenced = citationsFromText('being Lot 3 of Cabinet A, Slide 312, and Volume 10, Page 20');
    // We hold the plat filed as Cabinet A Slide 312, but NOT the Volume 10 Page 20 record.
    const held = citationsFromText('Cabinet A, Slide 312');
    const statuses = reconcileCitations(referenced, held);
    const cs = statuses.find((s) => s.citation.kind === 'cabinet-slide')!;
    const vp = statuses.find((s) => s.citation.kind === 'volume-page')!;
    expect(cs.held).toBe(true);
    expect(vp.held).toBe(false);
  });

  it('describeReconciliation names the stated misses', () => {
    const referenced = citationsFromText('Cabinet A, Slide 312 and Volume 10, Page 20');
    const held = citationsFromText('Cabinet A, Slide 312');
    const line = describeReconciliation(reconcileCitations(referenced, held));
    expect(line).toContain('1 already on file');
    expect(line).toContain('stated miss');
    expect(line).toContain('Volume 10, Page 20');
  });

  it('says all on file when nothing is missing', () => {
    const referenced = citationsFromText('Cabinet A, Slide 312');
    const line = describeReconciliation(reconcileCitations(referenced, referenced));
    expect(line).toContain('All are already on file');
  });
});

describe('C3 is wired into the tail, after the reading pass', () => {
  const SRC = path.resolve(process.cwd(), 'src');
  const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
  const index = strip(fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8'));
  it('the run reconciles referenced citations against what is on file and attaches the result', () => {
    expect(index).toContain('reconcileCitations(referenced, held)');
    expect(index).toContain('describeReconciliation(statuses)');
    expect(index).toContain('citedDrawings = statuses');
  });
});
