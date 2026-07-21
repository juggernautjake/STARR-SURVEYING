// app/api/dnd/characters/[id]/grant-content/route.ts — give a library entry to a character.
//
// Powers the library's "give to a character" button (owner 2026-07-19). The client sends a
// REFERENCE — kind + name + system — never a SheetEdit[]. That distinction is the whole
// security design: accepting edits directly would turn the edit vocabulary into a
// client-controlled write primitive, letting any caller POST `set_level: 20`. Resolving the
// reference against the real catalogs server-side means you can only ever grant something
// that genuinely exists, exactly as published.
//
// Authorization is the SAME chokepoint every other sheet write uses — requireCharacterWrite,
// i.e. the character's owner, its assigned player, or a DM of a campaign it belongs to.
// Note for lib/dnd/ai-scope.ts readers: this is a user-initiated write that originates
// OUTSIDE the target sheet's own page. It does not widen the boundary — the same gate and the
// same validated op vocabulary apply — but it is the first non-AI cross-page writer.
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { applySheetEdits, validateSheetEdits, editPath, editOldValue, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { normalizeCampaignPreferences } from '@/lib/dnd/preferences';
import { buildGrantEdits, isGrantError, type GrantKind } from '@/lib/dnd/library-grant';
import { readActiveSlotMeta } from '@/lib/dnd/system-variants';
import type { Character } from '@/app/dnd/_sheet/types';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const row = access.access.character as unknown as { campaign_id: string | null; data: Character; name: string; system?: string; system_variants?: unknown };

  const body = await req.json().catch(() => ({}));
  const kind = body.kind as GrantKind;
  const name = String(body.name ?? '');
  // The character's OWN system wins over whatever the client claims, so a grant can never
  // smuggle another edition's mechanics onto this sheet.
  const system = String(row.system ?? body.system ?? '');

  // Rules enforcement (Area MV). Before this, the grant route checked NOTHING — which made it the
  // simplest way to put Wish on a level-4 vanilla Wizard, since the picker's rules lived in the
  // picker and going around the picker went around the rules.
  //
  // Every input here is SERVER-DERIVED: the variant from the character's own stored metadata, the
  // DM flag from the access check, the class and level from the saved sheet. Nothing in `body`
  // influences whether the rules bind, or a caller could simply declare itself custom.
  const kindOfBuild = readActiveSlotMeta(row.system_variants).kind ?? 'vanilla';
  const isDMGrant = access.access.isDM;
  const sheet = row.data;
  const slots = sheet?.spellcasting?.slots ?? {};
  const maxSpellLevel = Object.entries(slots)
    .filter(([, v]) => ((v as { max?: number } | undefined)?.max ?? 0) > 0)
    .map(([k]) => Number(k))
    .reduce((a, b) => Math.max(a, b), 0);

  const outcome = buildGrantEdits({ kind, name, system, options: body.options ?? {} }, {
    // A DM grant and a custom character are both legitimately unbound; everything else obeys.
    enforce: !isDMGrant && kindOfBuild === 'vanilla',
    unboundReason: isDMGrant ? 'dm-grant' : kindOfBuild === 'custom' ? 'custom-character' : undefined,
    character: {
      className: sheet?.meta?.className ?? '',
      level: sheet?.meta?.level ?? 1,
      // Spells already on the sheet count as granted, so a subclass list or an earlier DM gift
      // never reads as illegal on a second look.
      knownSpells: (sheet?.spells ?? []).map((s) => s.name),
      ...(maxSpellLevel > 0 ? { maxSpellLevel } : {}),
    },
  });
  if (isGrantError(outcome)) return NextResponse.json({ error: outcome.error }, { status: 400 });
  const edits: SheetEdit[] = outcome.edits;

  // Effects the registry refuses are DROPPED rather than coerced; report them so a bonus that
  // didn't take is visible instead of silently missing.
  const rejectedEffects = validateSheetEdits(edits);

  // Honour the campaign's equip-limits preference, exactly as the AI path does — otherwise a
  // granted-and-equipped item can land in an illegal loadout.
  let equipLimits: 'enforced' | 'off' = 'enforced';
  if (row.campaign_id) {
    const { data: campRow } = await supabaseAdmin.from('dnd_campaigns').select('theme').eq('id', row.campaign_id).maybeSingle();
    equipLimits = normalizeCampaignPreferences((campRow as { theme?: unknown } | null)?.theme).equipLimits.value;
  }

  const current = row.data;
  // Same `system` the grant itself was built against (the character's own, not the client's
  // claim), so catalog lookups inside the apply cannot fall back to 2024 — CX-17 B1/B2.
  const updated = applySheetEdits(current, edits, { equipLimits, system });
  const { error: upErr } = await supabaseAdmin
    .from('dnd_characters')
    .update({ data: updated, updated_at: new Date().toISOString() })
    .eq('id', params.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Audit under one batch id so the whole grant can be reverted as a unit, same as an AI edit.
  // `source: 'library-grant'` keeps it distinguishable in the review queue.
  const batchId = randomUUID();
  await supabaseAdmin.from('dnd_sheet_edits').insert(
    edits.map((e) => ({
      character_id: params.id,
      editor_user_id: session.userId,
      is_dm: access.access!.isDM,
      field_path: editPath(e),
      old_value: (editOldValue(current, e) ?? null) as unknown,
      new_value: e as unknown,
      scope: 'permanent',
      batch_id: batchId,
      source: 'library-grant',
      summary: outcome.summary,
    })),
  ).then(() => {}, () => {});

  return NextResponse.json({
    ok: true,
    summary: outcome.summary,
    character: { id: params.id, name: row.name },
    rejectedEffects: rejectedEffects.length ? rejectedEffects : undefined,
    batchId,
  });
}
