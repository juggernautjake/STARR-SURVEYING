// __tests__/files/recycle.test.ts — the bin's two load-bearing rules.
//
// Both are rules where the obvious implementation is wrong in a way that only shows up as data
// loss or data resurrection, neither of which announces itself.

import { describe, it, expect } from 'vitest';
import { deletionRoots, restoreSet, descendantCount, nameOnRestore, type DeletedNode } from '@/lib/files/recycle';

function node(p: Partial<DeletedNode> & { id: string; deleted_at: string }): DeletedNode {
  return {
    parent_id: null, node_type: 'file', name: p.id, owner_email: null, mime_type: null,
    size_bytes: null, storage_bucket: null, storage_path: null, created_by: null,
    ...p,
  } as DeletedNode;
}

const T1 = '2026-08-19T10:00:00.000Z';
const T2 = '2026-08-19T12:00:00.000Z';

describe('what the bin lists', () => {
  it('shows the folder somebody deleted, not the 3 files that went with it', () => {
    const nodes = [
      node({ id: 'folder', node_type: 'folder', parent_id: 'live-parent', deleted_at: T1 }),
      node({ id: 'a', parent_id: 'folder', deleted_at: T1 }),
      node({ id: 'b', parent_id: 'folder', deleted_at: T1 }),
      node({ id: 'c', parent_id: 'folder', deleted_at: T1 }),
    ];
    expect(deletionRoots(nodes).map((n) => n.id)).toEqual(['folder']);
  });

  it('shows a file deleted on its own inside a folder that is still there', () => {
    const nodes = [node({ id: 'lonely', parent_id: 'live-folder', deleted_at: T1 })];
    expect(deletionRoots(nodes).map((n) => n.id)).toEqual(['lonely']);
  });

  it('shows a top-level deletion, which has no parent to disqualify it', () => {
    const nodes = [node({ id: 'top', parent_id: null, node_type: 'folder', deleted_at: T1 })];
    expect(deletionRoots(nodes).map((n) => n.id)).toEqual(['top']);
  });
});

describe('what comes back', () => {
  it('restores the whole subtree that went down in the same act', () => {
    const nodes = [
      node({ id: 'folder', node_type: 'folder', deleted_at: T1 }),
      node({ id: 'a', parent_id: 'folder', deleted_at: T1 }),
      node({ id: 'sub', node_type: 'folder', parent_id: 'folder', deleted_at: T1 }),
      node({ id: 'deep', parent_id: 'sub', deleted_at: T1 }),
    ];
    const root = nodes[0];
    expect(restoreSet(root, nodes).map((n) => n.id).sort()).toEqual(['a', 'deep', 'folder', 'sub']);
    expect(descendantCount(root, nodes)).toBe(3);
  });

  it('LEAVES a file that was deleted separately, earlier, inside that folder', () => {
    // The whole point of scoping by timestamp. `earlier` was thrown away on purpose on its own;
    // restoring the folder must not quietly resurrect it.
    const nodes = [
      node({ id: 'folder', node_type: 'folder', deleted_at: T2 }),
      node({ id: 'with-it', parent_id: 'folder', deleted_at: T2 }),
      node({ id: 'earlier', parent_id: 'folder', deleted_at: T1 }),
    ];
    const ids = restoreSet(nodes[0], nodes).map((n) => n.id);
    expect(ids).toContain('with-it');
    expect(ids).not.toContain('earlier');
  });

  it('does not walk past a descendant that stayed deleted', () => {
    // `deep` sits under `sub`, and `sub` was deleted at a different time. Bringing `deep` back
    // without `sub` would put it in a folder that is not there.
    const nodes = [
      node({ id: 'folder', node_type: 'folder', deleted_at: T2 }),
      node({ id: 'sub', node_type: 'folder', parent_id: 'folder', deleted_at: T1 }),
      node({ id: 'deep', parent_id: 'sub', deleted_at: T1 }),
    ];
    const ids = restoreSet(nodes[0], nodes).map((n) => n.id);
    expect(ids).toEqual(['folder']);
  });

  it('a single file restores as itself', () => {
    const nodes = [node({ id: 'one', parent_id: 'live', deleted_at: T1 })];
    expect(restoreSet(nodes[0], nodes)).toHaveLength(1);
    expect(descendantCount(nodes[0], nodes)).toBe(0);
  });
});

describe('coming back to a name that is taken', () => {
  it('renames rather than colliding', () => {
    expect(nameOnRestore('Plat.pdf', ['Plat.pdf'])).not.toBe('Plat.pdf');
  });
  it('keeps its own name when nothing is in the way', () => {
    expect(nameOnRestore('Plat.pdf', ['Other.pdf'])).toBe('Plat.pdf');
  });
});
