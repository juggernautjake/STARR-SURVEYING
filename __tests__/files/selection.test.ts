// __tests__/files/selection.test.ts — the rules every file list shares for picking several files
// (owner, 2026-09-27: "do a selection of the images and delete groups of images").

import { describe, it, expect } from 'vitest';
import { EMPTY_SELECTION, toggle, toggleAll, prune, allState, namesForConfirm } from '@/lib/files/selection';
import { deleteTargetForMountNode, leadAttachmentId, leadAttachmentKey } from '@/lib/files/bulk-delete';

const ORDER = ['a', 'b', 'c', 'd', 'e'];
const ids = (s: { selected: ReadonlySet<string> }) => [...s.selected].sort();

describe('toggle and Shift-click ranges', () => {
  it('a click toggles one and becomes the anchor', () => {
    const s = toggle(EMPTY_SELECTION, 'b', ORDER);
    expect(ids(s)).toEqual(['b']);
    expect(s.anchor).toBe('b');
    expect(ids(toggle(s, 'b', ORDER))).toEqual([]);
  });

  it('Shift-click selects everything between the anchor and the click, in SHOWN order, either direction', () => {
    const s = toggle(toggle(EMPTY_SELECTION, 'b', ORDER), 'd', ORDER, true);
    expect(ids(s)).toEqual(['b', 'c', 'd']);
    const back = toggle(toggle(EMPTY_SELECTION, 'e', ORDER), 'c', ORDER, true);
    expect(ids(back)).toEqual(['c', 'd', 'e']);
  });

  it('Shift-click on a selected box clears the range instead', () => {
    let s = toggleAll(EMPTY_SELECTION, ORDER);
    s = toggle(s, 'b', ORDER);            // b off, anchor b
    s = toggle(s, 'd', ORDER, true);      // d was on → range turns OFF
    expect(ids(s)).toEqual(['a', 'e']);
  });

  it('Shift with no anchor is an ordinary click', () => {
    expect(ids(toggle(EMPTY_SELECTION, 'c', ORDER, true))).toEqual(['c']);
  });
});

describe('Select all, and what drops out', () => {
  it('selects every shown item, and a second press clears', () => {
    const all = toggleAll(EMPTY_SELECTION, ORDER);
    expect(ids(all)).toEqual(ORDER);
    expect(allState(all, ORDER)).toBe('all');
    expect(ids(toggleAll(all, ORDER))).toEqual([]);
  });

  it('reports some/none for the indeterminate checkbox', () => {
    expect(allState(toggle(EMPTY_SELECTION, 'a', ORDER), ORDER)).toBe('some');
    expect(allState(EMPTY_SELECTION, ORDER)).toBe('none');
  });

  it('items that leave the screen leave the selection — a bar can never act on something unseen', () => {
    const s = toggleAll(EMPTY_SELECTION, ORDER);
    const pruned = prune(s, ['a', 'c']);
    expect(ids(pruned)).toEqual(['a', 'c']);
    expect(prune(pruned, ['a', 'c'])).toBe(pruned); // unchanged → same object
  });
});

describe('the confirmation lists names, not just a count', () => {
  it('shows the first eight and says how many more', () => {
    const names = Array.from({ length: 11 }, (_, i) => `IMG_${i}.jpg`);
    expect(namesForConfirm(names)).toEqual({ shown: names.slice(0, 8), more: 3 });
  });
});

describe('what a file-list node deletes as', () => {
  it('job files and research documents by their own row; Explorer documents by node; the rest nowhere', () => {
    expect(deleteTargetForMountNode({ id: 'mnt:job-files:J1', name: 'a.jpg', source: { table: 'job_files', id: 'J1' } }))
      .toEqual({ kind: 'job_file', id: 'J1', name: 'a.jpg' });
    expect(deleteTargetForMountNode({ id: 'mnt:research:D1', name: 'deed.pdf', source: { table: 'research_documents', id: 'D1' } }))
      .toEqual({ kind: 'research_document', id: 'D1', name: 'deed.pdf' });
    expect(deleteTargetForMountNode({ id: 'node-uuid', name: 'memo.docx' })).toEqual({ kind: 'file_node', id: 'node-uuid', name: 'memo.docx' });
    expect(deleteTargetForMountNode({ id: 'mnt:x', name: 'r', source: { table: 'receipts', id: 'R' } })).toBeNull();
    expect(deleteTargetForMountNode({ id: 'mnt:x', name: 'd', source: { table: 'cad_drawings', id: 'C' } })).toBeNull();
  });

  it('a lead attachment key is stable and differs by name or size', () => {
    const a = { name: 'plat.pdf', size: 10 };
    expect(leadAttachmentKey(a)).toMatch(/^[0-9a-f]{8}$/);
    expect(leadAttachmentKey(a)).toBe(leadAttachmentKey({ ...a }));
    expect(leadAttachmentKey(a)).not.toBe(leadAttachmentKey({ ...a, size: 11 }));
    expect(leadAttachmentId('L1', a)).toBe(`L1_${leadAttachmentKey(a)}`);
  });
});
