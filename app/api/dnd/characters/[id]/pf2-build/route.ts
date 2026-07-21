// app/api/dnd/characters/[id]/pf2-build/route.ts — assemble a Pathfinder 2e character from vanilla picks
// and persist it. Owner/assigned-player/DM only (the write chokepoint). Runs the pure
// `assemblePF2VanillaCharacter`, writes the result (shared-engine projection + the pf2e sidecar) to the
// character's `data`, and returns the live provenance summary so the builder can show vanilla vs custom.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { assemblePF2VanillaCharacter } from '@/lib/dnd/systems/pathfinder2e/builder';
import { parsePF2Picks } from '@/lib/dnd/systems/pathfinder2e/ai';
import { summarizeCharacterProvenance, type ElementKind } from '@/lib/dnd/provenance';
import { gatePf2Picks } from '@/lib/dnd/systems/pathfinder2e/rules-gate';
import { PF2_ALL_FEATS, PF2_ALL_SPELLS } from '@/lib/dnd/systems/pathfinder2e/data';
import { pf2Class } from '@/lib/dnd/systems/pathfinder2e/content';
import { readActiveSlotMeta } from '@/lib/dnd/system-variants';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { character } = access.access;

  const body = await req.json().catch(() => ({}));
  const picks = parsePF2Picks(body?.picks ?? {});
  if (!picks.name) picks.name = character.name;

  // Rules gate at BUILD time (S16). Without this the builder could assemble a vanilla character
  // holding feats and spells its class and level do not grant — the sheet's own pickers enforce,
  // so leaving the builder open would just move the hole rather than close it.
  const buildVariant = readActiveSlotMeta((character as { system_variants?: unknown }).system_variants).kind ?? 'vanilla';
  const tradition = pf2Class(picks.className ?? '')?.spellcasting?.tradition;
  const buildGate = gatePf2Picks(picks, {
    enforce: !access.access.isDM && buildVariant === 'vanilla',
    unboundReason: access.access.isDM ? 'dm-grant' : buildVariant === 'custom' ? 'custom-character' : undefined,
  }, { feats: PF2_ALL_FEATS, spells: PF2_ALL_SPELLS }, tradition);
  if (buildGate.refused.length) {
    return NextResponse.json({
      error: `This is a vanilla character, so it can only take what its class and level grant. Remove or change: ${
        buildGate.refused.map((r) => `${r.name} (${r.reason})`).join('; ')
      } — or build a custom character instead.`,
      refused: buildGate.refused,
    }, { status: 400 });
  }

  const assembled = assemblePF2VanillaCharacter(picks);
  const dmGranted = (Array.isArray(character.dm_granted) ? character.dm_granted : []) as { kind?: ElementKind; name: string; grantedBy?: string | null; mechanics?: string | null }[];
  const summary = summarizeCharacterProvenance(assembled, 'pathfinder2e', dmGranted);

  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ data: assembled, name: assembled.meta.name || character.name })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    summary: { vanilla: summary.vanilla.length, custom: summary.custom.length, dmGranted: summary.dmGranted.length, hasBlockingCustom: summary.hasBlockingCustom },
    elements: summary.elements,
  });
}
