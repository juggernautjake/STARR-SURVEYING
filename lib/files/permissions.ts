// lib/files/permissions.ts
//
// F1 of FILE_EXPLORER_2026-06-25 — pure permission model for the file explorer.
//
// Access levels are ordered: none < view < download < edit < manage. A user's
// effective access on a node is the MAX across every grant that matches them
// (everyone, one of their roles, or their email), on the node that supplies the
// grants under the inheritance rule:
//   - permission_mode 'custom'  → the node's own grants are authoritative.
//   - permission_mode 'inherit' → walk up to the nearest 'custom' ancestor.
// Owner of the node (or of an ancestor personal root) and admins always get
// 'manage'. Pure → unit-tested; the API enforces these server-side.

export type AccessLevel = 'none' | 'view' | 'download' | 'edit' | 'manage';

const ORDER: AccessLevel[] = ['none', 'view', 'download', 'edit', 'manage'];

export function accessRank(a: AccessLevel): number {
  const i = ORDER.indexOf(a);
  return i < 0 ? 0 : i;
}

export function maxAccess(a: AccessLevel, b: AccessLevel): AccessLevel {
  return accessRank(a) >= accessRank(b) ? a : b;
}

export interface PermissionGrant {
  grantee_type: 'everyone' | 'role' | 'user';
  grantee_value: string | null;
  access_level: 'view' | 'download' | 'edit' | 'manage';
}

export interface FileUser {
  email: string;
  roles: string[];
}

/** Pure — effective access from a flat set of grants for ONE node (no
 *  inheritance, no owner/admin override). */
export function accessFromGrants(grants: ReadonlyArray<PermissionGrant>, user: FileUser): AccessLevel {
  const email = user.email.trim().toLowerCase();
  const roles = new Set(user.roles.map((r) => r.trim().toLowerCase()));
  let acc: AccessLevel = 'none';
  for (const g of grants) {
    let matches = false;
    if (g.grantee_type === 'everyone') matches = true;
    else if (g.grantee_type === 'role') matches = roles.has((g.grantee_value ?? '').trim().toLowerCase());
    else if (g.grantee_type === 'user') matches = (g.grantee_value ?? '').trim().toLowerCase() === email && email.length > 0;
    if (matches) acc = maxAccess(acc, g.access_level);
  }
  return acc;
}

export interface NodeWithGrants {
  id: string;
  permission_mode: 'inherit' | 'custom';
  owner_email: string | null;
  grants: ReadonlyArray<PermissionGrant>;
}

/** Pure — resolve a user's effective access for the target node, given its
 *  ancestor chain ordered ROOT-first, TARGET-last. */
export function resolveAccess(chain: ReadonlyArray<NodeWithGrants>, user: FileUser, isAdmin = false): AccessLevel {
  if (isAdmin) return 'manage';
  if (chain.length === 0) return 'none';

  // Owner of the target or of any ancestor (e.g. their personal root) → manage.
  const email = user.email.trim().toLowerCase();
  if (email.length > 0) {
    for (const n of chain) {
      if ((n.owner_email ?? '').trim().toLowerCase() === email) return 'manage';
    }
  }

  // Find the authoritative grant set: target → up, the nearest 'custom' node.
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].permission_mode === 'custom') {
      return accessFromGrants(chain[i].grants, user);
    }
  }
  return 'none';
}

export const canView = (a: AccessLevel): boolean => accessRank(a) >= accessRank('view');
export const canDownload = (a: AccessLevel): boolean => accessRank(a) >= accessRank('download');
export const canEdit = (a: AccessLevel): boolean => accessRank(a) >= accessRank('edit');
export const canManage = (a: AccessLevel): boolean => a === 'manage';
