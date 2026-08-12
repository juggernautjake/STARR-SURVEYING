// app/api/admin/files/search/route.ts — find a file. F2.
//
// The explorer had no search of any kind. This is the endpoint behind the box.
//
// ── IT SEARCHES THE MOUNTS TOO ──────────────────────────────────────────────────────────────────
//
// Half the firm's files do not live in `file_nodes` at all — receipts, job files, research
// documents, field media and now drawings are read-only mounts synthesized from their own tables
// (`lib/files/mounts.ts`). A search that quietly covered only `file_nodes` would be worse than no
// search: it would answer "no such file" about a receipt that is sitting right there in the tree.
//
// Mount search reuses `listMount` and filters its result rather than adding a second query per
// source. That is deliberate — `listMount` is where each source's role gate and its shape live, and
// a parallel query path would be a second place for those to be got wrong. The cost is that mount
// search only covers what `listMount` returns (its own 500-row cap, newest first), so the response
// says so in `mount_capped` rather than implying it looked at everything.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { searchNodes, kindOf, type SearchHit } from '@/lib/files/server';
import { listMount, mountRootNodes, MOUNT_PREFIX } from '@/lib/files/mounts';
import type { FileUser } from '@/lib/files/permissions';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  const admin = isAdmin(session.user.roles);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  // `kind=image,pdf` — repeated or comma-separated, both work, because both are things people type.
  const kinds = searchParams
    .getAll('kind')
    .flatMap((k) => k.split(','))
    .map((k) => k.trim())
    .filter(Boolean);

  const result = await searchNodes(q, user, admin, { kinds });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  // ── Mounts ────────────────────────────────────────────────────────────────────────────────────
  const term = q.trim().toLowerCase();
  const mountHits: SearchHit[] = [];
  let mountCapped = false;
  if (term.length >= 2) {
    // Only the sources this user may see — `mountRootNodes` already applies the role gate, so the
    // loop below cannot reach a source they have no business searching.
    for (const root of mountRootNodes(user, admin)) {
      const key = root.id.slice(MOUNT_PREFIX.length);
      const listed = await listMount(root.id, user, admin);
      if (!listed.ok || !listed.nodes) continue;
      if (listed.nodes.length >= 500) mountCapped = true;
      for (const n of listed.nodes) {
        if (!n.name.toLowerCase().includes(term)) continue;
        if (kinds.length > 0 && !kinds.includes(kindOf(n.mime_type, n.name))) continue;
        mountHits.push({
          // Mounted nodes are synthesized and carry none of the `file_nodes` columns. The gaps are
          // filled with honest nulls rather than invented values — a mounted file has no owner row,
          // no permission mode and no storage bucket of its own.
          id: n.id,
          parent_id: root.id,
          node_type: n.node_type,
          name: n.name,
          owner_email: null,
          is_personal_root: false,
          is_system: true,
          permission_mode: 'inherit',
          storage_bucket: null,
          storage_path: null,
          mime_type: n.mime_type,
          size_bytes: n.size_bytes,
          created_by: null,
          created_at: n.updated_at,
          updated_at: n.updated_at,
          access: n.access,
          path: root.name,
          ...(n.open_href ? { open_href: n.open_href } : {}),
        } as SearchHit);
      }
    }
  }

  const hits = [...(result.hits ?? []), ...mountHits];

  return NextResponse.json({
    hits,
    // Deliberately NOT a total. Reporting "showing 12 of 400" over a permission-filtered set tells
    // the caller how many files exist that they may not see. `truncated` says only "there may be
    // more", which reveals nothing about what was filtered out.
    truncated: !!result.truncated,
    mount_capped: mountCapped,
  });
}, { routeName: 'admin/files/search' });
