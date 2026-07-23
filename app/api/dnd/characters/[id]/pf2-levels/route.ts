// app/api/dnd/characters/[id]/pf2-levels/route.ts — the PF2 level-by-level builder's API (B9), the PF2
// mirror of the 5e `/levels` route.
//
// GET  ?to=N  → the plan: what this PF2 character still owes (feat slots, subclass, attribute boosts)
//               before it can be level N, from the tested `pf2PlanLevelUp`.
// POST        → record one choice, and/or commit a level once nothing at-or-below the target is owed.
//
// Same invariant as 5e: the character's level only moves when every choice up to the target is made. PF2
// only — 5e uses `/levels`, IG has no per-level progression yet.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCharacterAccess, requireCharacterWrite } from '@/lib/dnd/characters';
import { normalizeSystem } from '@/lib/dnd/systems';
import { blankCharacter, normalizeCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';
import type { PF2Build } from '@/lib/dnd/systems/pathfinder2e/builder';
import {
  pf2PlanLevelUp,
  pf2RecordChoice,
  type PF2RecordedChoice,
  type PF2ChoiceKind,
} from '@/lib/dnd/systems/pathfinder2e/levelup';

const MAX_LEVEL = 20;
const clampLevel = (n: unknown) => Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(n) || 1)));

type PF2Data = Character & { pf2Build?: PF2Build };

/** The recorded choices + the class name + current level a PF2 character carries. */
function buildState(data: PF2Data) {
  const className = data.meta?.className ?? '';
  const level = clampLevel(data.meta?.level ?? 1);
  const choices = (data.pf2Build?.choices ?? []) as PF2RecordedChoice[];
  return { className, level, choices };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  const row = res.access.character;
  const system = normalizeSystem((row as { system?: string }).system);
  if (system !== 'pathfinder2e') {
    return NextResponse.json({ error: 'This is the Pathfinder 2e level route. (5e uses /levels.)' }, { status: 400 });
  }
  const data = normalizeCharacter((row.data as unknown) ?? blankCharacter(row.name)) as PF2Data;
  const { className, level, choices } = buildState(data);
  const to = clampLevel(req.nextUrl.searchParams.get('to') ?? level);
  const plan = pf2PlanLevelUp({ className, to, recorded: choices, from: level });
  return NextResponse.json({ plan, className, level, choices });
}

/** Coerce an untrusted choice payload into a clean PF2RecordedChoice (or null if unusable). */
function readChoice(raw: unknown): PF2RecordedChoice | null {
  const c = (raw ?? {}) as Record<string, unknown>;
  const kind = c.kind as PF2ChoiceKind;
  if (kind !== 'subclass' && kind !== 'feat' && kind !== 'boosts') return null;
  const level = clampLevel(c.level);
  if (kind === 'boosts') {
    const attributes = Array.isArray(c.attributes) ? c.attributes.filter((a): a is string => typeof a === 'string') : [];
    return { level, kind, attributes: attributes as PF2RecordedChoice['attributes'] };
  }
  const value = typeof c.value === 'string' ? c.value : '';
  const track = kind === 'feat' && typeof c.track === 'string' ? (c.track as PF2RecordedChoice['track']) : undefined;
  return { level, kind, value, ...(track ? { track } : {}) };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const row = access.access.character as unknown as { id: string; name: string; system?: string; data?: unknown };
  const system = normalizeSystem(row.system);
  if (system !== 'pathfinder2e') {
    return NextResponse.json({ error: 'This is the Pathfinder 2e level route. (5e uses /levels.)' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { choice?: unknown; commitTo?: unknown };
  const data = normalizeCharacter((row.data as unknown) ?? blankCharacter(row.name)) as PF2Data;
  const { className, level } = buildState(data);
  let choices = (data.pf2Build?.choices ?? []) as PF2RecordedChoice[];

  // 1) Record a choice, if one was sent.
  if (body.choice != null) {
    const choice = readChoice(body.choice);
    if (!choice) return NextResponse.json({ error: 'That choice is malformed.' }, { status: 400 });
    choices = pf2RecordChoice(choices, choice);
  }

  // 2) Commit a level, if requested and nothing is owed up to it. Only ever moves the level UP through a
  //    fully-resolved plan — never past an outstanding choice, mirroring 5e's invariant.
  let newLevel = level;
  const commitTo = body.commitTo != null ? clampLevel(body.commitTo) : null;
  if (commitTo != null) {
    const plan = pf2PlanLevelUp({ className, to: commitTo, recorded: choices, from: level });
    if (!plan.ready) {
      return NextResponse.json(
        { error: `Level ${commitTo} still needs ${plan.outstanding.length} choice(s).`, plan, choices },
        { status: 409 },
      );
    }
    newLevel = commitTo;
  }

  const nextData: PF2Data = {
    ...data,
    meta: { ...data.meta, level: newLevel },
    pf2Build: { ...(data.pf2Build ?? {}), choices },
  };
  const { error } = await supabaseAdmin.from('dnd_characters').update({ data: nextData }).eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Could not save the level choices.' }, { status: 500 });

  const plan = pf2PlanLevelUp({ className, to: Math.max(newLevel, commitTo ?? newLevel), recorded: choices, from: newLevel });
  return NextResponse.json({ ok: true, level: newLevel, choices, plan });
}
