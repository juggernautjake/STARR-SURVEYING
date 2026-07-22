// app/api/dnd/characters/[id]/theme/route.ts — set the character's colour THEME (U-3).
//
// The theme (`skinVariant`) is the COLOUR axis — one of the 5 universal palettes (or the streamer's 2).
// It lives inside the `data` blob (`data.skinVariant`), like the layout and roller axes, so setting it is
// a read-patch-write of the one field and works for EVERY system. The 5e sheet also sets it through its
// store (`setChar`), which writes the same field; this endpoint is what lets the unified chip picker set
// it for the BESPOKE PF2/IG sheets too, which have no store. Twin of `/layout` and `/roller`.
//
// Owner/DM-gated. The chosen key is validated against what the character's STYLE can render
// (`isThemeVariant` → `themeVariantsFor(sheet_type)`), so a request can never park a character on a theme
// its style has no palette for. An explicit null/empty clears the choice (back to the style's native colours).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { isThemeVariant } from '@/app/dnd/_sheet/theme';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await req.json().catch(() => ({}))) as { theme?: string | null };
  const row = access.access.character as unknown as { id: string; sheet_type?: string; data?: Record<string, unknown> | null };

  // null / '' clears the theme (native style colours); otherwise it must be a theme this style can render.
  const clearing = body.theme == null || body.theme === '';
  if (!clearing && !isThemeVariant(row.sheet_type, body.theme)) {
    return NextResponse.json({ error: 'That theme is not available for this character’s style.' }, { status: 400 });
  }

  const data = { ...(row.data ?? {}) };
  if (clearing) delete data.skinVariant; else data.skinVariant = body.theme;
  const { error } = await supabaseAdmin.from('dnd_characters').update({ data }).eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Could not update the theme.' }, { status: 500 });

  return NextResponse.json({ ok: true, theme: clearing ? null : body.theme });
}
