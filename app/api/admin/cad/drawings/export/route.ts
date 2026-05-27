// app/api/admin/cad/drawings/export/route.ts
// GET /api/admin/cad/drawings/export?id=<id>
//
// Returns a single drawing's stored document as a downloadable `.starr`
// (JSON) attachment. Used by the File Manager's drag-a-file-to-the-desktop
// flow (the row's `DownloadURL` DataTransfer points here) and as a plain
// download link. Shared workspace: any authenticated CAD user can export.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('cad_drawings')
    .select('name, document')
    .eq('id', id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Drawing not found' }, { status: 404 });
  }

  const safe = (String(data.name ?? 'drawing').replace(/[^\w.-]+/g, '_') || 'drawing') + '.starr';
  return new NextResponse(JSON.stringify(data.document, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${safe}"`,
    },
  });
});
