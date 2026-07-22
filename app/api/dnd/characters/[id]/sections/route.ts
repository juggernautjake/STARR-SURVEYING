// app/api/dnd/characters/[id]/sections/route.ts — set the character's CUSTOM sections (D-13).
//
// Player-authored extra sections live in the `data` blob (`data.customSections`) exactly like
// `data.rollerTemplate` / `data.sheetLayout`, so setting them is a read-patch-write of the one field,
// server-side. This is the persistence path for the bespoke PF2/IG sheets, where the 5e store's live
// `setChar` autosave is not in scope (the 5e sheet writes the field through its store instead). Twin of the
// `/roller` + `/layout` endpoints.
//
// The whole array is posted and re-normalized here (the same pure normalizer the client uses), so a
// malformed or oversized payload can never corrupt the row — unknown block kinds, empty rows/items and
// duplicate ids are all scrubbed before the write.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { normalizeCustomSections } from '@/lib/dnd/custom-sections';

// A defensive ceiling so a runaway client can't bloat the row; well above any real sheet.
const MAX_SECTIONS = 40;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await req.json().catch(() => ({}))) as { sections?: unknown };
  const sections = normalizeCustomSections(body.sections).slice(0, MAX_SECTIONS);

  const row = access.access.character as unknown as { id: string; data?: Record<string, unknown> | null };
  const data = { ...(row.data ?? {}), customSections: sections };
  const { error } = await supabaseAdmin.from('dnd_characters').update({ data }).eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Could not update the sections.' }, { status: 500 });

  return NextResponse.json({ ok: true, sections });
}
