// F2 — source-lock for the file-explorer tree/name helpers.
import { describe, it, expect } from 'vitest';
import { sanitizeName, buildBreadcrumb, nextAvailableName, wouldCreateCycle } from '@/lib/files/tree';

describe('files/tree: sanitizeName', () => {
  it('strips path separators + control chars, trims, caps length', () => {
    expect(sanitizeName('  Reports/2026  ')).toBe('Reports-2026');
    expect(sanitizeName('a\\b')).toBe('a-b');
    expect(sanitizeName(null)).toBe('');
    expect(sanitizeName('x'.repeat(300)).length).toBe(200);
  });
});

describe('files/tree: buildBreadcrumb', () => {
  it('maps a chain to {id,name}', () => {
    expect(buildBreadcrumb([{ id: 'a', name: 'Root', x: 1 } as never, { id: 'b', name: 'Sub' } as never])).toEqual([
      { id: 'a', name: 'Root' },
      { id: 'b', name: 'Sub' },
    ]);
  });
});

describe('files/tree: nextAvailableName', () => {
  it('returns the base when free', () => {
    expect(nextAvailableName('Report', ['Other'])).toBe('Report');
  });
  it('suffixes (copy), then (copy 2)… preserving extension', () => {
    expect(nextAvailableName('Report.pdf', ['report.pdf'])).toBe('Report (copy).pdf');
    expect(nextAvailableName('Report.pdf', ['report.pdf', 'report (copy).pdf'])).toBe('Report (copy 2).pdf');
    expect(nextAvailableName('Folder', ['folder', 'folder (copy)'])).toBe('Folder (copy 2)');
  });
  it('is case-insensitive', () => {
    expect(nextAvailableName('Budget', ['BUDGET'])).toBe('Budget (copy)');
  });
});

describe('files/tree: wouldCreateCycle', () => {
  it('blocks moving a node into itself or a descendant', () => {
    expect(wouldCreateCycle('n1', ['root', 'n1', 'child'])).toBe(true);
    expect(wouldCreateCycle('n1', ['root', 'other'])).toBe(false);
  });
});
