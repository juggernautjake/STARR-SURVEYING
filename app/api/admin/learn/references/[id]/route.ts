// app/api/admin/learn/references/[id]/route.ts — remove a reference document (admin).
// Deletes the doc (chunks cascade) and the stored original. Admin/content-manager gated.
import { NextRequest, NextResponse } from 'next/server';
import { auth, canManageContent } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

const BUCKET = 'learn-references';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canManageContent(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: row } = await supabaseAdmin.from('fs_reference_docs').select('storage_path').eq('id', params.id).maybeSingle();
    const { error } = await supabaseAdmin.from('fs_reference_docs').delete().eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const path = (row as { storage_path: string | null } | null)?.storage_path;
    if (path) {
      try { await supabaseAdmin.storage.from(BUCKET).remove([path]); } catch { /* orphan cleanup best-effort */ }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Delete failed.' }, { status: 500 });
  }
}
