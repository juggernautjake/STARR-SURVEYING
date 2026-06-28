// app/api/admin/files/[id]/permissions/preview/route.ts
//
// F7 of FILE_EXPLORER_2026-06-25 — "who can access" preview. Given a PROPOSED
// permission_mode + grants for this node (not yet saved), compute every company
// person's effective access using the real ancestor chain (so inheritance,
// owner, and admin overrides are all accurate). Requires manage on the node.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { getNodeChain, loadGrants, nodeToNWG, listCompanyPeople } from '@/lib/files/server';
import {
  resolveAccess,
  canManage,
  type AccessLevel,
  type FileUser,
  type NodeWithGrants,
  type PermissionGrant,
} from '@/lib/files/permissions';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const me: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  const meAdmin = isAdmin(session.user.roles);

  const chain = await getNodeChain(params.id);
  if (chain.length === 0) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  const grantsMap = await loadGrants(chain.map((n) => n.id));
  const myAccess = resolveAccess(
    chain.map((n) => nodeToNWG(n, grantsMap.get(n.id) ?? [])),
    me,
    meAdmin,
  );
  if (!canManage(myAccess)) return NextResponse.json({ error: 'You cannot manage this item’s permissions.' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { permission_mode?: string; grants?: PermissionGrant[] };
  const proposedMode = body.permission_mode === 'custom' ? 'custom' : 'inherit';
  const proposedGrants = Array.isArray(body.grants) ? body.grants : [];

  // Build the chain NWG, swapping this node's mode/grants for the proposed ones.
  const nwg: NodeWithGrants[] = chain.map((n) =>
    n.id === params.id
      ? { id: n.id, permission_mode: proposedMode, owner_email: n.owner_email, grants: proposedGrants }
      : nodeToNWG(n, grantsMap.get(n.id) ?? []),
  );

  const people = await listCompanyPeople();
  const rows = people.map((p) => {
    const pAdmin = (p.roles ?? []).some((r) => r === 'admin' || r === 'developer');
    const access: AccessLevel = resolveAccess(nwg, { email: p.email, roles: p.roles ?? [] }, pAdmin);
    return { email: p.email, name: p.name, access };
  });

  // "Everyone signed in" — a baseline user with no roles / matching email.
  const everyone: AccessLevel = resolveAccess(nwg, { email: '', roles: [] }, false);

  return NextResponse.json({ rows, everyone });
}
