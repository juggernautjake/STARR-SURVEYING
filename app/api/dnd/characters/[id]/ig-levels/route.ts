// app/api/dnd/characters/[id]/ig-levels/route.ts — the IG level-by-level builder's API (IG-3), the IG
// mirror of /pf2-levels.
//
// GET  ?to=N  → the plan: what this IG character still owes (trait / feats / boosts / subclass powers /
//               specialization / skill / capstone) before it can be level N, from the scraped schedule.
// POST        → record one choice, and/or commit a level once nothing at-or-below the target is owed.
//
// Same invariant as 5e/PF2: the level only moves when every choice up to the target is made. IG only.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCharacterAccess, requireCharacterWrite } from '@/lib/dnd/characters';
import { normalizeSystem } from '@/lib/dnd/systems';
import { blankCharacter, normalizeCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';
import type { IGBuild } from '@/lib/dnd/systems/intuitive-games/builder';
import {
  igPlanLevelUp,
  igRecordChoice,
  type IGRecordedChoice,
  type IGGainKind,
} from '@/lib/dnd/systems/intuitive-games/levelup';

const clampLevel = (n: unknown) => Math.max(1, Math.min(10, Math.floor(Number(n) || 1)));

type IGData = Character & { igBuild?: IGBuild; ig?: { identity?: { level?: number } } };

const CHOICE_KINDS: IGGainKind[] = [
  'trait', 'ability-boosts', 'feat-general', 'feat-combat', 'skill-proficiency',
  'subclass-power', 'specialization', 'greater-specialization', 'capstone',
];

function buildState(data: IGData) {
  const subclass = data.meta?.subclass || data.meta?.className || '';
  const level = clampLevel(data.meta?.level ?? 1);
  const choices = (data.igBuild?.choices ?? []) as IGRecordedChoice[];
  return { subclass, level, choices };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  const row = res.access.character;
  const system = normalizeSystem((row as { system?: string }).system);
  if (system !== 'intuitive-games') {
    return NextResponse.json({ error: 'This is the Intuitive Games level route.' }, { status: 400 });
  }
  const data = normalizeCharacter((row.data as unknown) ?? blankCharacter(row.name)) as IGData;
  const { subclass, level, choices } = buildState(data);
  const to = clampLevel(req.nextUrl.searchParams.get('to') ?? level);
  const plan = igPlanLevelUp({ subclass, to, recorded: choices, from: level });
  return NextResponse.json({ plan, subclass, level, choices });
}

/** Coerce an untrusted choice payload into a clean IGRecordedChoice (or null if unusable). */
function readChoice(raw: unknown): IGRecordedChoice | null {
  const c = (raw ?? {}) as Record<string, unknown>;
  const kind = c.kind as IGGainKind;
  if (!CHOICE_KINDS.includes(kind)) return null;
  const level = clampLevel(c.level);
  if (kind === 'ability-boosts') {
    const attributes = Array.isArray(c.attributes) ? c.attributes.filter((a): a is string => typeof a === 'string') : [];
    return { level, kind, attributes };
  }
  const value = typeof c.value === 'string' ? c.value : '';
  return { level, kind, value };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const row = access.access.character as unknown as { id: string; name: string; system?: string; data?: unknown };
  const system = normalizeSystem(row.system);
  if (system !== 'intuitive-games') {
    return NextResponse.json({ error: 'This is the Intuitive Games level route.' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { choice?: unknown; commitTo?: unknown };
  const data = normalizeCharacter((row.data as unknown) ?? blankCharacter(row.name)) as IGData;
  const { subclass, level } = buildState(data);
  let choices = (data.igBuild?.choices ?? []) as IGRecordedChoice[];

  // 1) Record a choice, if one was sent.
  if (body.choice != null) {
    const choice = readChoice(body.choice);
    if (!choice) return NextResponse.json({ error: 'That choice is malformed.' }, { status: 400 });
    choices = igRecordChoice(choices, choice);
  }

  // 2) Commit a level, if requested and nothing is owed up to it — the same invariant 5e/PF2 enforce.
  let newLevel = level;
  const commitTo = body.commitTo != null ? clampLevel(body.commitTo) : null;
  if (commitTo != null) {
    const plan = igPlanLevelUp({ subclass, to: commitTo, recorded: choices, from: level });
    if (!plan.ready) {
      return NextResponse.json(
        { error: `Level ${commitTo} still needs ${plan.outstanding.length} choice(s).`, plan, choices },
        { status: 409 },
      );
    }
    newLevel = commitTo;
  }

  const nextData: IGData = {
    ...data,
    meta: { ...data.meta, level: newLevel },
    igBuild: { ...(data.igBuild ?? {}), choices },
    // Keep the IG sidecar's own level in step with meta.level.
    ...(data.ig ? { ig: { ...data.ig, identity: { ...(data.ig.identity ?? {}), level: newLevel } } } : {}),
  };
  const { error } = await supabaseAdmin.from('dnd_characters').update({ data: nextData }).eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Could not save the level choices.' }, { status: 500 });

  const plan = igPlanLevelUp({ subclass, to: Math.max(newLevel, commitTo ?? newLevel), recorded: choices, from: newLevel });
  return NextResponse.json({ ok: true, level: newLevel, choices, plan });
}
