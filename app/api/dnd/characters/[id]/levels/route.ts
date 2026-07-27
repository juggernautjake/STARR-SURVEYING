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
import { readHomebrewClasses, readHomebrewFeats, readHomebrewSubclasses } from '@/lib/dnd/classes/homebrew-store';
import { customFeatToFeat } from '@/lib/dnd/feats/homebrew-adapter';
import { featCatalogForSystem } from '@/lib/dnd/feats/catalog';
import { fightingStyles2014 } from '@/lib/dnd/classes/dnd5e-2014/fighting-styles';
import { progressionRows, progressionColumns } from '@/lib/dnd/classes/progression-rows';
import { planLevelUp, recordChoice, validateChoice, chosenSubclassKey, type RecordedChoice } from '@/lib/dnd/classes/levelup';
import { clampLevel } from '@/lib/dnd/classes/engine';
import { readActiveSlotMeta, isRulesEnforcedKind, ACTIVE_SLOT_META_KEY } from '@/lib/dnd/system-variants';
import { unlockOffer, exceptionsIn, variantKindWithExceptions, describeException } from '@/lib/dnd/slots/entitlement';

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
  // Saved homebrew classes resolve exactly like official ones — the registry accepts them as `extra`
  // (Slice 5). So a custom class the player built + saved walks a real level table here.
  const homebrew = readHomebrewClasses(data);
  const def = findClass(system, data.build?.classKey || className, homebrew);
  const level = clampLevel(data.meta?.level ?? 1);
  // The character's saved homebrew feats (adapted to the Feat shape) so they appear in the ASI picker.
  const homebrewFeats = readHomebrewFeats(data).map(customFeatToFeat);

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
      homebrewFeats,
      ready: true,
      choices,
    };
  }

  const subs = subclassesFor(def.system, def.key, readHomebrewSubclasses(data).filter((s) => s.classKey === def.key));
  const subKey = data.build?.subclassKey || chosenSubclassKey(choices);
  const sub = subs.find((s) => s.key === subKey) ?? null;
  const proficientSkills = Object.entries(data.skills ?? {})
    .filter(([, v]) => v?.prof === 'proficient' || v?.prof === 'expertise')
    .map(([k]) => k);

  // The legal Fighting Styles for this character's EDITION, plus any homebrew ones already on the sheet —
  // the same "official + homebrew, offered alike" rule the subclass list follows. Without this the level
  // walker demanded a Fighting Style and then rendered no options to pick from.
  const featPool = [...featCatalogForSystem(def.system), ...homebrewFeats];
  const byCategory = (cat: string) => featPool
    .filter((f) => f.category === cat)
    .map((f) => ({ key: f.key, name: f.name, description: f.benefit ?? f.summary ?? '' }));
  // 2024 models Fighting Styles as feats, so they come from the catalog. 2014 does not — they are a
  // per-class list (a Paladin's four are not a Ranger's four), so they come from their own module.
  // Without this branch the 2014 Fighter/Ranger/Paladin hit the exact bug 2024 just had: a demanded
  // choice with nothing to choose from, because every 2014 feat carries `category: null`.
  const fightingStyles = def.system === 'dnd5e-2014'
    ? [...fightingStyles2014(def.key), ...byCategory('fighting-style')]
    : byCategory('fighting-style');
  const epicBoons = byCategory('epic-boon');   // a 2024 concept; 2014 has none, and correctly returns []

  const plan = planLevelUp(def, { from: level, to, recorded: choices, subclasses: subs, subclass: sub, proficientSkills, fightingStyles, epicBoons });
  return {
    level,
    maxLevel: 20,
    className: def.name,
    classKnown: true,
    outstanding: plan.outstanding,
    gained: plan.gained,
    homebrewFeats,
    // The full 1→20 class table, straight from the class data (Slice 7) — the Progression tab renders
    // this instead of a hand-authored per-character array.
    progression: progressionRows(def, sub, level),
    progressionColumns: progressionColumns(def),
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
    const def = findClass(system, next.build?.classKey || next.meta?.className || '', readHomebrewClasses(next));
    const subs = def ? subclassesFor(def.system, def.key, readHomebrewSubclasses(next).filter((s) => s.classKey === def.key)) : [];
    const proficientSkills = Object.entries(next.skills ?? {})
      .filter(([, v]) => v?.prof === 'proficient' || v?.prof === 'expertise')
      .map(([k]) => k);

    // Feats the character already has (to block retaking a non-repeatable one) and whether they can
    // cast (to satisfy a feat's spellcasting prerequisite) — so the ASI-slot feat check is rules-legal.
    //
    // THE SLOT BEING REPLACED IS EXCLUDED. `recordChoice` replaces the entry at this (level, kind), so a
    // feat already recorded THERE is not "already taken" — it is the thing being overwritten. Without
    // this, re-saving the same feat at the same level (a player correcting an ability spread, or simply
    // re-confirming) is refused as a duplicate it is not.
    //
    // The combination with the escape hatch is what makes it worth fixing rather than tolerating: the
    // spurious refusal would offer "take it anyway", and accepting would file an EXCEPTION against a
    // perfectly legal pick — marking the character "Altered vanilla" for nothing. The mirror image of the
    // laundering hole found on the IG route: there a pick justified itself, here it convicts itself.
    const takenFeatKeys = ((next.build?.choices ?? []) as RecordedChoice[])
      .filter((c) => c.kind === 'asi' && c.featKey && !(c.level === choice.level && c.kind === choice.kind))
      .map((c) => c.featKey as string);
    const canCast = !!next.spellcasting || !!def?.spellcasting;

    const v = validateChoice(choice, {
      // The character's own system, so an ASI-slot feat is judged by their edition's rules and not
      // by 2024's tracks (14-S6b). `def` is passed alongside because it is the only place that can
      // see a HOMEBREW class's ASI levels — the registry lookup inside the gate cannot.
      system,
      className: def?.name ?? next.meta?.className ?? '',
      asiLevels: def?.asiLevels,
      abilities: next.abilities,
      takenFeatKeys,
      has: canCast ? ['spellcasting'] : [],
      legalSkills: choice.kind === 'expertise' ? proficientSkills : undefined,
      // A subclass must be one of the registered options — unless it's a homebrew write-in,
      // which the builder marks and the DM reviews.
      legalOptions: choice.kind === 'subclass' && subs.length && !choice.homebrew ? subs.map((s) => s.key) : undefined,
    });
    // ── THE ESCAPE HATCH, at the level walker (slot plan S6d) ──────────────────────────────────────
    //
    // S6a–c put this on the FOUNDATIONS builders, which is where a character is assembled in one go. But
    // the owner's ask is level-by-level: *"be able to build level by level with the appropriately scoped
    // system mechanics, and also be able to fully customize at each level"*. This walker is that surface,
    // and a refusal here was a dead end — the player could only pick something else or abandon the level.
    //
    // Same three properties the build routes established, for the same reasons:
    //   · opt-in PER PICK (`acceptException`), never a mode — otherwise it just turns the gate off;
    //   · the REASON recorded is the validator's own (`v.error`), never one the client supplied, so a
    //     crafted POST cannot launder a refusal into a flattering explanation;
    //   · not offered on a CUSTOM character, where the rules never bound and an "exception" would be noise.
    const rawVariants = (r.row as { system_variants?: unknown }).system_variants;
    const buildVariant = readActiveSlotMeta(rawVariants).kind ?? 'vanilla';
    const offer = unlockOffer({ isDM: r.access.isDM, kind: buildVariant });

    // A CUSTOM character's rules never bound, so there is nothing here to refuse. PF2 and IG both say this
    // already (`isRulesEnforcedKind(buildVariant)` guards their gates); this route validated unconditionally
    // and was the only one of the three that didn't — found by driving it, because the two halves are
    // individually sensible and only contradict each other in the same request:
    //   · the gate refused the pick, and
    //   · `unlockOffer` withheld the hatch BECAUSE the character is custom ("an exception would be noise").
    // So a custom 5e character was refused and then told nothing could be done about it — a guaranteed dead
    // end, on precisely the characters the escape hatch exists to serve. It survived every test because no
    // test drove a walker on a custom character, and it needs BOTH conditions to show itself.
    //
    // The pick passes UNRECORDED rather than passing as an exception, which is the sibling routes' choice
    // and `entitlement`'s own doctrine: on a custom character "there is nothing to unlock and no exception
    // to record". Filing one anyway would put a subset of picks — only those this validator happens to
    // judge — into the DM's review queue for a character that never claimed to be rules-legal, and would
    // read `offer.stamps` off an offer whose `offered` is false.
    const unbound = !isRulesEnforcedKind(buildVariant);
    if (!v.ok && !unbound) {
      const accepted = body?.acceptException === true && offer.offered;
      if (!accepted) {
        // Tell the player the door exists, rather than leaving them at a wall.
        return NextResponse.json({ error: v.error, canTakeAnyway: offer.offered }, { status: 400 });
      }
      const name = choice.featKey || choice.value || (choice.skills ?? []).join(', ') || choice.kind;
      choice.exception = {
        name: String(name),
        reason: v.error ?? 'not available to this character',
        entitlement: offer.stamps,
        level: choice.level,
      };
    }

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

  // The badge, derived from the merged ledger — the same rule the build routes use, so a level-walker
  // exception moves the character to "Altered vanilla" exactly as a Foundations one does, and removing the
  // last exception takes it back to plain vanilla rather than leaving a scar.
  const rawVariants2 = (r.row as { system_variants?: unknown }).system_variants;
  const priorKind = readActiveSlotMeta(rawVariants2).kind ?? 'vanilla';
  const exceptions = exceptionsIn(next.build?.choices as { level?: number; exception?: unknown }[] | undefined);
  const nextKind = variantKindWithExceptions(priorKind, exceptions);

  const patch: Record<string, unknown> = { data: next };
  if (nextKind !== priorKind) {
    const raw = rawVariants2 && typeof rawVariants2 === 'object' ? (rawVariants2 as Record<string, unknown>) : {};
    patch.system_variants = { ...raw, [ACTIVE_SLOT_META_KEY]: { ...readActiveSlotMeta(rawVariants2), kind: nextKind } };
  }

  const { error } = await supabaseAdmin.from('dnd_characters').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ...planFor(next, system, Math.max(to, commitLevel ?? 0)),
    variantKind: nextKind,
    ...(exceptions.length ? { exceptions: exceptions.map(describeException) } : {}),
  });
}
