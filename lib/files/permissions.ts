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
  /** Seeded system root (`Personal`, `Shared`). Only `describeAudience` reads it — see the container
   *  case there, which exists because "Personal" is granted to everyone ON PURPOSE. */
  is_system?: boolean;
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

// ── F4 (2026-08-11) — WHO CAN SEE THIS? ─────────────────────────────────────────────────────────
//
// Owner: *"Some folders and files and stuff will just be for personal use for each user, and some
// will be company wide, and some will just be for specific roles."*
//
// The model already supported all three. What it never did was SAY which one you were looking at,
// and that gap is different in kind from the other file-explorer gaps: not knowing where the search
// box is wastes a minute, but **a folder that looks private and is not is a privacy failure**.
// Somebody puts a doctor's note or a signed offer letter in a folder they believe is theirs.
//
// ── IT RESOLVES INHERITANCE, IT DOES NOT REPORT IT ──────────────────────────────────────────────
//
// The tempting version reads the node's own grants and shows "Inherited" when `permission_mode` is
// `inherit`. That is the useless answer, and worse, a reassuring one — "inherited" sounds contained
// while the parent may well be shared with the whole firm. So this walks to the nearest `custom`
// ancestor exactly as `resolveAccess` does, and describes the audience that actually applies.

export type AudienceKind = 'private' | 'role' | 'people' | 'everyone' | 'unknown';

export interface Audience {
  kind: AudienceKind;
  /** Short label for a badge — "Only you", "Everyone", "Drawers", "3 people". */
  label: string;
  /** The full sentence for a tooltip or the permissions dialog. */
  detail: string;
}

/**
 * Describe who a node is shared with, given its ancestor chain (ROOT-first, TARGET-last).
 *
 * Pure, so it can be unit-tested against the cases that matter, and so the badge and the permissions
 * dialog can never disagree about what a folder means.
 */
export function describeAudience(chain: ReadonlyArray<NodeWithGrants>): Audience {
  if (chain.length === 0) {
    return { kind: 'unknown', label: 'Unknown', detail: 'Sharing for this item could not be determined.' };
  }

  // The authoritative grant set — same walk as `resolveAccess`, so the two cannot drift.
  let authoritative: NodeWithGrants | null = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].permission_mode === 'custom') { authoritative = chain[i]; break; }
  }

  const target = chain[chain.length - 1];

  // No custom ancestor anywhere means nothing has ever granted access, so only an owner (or an
  // admin) reaches it. Reported as private because that is what it behaves like — but see the
  // detail string, which does not promise that admins cannot see it. Claiming otherwise would be
  // the exact false reassurance this function exists to prevent.
  if (!authoritative) {
    return {
      kind: 'private',
      label: 'Only you',
      detail: target.owner_email
        ? `Only ${target.owner_email} and administrators can open this.`
        : 'Only its owner and administrators can open this.',
    };
  }

  const grants = authoritative.grants;
  const everyone = grants.filter((g) => g.grantee_type === 'everyone');
  const roles = grants.filter((g) => g.grantee_type === 'role');
  const users = grants.filter((g) => g.grantee_type === 'user');

  // Checked FIRST and deliberately: an `everyone` grant beats anything else in the same set, because
  // one company-wide grant makes the folder company-wide no matter how many precise role or person
  // grants sit beside it. Reporting "3 people" for a folder that is also shared with everyone would
  // be the most dangerous wrong answer this function could give.
  if (everyone.length > 0) {
    // ── THE CONTAINER CASE, AND IT IS A REAL FINDING NOT A SPECIAL CASE ─────────────────────────
    //
    // Driving this against production data showed the root folder named **"Personal"** badged
    // "Everyone" — which is *true* (seed 385 grants it `everyone = view` deliberately) and would
    // still frighten anybody who read it, because what lives inside are each person's own private
    // folders. The container is visible; its contents are not.
    //
    // A badge that cries wolf is not a harmless badge. It is read once, disbelieved, and then
    // ignored on the folder where it mattered — which defeats the entire point of F4.
    //
    // The distinguishing fact is in the data, not in the name: a seeded system root whose only
    // company-wide grant is VIEW is a container, whereas "Shared" carries `everyone = edit` and is
    // a genuine company-wide drive. A read-only company folder somebody creates themselves is not
    // `is_system`, so it still reads "Everyone".
    const everyoneIsViewOnly = everyone.every((g) => g.access_level === 'view');
    if (authoritative.is_system && everyoneIsViewOnly && authoritative.id === target.id) {
      return {
        kind: 'role',
        label: 'Container',
        detail:
          'Everyone can see this folder, but what is inside it has its own sharing — a personal '
          + 'folder in here stays private to its owner.',
      };
    }
    return {
      kind: 'everyone',
      label: 'Everyone',
      detail: 'Everyone at the firm can open this.',
    };
  }

  if (roles.length > 0 && users.length === 0) {
    const names = roles.map((g) => (g.grantee_value ?? '').replace(/_/g, ' ')).filter(Boolean);
    return {
      kind: 'role',
      label: names.length === 1 ? titleise(names[0]) : `${names.length} roles`,
      detail: `Shared with ${names.map(titleise).join(', ')}.`,
    };
  }

  if (users.length > 0 && roles.length === 0) {
    return {
      kind: 'people',
      label: users.length === 1 ? '1 person' : `${users.length} people`,
      detail: `Shared with ${users.map((g) => g.grantee_value ?? 'someone').join(', ')}.`,
    };
  }

  if (roles.length > 0 || users.length > 0) {
    const roleNames = roles.map((g) => titleise((g.grantee_value ?? '').replace(/_/g, ' ')));
    return {
      kind: 'people',
      label: `${roles.length + users.length} shares`,
      detail: `Shared with ${[...roleNames, `${users.length} ${users.length === 1 ? 'person' : 'people'}`].join(', ')}.`,
    };
  }

  // A `custom` node with no grants at all is genuinely locked down — somebody removed every share.
  return {
    kind: 'private',
    label: 'Only you',
    detail: target.owner_email
      ? `Only ${target.owner_email} and administrators can open this.`
      : 'Only its owner and administrators can open this.',
  };
}

function titleise(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export const canView = (a: AccessLevel): boolean => accessRank(a) >= accessRank('view');
export const canDownload = (a: AccessLevel): boolean => accessRank(a) >= accessRank('download');
export const canEdit = (a: AccessLevel): boolean => accessRank(a) >= accessRank('edit');
export const canManage = (a: AccessLevel): boolean => a === 'manage';
