import { describe, it, expect } from 'vitest';
import { chunkText } from '@/lib/learn/reference-extract';

describe('chunkText — splits reference text into overlapping passages', () => {
  it('returns nothing for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('keeps a short document as a single chunk', () => {
    const out = chunkText('Accuracy is closeness to truth.\n\nPrecision is repeatability.');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('Accuracy');
    expect(out[0]).toContain('Precision');
  });

  it('splits long text into multiple chunks with overlap', () => {
    // 5 paragraphs of ~300 words each = ~1500 words → must exceed the 800-word cap.
    const para = (label: string) => `${label} ` + Array.from({ length: 300 }, (_, i) => `w${i}`).join(' ');
    const text = [para('A'), para('B'), para('C'), para('D'), para('E')].join('\n\n');
    const out = chunkText(text, { maxWords: 800, overlapWords: 100 });
    expect(out.length).toBeGreaterThan(1);
    // No chunk should wildly exceed the cap (allowing for the overlap carry).
    for (const c of out) {
      expect(c.split(/\s+/).length).toBeLessThanOrEqual(1000);
    }
  });

  it('hard-splits a single oversized paragraph', () => {
    const huge = Array.from({ length: 2000 }, (_, i) => `t${i}`).join(' ');
    const out = chunkText(huge, { maxWords: 800, overlapWords: 100 });
    expect(out.length).toBeGreaterThan(1);
  });
});
