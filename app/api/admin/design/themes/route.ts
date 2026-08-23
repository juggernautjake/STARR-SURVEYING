// app/api/admin/design/themes/route.ts — the saved themes and palettes.
//
//   GET    /api/admin/design/themes                → { themes, palettes }
//   POST   /api/admin/design/themes { theme }      → { theme }    save or update
//   POST   /api/admin/design/themes { palette }    → { palette }
//   DELETE /api/admin/design/themes?id=…&kind=…    → { ok: true } soft
//
// Phase T5 of docs/planning/completed/DESIGN_THEMES_2026-08-23.md.
//
// A design carries an embedded COPY of its theme; this is the library it was copied FROM. Editing a
// theme here never changes a design already made with it, which is the property that makes it safe
// to keep tuning a theme after you have used it.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isDeveloper(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async () => {
  const { error } = await gate();
  if (error) return error;

  const [themes, palettes] = await Promise.all([
    supabaseAdmin.from('design_themes')
      .select('id, name, tokens, palette_id, is_dark, updated_at')
      .is('deleted_at', null).order('updated_at', { ascending: false }).limit(200),
    supabaseAdmin.from('design_palettes')
      .select('id, name, swatches, seed, harmony, updated_at')
      .is('deleted_at', null).order('updated_at', { ascending: false }).limit(200),
  ]);

  return NextResponse.json({
    themes: ((themes.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const r = row as Record<string, unknown>;
      return { id: r.id, name: r.name, tokens: r.tokens, paletteId: r.palette_id ?? null, isDark: r.is_dark };
    }),
    palettes: ((palettes.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const r = row as Record<string, unknown>;
      return { id: r.id, name: r.name, swatches: r.swatches, seed: r.seed, harmony: r.harmony };
    }),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { error, email } = await gate();
  if (error) return error;

  const body = await req.json().catch(() => null) as {
    theme?: { id: string; name: string; tokens: Record<string, string>; paletteId?: string | null; isDark?: boolean };
    palette?: { id: string; name: string; swatches: unknown; seed?: string; harmony?: string };
  } | null;

  const now = new Date().toISOString();

  // The palette goes first when both are sent: the theme references it, and a foreign key to a row
  // that does not exist yet is a save that half-works.
  if (body?.palette?.id) {
    const { error: writeError } = await supabaseAdmin.from('design_palettes').upsert({
      id: body.palette.id,
      name: body.palette.name,
      swatches: body.palette.swatches,
      seed: body.palette.seed ?? null,
      harmony: body.palette.harmony ?? null,
      owner_email: email,
      updated_at: now,
      deleted_at: null,
    }, { onConflict: 'id' });
    if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });
  }

  if (body?.theme?.id) {
    if (!body.theme.name?.trim()) {
      return NextResponse.json({ error: 'A theme needs a name to be found again.' }, { status: 400 });
    }
    const { error: writeError } = await supabaseAdmin.from('design_themes').upsert({
      id: body.theme.id,
      name: body.theme.name.trim(),
      tokens: body.theme.tokens ?? {},
      palette_id: body.theme.paletteId ?? null,
      is_dark: body.theme.isDark ?? false,
      owner_email: email,
      updated_at: now,
      deleted_at: null,
    }, { onConflict: 'id' });
    if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });
  }

  return NextResponse.json({ theme: body?.theme ?? null, palette: body?.palette ?? null });
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const { error } = await gate();
  if (error) return error;

  const id = req.nextUrl.searchParams.get('id');
  const kind = req.nextUrl.searchParams.get('kind') ?? 'theme';
  if (!id) return NextResponse.json({ error: 'Which one?' }, { status: 400 });

  const table = kind === 'palette' ? 'design_palettes' : 'design_themes';
  const { error: writeError } = await supabaseAdmin.from(table)
    .update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
});
