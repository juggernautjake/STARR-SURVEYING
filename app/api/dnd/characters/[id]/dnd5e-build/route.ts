// app/api/dnd/characters/[id]/dnd5e-build/route.ts — assemble a 5e character from the manual builder's
// picks and persist it (MB-2b). Owner / assigned-player / DM only (the write chokepoint), mirroring
// pf2-build / ig-build. The manual builder captures the CHOICES; `assembleDnd5e` turns them into an identity
// + abilities patch, which is merged onto the character's `data` and re-normalized so the sheet derives the
// rest (HP, AC, proficiency, class features by level). Feats chosen at build time are recorded as
// source:'Feat' features so the sheet renders them.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { assembleDnd5e, type Dnd5eAssembleInput } from '@/lib/dnd/statgen/assemble5e';
import { blankCharacter, normalizeCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Coerce an untyped abilities blob into a full, sane score map (missing/invalid → 10). */
function readAbilities(raw: unknown): Record<AbilityKey, number> {
  const src = (raw ?? {}) as Partial<Record<AbilityKey, unknown>>;
  const out = {} as Record<AbilityKey, number>;
  for (const k of ABILITY_KEYS) {
    const n = Number(src[k]);
    out[k] = Number.isFinite(n) ? Math.max(1, Math.min(30, Math.round(n))) : 10;
  }
  return out;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const character = access.access.character as unknown as { id: string; name: string; data?: unknown; system?: string };

  const body = (await req.json().catch(() => ({}))) as Partial<Dnd5eAssembleInput> & { name?: string };
  const system = typeof body.system === 'string' ? body.system : character.system ?? 'dnd5e-2024';

  const assembly = assembleDnd5e({
    system,
    level: Number(body.level) || 1,
    name: body.name || character.name,
    species: body.species,
    className: body.className,
    subclass: body.subclass,
    background: body.background,
    abilities: readAbilities(body.abilities),
    backgroundAbilities: body.backgroundAbilities,
    feats: Array.isArray(body.feats) ? body.feats.filter((f): f is string => typeof f === 'string') : [],
  });

  const base: Character = ((character.data as Character | null) ?? blankCharacter(character.name));
  const merged: Character = {
    ...base,
    meta: { ...base.meta, ...assembly.meta },
    abilities: assembly.abilities,
    primaryAbilities: assembly.primaryAbilities,
    // Replace any prior BUILDER feats (source 'Feat') so re-building doesn't stack duplicates; keep other
    // features (class/species/etc.) untouched — those derive from the class registry, not from here.
    // Replace any prior BUILDER feats (source 'Feat') and any prior CLASS features (ids prefixed `cls-`)
    // so rebuilding doesn't stack duplicates or strand the previous class's features on a re-classed
    // character. Everything else the player or DM added is left alone — the id prefix is what makes
    // "features this build owns" separable from "features someone put there".
    features: [
      ...base.features.filter((f) => f.source !== 'Feat' && !f.id.startsWith('cls-')),
      ...assembly.classFeatures,
      ...assembly.feats.map((f) => ({ id: `feat-${slug(f.name)}`, name: f.name, source: 'Feat', body: f.body ? [f.body] : [] })),
    ],
    // The class-derived combat facts. The sheet recomputes HP when the level changes THROUGH ITS OWN
    // setter, reading `combat.hitDiceSize` — but a character built straight to level 8 never trips that
    // setter and had no hit die set, so it kept the blank d8 and `maxHp: 1`. A level-8 Fighter rendered
    // with one hit point. Current HP is only seeded when the character had none to preserve (a rebuild
    // must not silently heal a wounded character back to full).
    combat: {
      ...base.combat,
      ...assembly.combat,
      currentHp: base.combat.maxHp > 1 ? Math.min(base.combat.currentHp, assembly.combat.maxHp) : assembly.combat.currentHp,
    },
    // Save proficiencies come from the class and had no other source, so every manually-built character
    // was proficient in none. Merged per-ability so a hand-set `misc` bonus survives a rebuild.
    saves: Object.fromEntries(
      (Object.keys(base.saves) as (keyof typeof base.saves)[]).map((k) => [
        k, { ...base.saves[k], proficient: !!assembly.saves[k]?.proficient },
      ]),
    ) as Character['saves'],
  };

  const normalized = normalizeCharacter(merged);
  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ data: normalized, name: normalized.meta.name || character.name })
    .eq('id', character.id);
  if (error) return NextResponse.json({ error: 'Could not build the character.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
