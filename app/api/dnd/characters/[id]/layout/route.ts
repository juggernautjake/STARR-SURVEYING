// app/api/dnd/characters/[id]/layout/route.ts — set the character's TEMPLATE (the `sheetLayout`
// format axis: classic / codex / dashboard / play).
//
// The template lives INSIDE the `data` blob (`data.sheetLayout`), not a column — so unlike the skin
// (a `sheet_type` column the generic PATCH handles), setting it means reading the current data and
// patching the one field. This endpoint does exactly that, server-side, so the page-chrome
// TemplateBrowser can set it for EVERY system — including PF2/IG, where the 5e store's `setChar`
// (the old in-engine LayoutSwitch's path) is not in scope.
//
// Owner/DM-scoped like every character write. The chosen layout is validated against what the
// character's OWN system can actually render (`isTemplateBuiltFor`), so a request can never park a
// character on a format its system has no shell for.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { normalizeSystem } from '@/lib/dnd/systems';
import { isTemplateBuiltFor } from '@/lib/dnd/sheet-templates';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await req.json().catch(() => ({}))) as { layout?: string };
  const row = access.access.character as unknown as { id: string; system?: string; data?: Record<string, unknown> | null };
  const system = normalizeSystem(row.system);

  if (!isTemplateBuiltFor(system, body.layout)) {
    return NextResponse.json({ error: `That template is not available for this character's system.` }, { status: 400 });
  }

  // Patch the single field on the existing data blob. A missing/legacy data blob is treated as an
  // empty object so a brand-new character can still pick a layout.
  const data = { ...(row.data ?? {}), sheetLayout: body.layout };
  const { error } = await supabaseAdmin.from('dnd_characters').update({ data }).eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Could not update the template.' }, { status: 500 });

  return NextResponse.json({ ok: true, layout: body.layout });
}
