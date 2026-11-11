import { describe, it, expect } from 'vitest';
import { sortFileNodes } from '@/lib/files/sort';

const f = (name: string, uploaded_at: string | null = null) => ({ node_type: 'file' as const, name, uploaded_at });
const d = (name: string) => ({ node_type: 'folder' as const, name });
const names = (xs: Array<{ name: string }>) => xs.map((x) => x.name);

describe('sortFileNodes', () => {
  it('defaults to A–Z with numbers read as numbers, folders first', () => {
    const out = sortFileNodes([f('Video 10.mp4'), d('photos'), f('video 2.mp4'), d('CAD'), f('Video 1.mp4'), d('Lot 10'), d('Lot 2')]);
    expect(names(out)).toEqual(['CAD', 'Lot 2', 'Lot 10', 'photos', 'Video 1.mp4', 'video 2.mp4', 'Video 10.mp4']);
  });

  it('sorts newest uploaded first, undated last, ties by name', () => {
    const out = sortFileNodes([
      f('b', '2026-01-01T00:00:00Z'), f('none'), f('a', '2026-03-01T00:00:00Z'), f('c', '2026-01-01T00:00:00Z'), d('Z'),
    ], 'uploaded');
    expect(names(out)).toEqual(['Z', 'a', 'b', 'c', 'none']);
  });

  it('does not change the list it was given', () => {
    const input = [f('b'), f('a')];
    sortFileNodes(input);
    expect(names(input)).toEqual(['b', 'a']);
  });
});
