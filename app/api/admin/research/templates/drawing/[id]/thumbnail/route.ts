// app/api/admin/research/templates/drawing/[id]/thumbnail/route.ts
//
// GET — Render a preview PNG thumbnail of a drawing template so the
// template-picker UI can show users what each style actually looks like.
// Phase 12 deferred item shipped 2026-05-28 (Slice 105).
//
// Returns image/png directly with browser-friendly cache headers. Caller
// can use this URL straight in an `<img src="...">` tag.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { renderTemplateThumbnail } from '@/lib/research/export.service';
import type { DrawingTemplate } from '@/types/research';

function extractId(req: NextRequest): string | null {
  // /api/admin/research/templates/drawing/<id>/thumbnail
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const ix = parts.indexOf('drawing');
  if (ix < 0 || !parts[ix + 1]) return null;
  return parts[ix + 1];
}

function clampInt(value: string | null, min: number, max: number, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = extractId(req);
  if (!id) {
    return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('drawing_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const width = clampInt(req.nextUrl.searchParams.get('w'), 120, 1200, 480);
  const height = clampInt(req.nextUrl.searchParams.get('h'), 80, 800, 320);

  const png = await renderTemplateThumbnail(data as DrawingTemplate, { width, height });

  // `Buffer` (Node) and `Uint8Array` both satisfy Response BodyInit.
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
      'Content-Length': png.length.toString(),
    },
  });
}, { routeName: 'research/templates/drawing/thumbnail' });
