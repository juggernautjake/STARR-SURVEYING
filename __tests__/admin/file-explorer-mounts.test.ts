// F9 — source-lock for the read-only mount role-gating (pure part).
import { describe, it, expect } from 'vitest';
import { mountRootNodes, MOUNT_PREFIX } from '@/lib/files/mounts';
import type { FileUser } from '@/lib/files/permissions';

const u = (roles: string[]): FileUser => ({ email: 'x@starr-surveying.com', roles });
const names = (roles: string[], admin = false) => mountRootNodes(u(roles), admin).map((n) => n.name);

// ── The Jobs mount (2026-08-19) ─────────────────────────────────────────────────────────────────
//
// This file is a SOURCE-LOCK: it pins the exact list so that adding a mount cannot pass unnoticed,
// and it worked — adding `jobs` broke all four of these. The lists below are updated deliberately.
//
// `projects` (2026-08-19) is the same idea one level up — project → job → kind → items — and it
// shares the Jobs union for the same reason: it delegates to `jobKindNodes`, which re-applies each
// kind's own gate. It cannot show a field crew member anything the Jobs mount would not.
//
// `jobs` is visible to the UNION of the roles of the kinds a job folder can contain, because that
// is only the door. Each kind inside re-applies its own gate (`kindsVisibleTo`), so a field crew
// member who opens a job folder still cannot see its receipts. Getting that wrong would make the
// Jobs mount a permissions hole wearing a folder icon — see the `jobKindNodes` gating tests.
describe('files/mounts: mountRootNodes role gating', () => {
  it('admins see every source', () => {
    expect(names([], true)).toEqual(['Receipts', 'Job Files', 'Research Documents', 'Field Media', 'Drawings', 'Jobs', 'Projects']);
  });

  it('developers see every source without the admin flag', () => {
    expect(names(['developer'])).toEqual(['Receipts', 'Job Files', 'Research Documents', 'Field Media', 'Drawings', 'Jobs', 'Projects']);
  });

  it('field crew see job files + field media, and the Jobs folder that arranges them', () => {
    expect(names(['field_crew'])).toEqual(['Job Files', 'Field Media', 'Jobs', 'Projects']);
  });

  it('researchers and drawers see research documents', () => {
    // A researcher is NOT in the Jobs union, so this list is unchanged — which is the assertion
    // that proves the new mount did not quietly widen everyone's access.
    expect(names(['researcher'])).toEqual(['Research Documents']);
    // F1 (2026-08-11) — a drawer now also sees Drawings. That is the point of the source: the
    // owner asked to find 'all of the drawings' in the file manager, and the people who make them
    // are the ones who need it.
    expect(names(['drawer'])).toEqual(['Research Documents', 'Drawings', 'Jobs', 'Projects']);
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
