// app/api/dnd/characters/[id]/levels/route.ts — the level builder's API.
//
// GET  ?to=N  → the plan: what this character still owes before it can be level N.
// POST        → record a choice, and/or commit a level once nothing is owed.
//
// The invariant this route exists to enforce: the character's level only moves when every choice
// at or below the target level has been made. The sheet has no +/- stepper precisely because that
// bypassed this.
import { NextRequest, NextResponse } from 'next/server';
import { getCharacterAccess } from '@/lib/dnd/characters';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizeSystem } from '@/lib/dnd/systems';
import { blankCharacter, normalizeCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';
import { findClass, subclassesFor } from '@/lib/dnd/classes/registry';
import { planLevelUp, recordChoice, validateChoice, chosenSubclassKey, type RecordedChoice } from '@/lib/dnd/classes/levelup';
import { clampLevel } from '@/lib/dnd/classes/engine';

/** Read the character + its recorded build choices. */
async function load(id: string) {
  const res = await getCharacterAccess(id);
  if (!res.access) return { error: res.error, status: res.status } as const;
  const row = res.access.character;
  const data = normalizeCharacter((row.data as unknown) ?? blankCharacter(row.name));
  return { access: res.access, row, data } as const;
}

function planFor(data: Character, system: string, to: number) {
  const choices = (data.build?.choices ?? []) as RecordedChoice[];
  const className = data.meta?.className ?? '';
  const def = findClass(system, data.build?.classKey || className);
  const level = clampLevel(data.meta?.level ?? 1);

  if (!def) {
    // No official class attached — we can't walk a level table we don't have. Say so honestly
    // rather than inventing choices; the UI offers the AI homebrew path instead.
    return {
      level,
      maxLevel: 20,
      className: className || null,
      classKnown: false,
      outstanding: [],
      gained: [],
      ready: true,
      choices,
    };
  }

  const subs = subclassesFor(def.key);
  const subKey = data.build?.subclassKey || chosenSubclassKey(choices);
  const sub = subs.find((s) => s.key === subKey) ?? null;
  const proficientSkills = Object.entries(data.skills ?? {})
    .filter(([, v]) => v?.prof === 'proficient' || v?.prof === 'expertise')
    .map(([k]) => k);

  const plan = planLevelUp(def, { from: level, to, recorded: choices, subclasses: subs, subclass: sub, proficientSkills });
  return {
    level,
    maxLevel: 20,
    className: def.name,
    classKnown: true,
    outstanding: plan.outstanding,
    gained: plan.gained,
    ready: plan.ready,
    choices,
  };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await load(params.id);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const to = clampLevel(Number(new URL(req.url).searchParams.get('to')) || (r.data.meta?.level ?? 1));
  const system = normalizeSystem((r.row as { system?: string }).system);
  return NextResponse.json(planFor(r.data, system, to));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await load(params.id);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  if (!r.access.canWrite) return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const system = normalizeSystem((r.row as { system?: string }).system);
  const to = clampLevel(Number(body?.to) || (r.data.meta?.level ?? 1));
  const next: Character = { ...r.data };
  next.build = { ...(next.build ?? {}), choices: [...((next.build?.choices ?? []) as RecordedChoice[])] };

  // ── 1. record a choice, if one was sent ───────────────────────────────────
  const choice = body?.choice as RecordedChoice | undefined;
  if (choice) {
    if (!choice.kind || typeof choice.level !== 'number') {
      return NextResponse.json({ error: 'A choice needs a level and a kind.' }, { status: 400 });
    }
    const def = findClass(system, next.build?.classKey || next.meta?.className || '');
    const subs = def ? subclassesFor(def.key) : [];
    const proficientSkills = Object.entries(next.skills ?? {})
      .filter(([, v]) => v?.prof === 'proficient' || v?.prof === 'expertise')
      .map(([k]) => k);

    // Feats the character already has (to block retaking a non-repeatable one) and whether they can
    // cast (to satisfy a feat's spellcasting prerequisite) — so the ASI-slot feat check is rules-legal.
    const takenFeatKeys = ((next.build?.choices ?? []) as RecordedChoice[])
      .filter((c) => c.kind === 'asi' && c.featKey)
      .map((c) => c.featKey as string);
    const canCast = !!next.spellcasting || !!def?.spellcasting;

    const v = validateChoice(choice, {
      abilities: next.abilities,
      takenFeatKeys,
      has: canCast ? ['spellcasting'] : [],
      legalSkills: choice.kind === 'expertise' ? proficientSkills : undefined,
      // A subclass must be one of the registered options — unless it's a homebrew write-in,
      // which the builder marks and the DM reviews.
      legalOptions: choice.kind === 'subclass' && subs.length && !choice.homebrew ? subs.map((s) => s.key) : undefined,
    });
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    next.build.choices = recordChoice(next.build.choices as RecordedChoice[], choice);
    if (choice.kind === 'subclass' && choice.value) {
      next.build.subclassKey = choice.value;
      const sub = subs.find((s) => s.key === choice.value);
      if (sub) next.meta = { ...next.meta, subclass: sub.name };
    }
    // An ASI's ability increases are replayed onto the sheet so the scores stay in sync.
    if (choice.kind === 'asi' && !choice.featKey) {
      const abilities = { ...next.abilities };
      for (const a of choice.abilities ?? []) if (abilities[a] != null) abilities[a] = Math.min(20, abilities[a] + 1);
      next.abilities = abilities;
    }
    if (choice.kind === 'expertise') {
      const skills = { ...next.skills };
      for (const s of choice.skills ?? []) if (skills[s]) skills[s] = { ...skills[s], prof: 'expertise' };
      next.skills = skills;
    }
  }

  // ── 2. commit the level, but only if nothing is owed ──────────────────────
  const commitLevel = body?.commitLevel != null ? clampLevel(Number(body.commitLevel)) : null;
  if (commitLevel) {
    const check = planFor(next, system, commitLevel);
    if (!check.ready) {
      return NextResponse.json(
        { error: `Level ${commitLevel} still has ${check.outstanding.length} choice(s) to make.`, ...check },
        { status: 409 },
      );
    }
    next.meta = { ...next.meta, level: commitLevel };
  }

  const { error } = await supabaseAdmin.from('dnd_characters').update({ data: next }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(planFor(next, system, Math.max(to, commitLevel ?? 0)));
}
