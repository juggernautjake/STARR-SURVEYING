// F9 — source-lock for the read-only mount role-gating (pure part).
import { describe, it, expect } from 'vitest';
import { mountRootNodes, MOUNT_PREFIX } from '@/lib/files/mounts';
import type { FileUser } from '@/lib/files/permissions';

const u = (roles: string[]): FileUser => ({ email: 'x@starr-surveying.com', roles });
const names = (roles: string[], admin = false) => mountRootNodes(u(roles), admin).map((n) => n.name);

describe('files/mounts: mountRootNodes role gating', () => {
  it('admins see every source', () => {
    expect(names([], true)).toEqual(['Receipts', 'Job Files', 'Research Documents', 'Field Media']);
  });

  it('developers see every source without the admin flag', () => {
    expect(names(['developer'])).toEqual(['Receipts', 'Job Files', 'Research Documents', 'Field Media']);
  });

  it('field crew see job files + field media only', () => {
    expect(names(['field_crew'])).toEqual(['Job Files', 'Field Media']);
  });

  it('researchers and drawers see research documents', () => {
    expect(names(['researcher'])).toEqual(['Research Documents']);
    expect(names(['drawer'])).toEqual(['Research Documents']);
  });

  it('a base employee sees no read-only sources', () => {
    expect(names(['employee'])).toEqual([]);
  });

  it('mount nodes are read-only folders at the root with mnt: ids', () => {
    for (const n of mountRootNodes(u([]), true)) {
      expect(n.id.startsWith(MOUNT_PREFIX)).toBe(true);
      expect(n.node_type).toBe('folder');
      expect(n.parent_id).toBeNull();
      expect(n.access).toBe('view'); // never editable from the tree
    }
  });
});
