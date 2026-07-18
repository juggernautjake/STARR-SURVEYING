// __tests__/jobs/instructions.test.ts — the Work Mode job-instructions link parser/resolver.
import { describe, it, expect } from 'vitest';
import {
  parseInstructions, extractFileRefs, resolveInstructions, brokenInstructionRefs,
} from '@/lib/jobs/instructions';

describe('parseInstructions', () => {
  it('splits text around a file link', () => {
    const segs = parseInstructions('Set the pin per [the plat](job-file:abc123) then call.');
    expect(segs).toEqual([
      { type: 'text', text: 'Set the pin per ' },
      { type: 'link', label: 'the plat', fileId: 'abc123', image: false },
      { type: 'text', text: ' then call.' },
    ]);
  });

  it('recognizes an inline image reference', () => {
    const segs = parseInstructions('![site photo](job-file:img-1)');
    expect(segs).toEqual([{ type: 'link', label: 'site photo', fileId: 'img-1', image: true }]);
  });

  it('handles multiple links and empty/label-less forms', () => {
    const segs = parseInstructions('[](job-file:f1) and [b](job-file:f2)');
    expect(segs[0]).toMatchObject({ type: 'link', label: 'file', fileId: 'f1', image: false });
    expect(segs[2]).toMatchObject({ type: 'link', label: 'b', fileId: 'f2' });
  });

  it('leaves malformed link-like text literal and returns [] for empty', () => {
    expect(parseInstructions('see [broken](http://x)')).toEqual([{ type: 'text', text: 'see [broken](http://x)' }]);
    expect(parseInstructions('')).toEqual([]);
    expect(parseInstructions(null)).toEqual([]);
  });
});

describe('extractFileRefs', () => {
  it('lists distinct ids in first-seen order', () => {
    expect(extractFileRefs('[a](job-file:f1) [b](job-file:f2) [c](job-file:f1)')).toEqual(['f1', 'f2']);
  });
});

describe('resolveInstructions', () => {
  const files = [{ id: 'f1', name: 'Plat.pdf' }, { id: 'f2', name: 'Deed.pdf' }];
  const urlOf = (f: { id: string }) => `https://cdn/${f.id}`;

  it('attaches the resolved file (name + url) to a good link', () => {
    const segs = resolveInstructions('[plat](job-file:f1)', files, urlOf);
    expect(segs[0]).toMatchObject({ type: 'link', fileId: 'f1', file: { id: 'f1', name: 'Plat.pdf', url: 'https://cdn/f1' } });
  });

  it('marks a removed file as broken (file: null)', () => {
    const segs = resolveInstructions('[gone](job-file:zzz)', files, urlOf);
    expect((segs[0] as { file: unknown }).file).toBeNull();
  });
});

describe('brokenInstructionRefs', () => {
  it('returns the referenced ids that no longer exist', () => {
    expect(brokenInstructionRefs('[a](job-file:f1) [b](job-file:gone)', ['f1', 'f2'])).toEqual(['gone']);
    expect(brokenInstructionRefs('[a](job-file:f1)', ['f1'])).toEqual([]);
  });
});
