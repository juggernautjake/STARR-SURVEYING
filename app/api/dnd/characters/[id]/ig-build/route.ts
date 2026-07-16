// app/api/dnd/characters/[id]/ig-build/route.ts — assemble an Intuitive Games character from vanilla picks
// and persist it (IG builder Slice 7c). Owner/assigned-player/DM only (the write chokepoint). Runs the pure
// `assembleIGVanillaCharacter`, writes the result to the character's `data`, and returns the live provenance
// summary so the builder can show exactly what's vanilla vs custom. Custom picks are allowed here (they're
// flagged, not blocked) — the vanilla-only gate is enforced at submission (/submit), not at build time.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { assembleIGVanillaCharacter, type IGPicks } from '@/lib/dnd/systems/intuitive-games/builder';
import { summarizeCharacterProvenance, type ElementKind } from '@/lib/dnd/provenance';

const strArr = (v: unknown): string[] => Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { character } = access.access;

  const body = await req.json().catch(() => ({}));
  const p = (body?.picks ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => typeof v === 'string' ? v.trim() : undefined;
  // Ability scores: keep only the six valid keys, clamp to a sane range.
  const abilities: Record<string, number> = {};
  if (p.abilities && typeof p.abilities === 'object') {
    for (const k of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
      const v = (p.abilities as Record<string, unknown>)[k];
      if (v != null && Number.isFinite(+(v as number))) abilities[k] = Math.max(1, Math.min(30, Math.round(+(v as number))));
    }
  }
  const picks: IGPicks = {
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : character.name,
    ancestry: str(p.ancestry), className: str(p.className), subclass: str(p.subclass),
    specialization: str(p.specialization), background: str(p.background), defensivePower: str(p.defensivePower),
    alignment: str(p.alignment), culture: str(p.culture), bio: str(p.bio),
    companionType: str(p.companionType), companionName: str(p.companionName),
    abilities: Object.keys(abilities).length ? abilities : undefined,
    level: Number.isFinite(+(p.level as number)) ? Math.max(1, Math.min(10, Math.round(+(p.level as number)))) : 1,
    stances: strArr(p.stances), powers: strArr(p.powers), feats: strArr(p.feats),
    weapons: strArr(p.weapons), weaponTypes: strArr(p.weaponTypes),
  };

  const assembled = assembleIGVanillaCharacter(picks);
  const dmGranted = (Array.isArray(character.dm_granted) ? character.dm_granted : []) as { kind?: ElementKind; name: string; grantedBy?: string | null; mechanics?: string | null }[];
  const summary = summarizeCharacterProvenance(assembled, 'intuitive-games', dmGranted);

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
