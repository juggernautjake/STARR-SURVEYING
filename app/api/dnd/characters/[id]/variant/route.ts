// app/api/dnd/characters/[id]/variant/route.ts — flip the ACTIVE sheet between vanilla and custom.
//
// "Vanilla" holds the character to its class and level: a vanilla character is hard-blocked from a
// feat or spell its rules do not grant. "Custom" lifts that block — the player may take anything,
// and every off-rules pick is FLAGGED (⚑) rather than refused. This endpoint is the switch between
// the two, so a player can start with a rules-legal character and later open it up to homebrew.
//
// The owner's decision (2026-07-21): the switch is REVERSIBLE. Turning back to vanilla does NOT
// strip the custom content already on the sheet — that content stays, keeps its ⚑ flag, and simply
// cannot be ADDED TO with more off-rules picks until custom is turned back on. So going custom →
// vanilla is safe and loses nothing; it re-arms the gate for future edits, and the customization
// summary keeps showing exactly what is outside the rules. Nothing is deleted here.
//
// Owner/DM-scoped, like every write on a character: it only ever touches this one row's
// `system_variants` active-slot metadata, never the sheet `data`.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { normalizeSystem } from '@/lib/dnd/systems';
import { readVariants, readActiveSlotMeta, withActiveSlotMeta, type ActiveSheet } from '@/lib/dnd/system-variants';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await req.json().catch(() => ({}))) as { kind?: string };
  const kind = body.kind === 'custom' ? 'custom' : body.kind === 'vanilla' ? 'vanilla' : null;
  if (!kind) return NextResponse.json({ error: "Body must be { kind: 'vanilla' | 'custom' }." }, { status: 400 });

  const row = access.access.character as unknown as {
    id: string;
    system?: string;
    system_variants?: unknown;
    data?: unknown;
    sheet_type?: string;
  };

  // Rebuild the active-slot metadata with the new kind, preserving its slotId, name and system.
  // `withActiveSlotMeta` writes the reserved active-slot key back into the variants map from only
  // the slotId/kind/name; every other slot is left untouched. `data`/`sheet_type` are carried
  // through only to satisfy the ActiveSheet shape — they are not written by this call. The system
  // is the character's OWN, read server-side, so the request body can only choose the kind, never
  // re-point the character at another system.
  const variants = readVariants(row.system_variants);
  const meta = readActiveSlotMeta(row.system_variants);
  const active: ActiveSheet = {
    system: normalizeSystem(row.system),
    data: row.data,
    sheet_type: row.sheet_type ?? '',
    slotId: meta.slotId,
    kind,
    name: meta.name,
  };
  const nextVariants = withActiveSlotMeta(variants, active);

  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ system_variants: nextVariants })
    .eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Could not update the character.' }, { status: 500 });

  return NextResponse.json({ ok: true, kind });
}
