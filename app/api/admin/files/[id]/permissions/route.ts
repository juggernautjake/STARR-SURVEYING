// app/api/admin/files/[id]/permissions/route.ts
//
// F7 of FILE_EXPLORER_2026-06-25 — read/write a node's permissions.
//
//   GET → { node, grants, inheritedFrom }   (requires manage)
//   PUT { permission_mode, grants } → replace the grant set (requires manage)
//
// Only managers (owners, admins, or anyone granted 'manage') can change who can
// access a node. System folders and personal roots are protected.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin, ALL_ROLES, type UserRole } from '@/lib/auth';
import { accessForNode, loadGrants, replaceGrants } from '@/lib/files/server';
import { canManage, type FileUser, type PermissionGrant } from '@/lib/files/permissions';

const ACCESS_LEVELS = ['view', 'download', 'edit', 'manage'] as const;
type GrantAccess = (typeof ACCESS_LEVELS)[number];
const ROLE_SET = new Set<string>(ALL_ROLES as readonly string[]);

function sessionUser(session: { user?: { email?: string | null; roles?: string[] } } | null): FileUser | null {
  if (!session?.user?.email) return null;
  return { email: session.user.email, roles: session.user.roles ?? [] };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = isAdmin(session!.user!.roles);

  const { chain, access } = await accessForNode(params.id, user, admin);
  if (chain.length === 0) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  if (!canManage(access)) return NextResponse.json({ error: 'You cannot manage this item’s permissions.' }, { status: 403 });

  const node = chain[chain.length - 1];
  const grantsMap = await loadGrants([node.id]);

  // For display when inheriting: name the nearest 'custom' ancestor.
  let inheritedFrom: string | null = null;
  if (node.permission_mode === 'inherit') {
    for (let i = chain.length - 2; i >= 0; i--) {
      if (chain[i].permission_mode === 'custom') {
        inheritedFrom = chain[i].name;
        break;
      }
    }
  }

  return NextResponse.json({
    node: {
      id: node.id,
      name: node.name,
      node_type: node.node_type,
      permission_mode: node.permission_mode,
      owner_email: node.owner_email,
      is_system: node.is_system,
      is_personal_root: node.is_personal_root,
    },
    grants: grantsMap.get(node.id) ?? [],
    inheritedFrom,
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = isAdmin(session!.user!.roles);

  const { chain, access } = await accessForNode(params.id, user, admin);
  if (chain.length === 0) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  if (!canManage(access)) return NextResponse.json({ error: 'You cannot manage this item’s permissions.' }, { status: 403 });
  const node = chain[chain.length - 1];
  if (node.is_personal_root) {
    return NextResponse.json({ error: 'Personal folders are private and can’t be re-shared.' }, { status: 400 });
  }
  if (node.is_system && !admin) {
    return NextResponse.json({ error: 'Only an admin can change a system folder’s permissions.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { permission_mode?: string; grants?: unknown[] };
  const mode = body.permission_mode === 'custom' ? 'custom' : 'inherit';

  const grants: PermissionGrant[] = [];
  if (mode === 'custom' && Array.isArray(body.grants)) {
    const seen = new Set<string>();
    for (const raw of body.grants) {
      const g = raw as { grantee_type?: string; grantee_value?: string | null; access_level?: string };
      const level = g.access_level as GrantAccess;
      if (!ACCESS_LEVELS.includes(level)) {
        return NextResponse.json({ error: `Invalid access level: ${g.access_level}.` }, { status: 400 });
      }
      let grantee_type: PermissionGrant['grantee_type'];
      let grantee_value: string | null;
      if (g.grantee_type === 'everyone') {
        grantee_type = 'everyone';
        grantee_value = null;
      } else if (g.grantee_type === 'role') {
        const role = (g.grantee_value ?? '').trim() as UserRole;
        if (!ROLE_SET.has(role)) return NextResponse.json({ error: `Unknown role: ${g.grantee_value}.` }, { status: 400 });
        grantee_type = 'role';
        grantee_value = role;
      } else if (g.grantee_type === 'user') {
        const email = (g.grantee_value ?? '').trim().toLowerCase();
        if (!email || !email.includes('@')) return NextResponse.json({ error: 'A user grant needs a valid email.' }, { status: 400 });
        grantee_type = 'user';
        grantee_value = email;
      } else {
        return NextResponse.json({ error: `Invalid grantee type: ${g.grantee_type}.` }, { status: 400 });
      }
      const key = `${grantee_type}:${grantee_value ?? ''}`;
      if (seen.has(key)) continue; // last write wins is fine; just dedupe identical grantees
      seen.add(key);
      grants.push({ grantee_type, grantee_value, access_level: level });
    }
  }

  const result = await replaceGrants(node.id, mode, grants);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, permission_mode: mode, grants });
}
