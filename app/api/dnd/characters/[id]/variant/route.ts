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
import { readVariants, readActiveSlotMeta, withActiveSlotMeta, type ActiveSheet, type SheetVariantKind } from '@/lib/dnd/system-variants';
import { sheetExceptions } from '@/lib/dnd/slots/sheet-exceptions';
import { describeException } from '@/lib/dnd/slots/entitlement';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await req.json().catch(() => ({}))) as { kind?: string };
  // 'altered-vanilla' joined the union 2026-07-26 (a rules-legal build with named exceptions). Validated
  // against the list rather than a pair of ternaries so a fourth kind can't be silently rejected here.
  const KINDS: SheetVariantKind[] = ['vanilla', 'altered-vanilla', 'custom'];
  const kind = KINDS.find((k) => k === body.kind) ?? null;
  if (!kind) {
    return NextResponse.json({ error: `Body must be { kind: ${KINDS.map((k) => `'${k}'`).join(' | ')} }.` }, { status: 400 });
  }

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

  // "Plain vanilla" is a CLAIM, and the sheet can contradict it. A character holding recorded exceptions —
  // picks its class and level do not grant, taken deliberately through the escape hatch — is altered
  // vanilla whatever this request asks for, so asking for `vanilla` here resolves to that instead of
  // stamping a label the ledger disproves. The badge stays derived from the sheet everywhere (S6/S8b);
  // this endpoint is the one place a human could otherwise have overridden it into a falsehood.
  //
  // Going to `custom` is untouched: that is a real, meaningful choice (stop claiming to follow the rules),
  // and it is reversible — nothing on the sheet is deleted either way.
  const exceptions = sheetExceptions(row.data, normalizeSystem(row.system));
  const effectiveKind: SheetVariantKind = kind === 'vanilla' && exceptions.length ? 'altered-vanilla' : kind;

  const active: ActiveSheet = {
    system: normalizeSystem(row.system),
    data: row.data,
    sheet_type: row.sheet_type ?? '',
    slotId: meta.slotId,
    kind: effectiveKind,
    name: meta.name,
  };
  const nextVariants = withActiveSlotMeta(variants, active);

  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ system_variants: nextVariants })
    .eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Could not update the character.' }, { status: 500 });

  return NextResponse.json({
    ok: true,
    kind: effectiveKind,
    ...(effectiveKind !== kind
      ? { note: `This character still holds ${exceptions.length} recorded exception${exceptions.length === 1 ? '' : 's'}, so it stays altered vanilla until ${exceptions.length === 1 ? 'it is' : 'they are'} removed.`, exceptions: exceptions.map(describeException) }
      : {}),
  });
}
