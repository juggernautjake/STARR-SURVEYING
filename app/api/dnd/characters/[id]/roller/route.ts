// app/api/dnd/characters/[id]/roller/route.ts — set the character's ROLLER TEMPLATE (RO-2).
//
// The roller template is chosen PER PAGE, independently of the sheet template (owner 2026-07-22), and
// lives inside the `data` blob (`data.rollerTemplate`) exactly like `data.sheetLayout` — so setting it
// is a read-patch-write of the one field, server-side, and works for EVERY system (5e engine, PF2, IG)
// where the 5e store's `setChar` is not in scope. Twin of the `/layout` endpoint.
//
// No per-system validation: every roller template is a pure presentation of the same roll data, so all
// four are valid for any character. We validate only that the key is one of the four (`isRollerTemplate`).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { isRollerTemplate } from '@/lib/dnd/roller-templates';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await req.json().catch(() => ({}))) as { roller?: string };
  if (!isRollerTemplate(body.roller)) {
    return NextResponse.json({ error: 'Unknown roller template.' }, { status: 400 });
  }

  const row = access.access.character as unknown as { id: string; data?: Record<string, unknown> | null };
  const data = { ...(row.data ?? {}), rollerTemplate: body.roller };
  const { error } = await supabaseAdmin.from('dnd_characters').update({ data }).eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Could not update the roller.' }, { status: 500 });

  return NextResponse.json({ ok: true, roller: body.roller });
}
