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
  pf2ProjectLevelUpFeats,
  type PF2RecordedChoice,
  type PF2ChoiceKind,
  type PF2FeatResolution,
} from '@/lib/dnd/systems/pathfinder2e/levelup';
import { PF2_ALL_FEATS } from '@/lib/dnd/systems/pathfinder2e/data';
import type { PF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { pf2FeatEligibility } from '@/lib/dnd/systems/pathfinder2e/eligibility';
import { pf2ContextFor } from '@/lib/dnd/systems/pathfinder2e/rules-gate';
import { readActiveSlotMeta, isRulesEnforcedKind, ACTIVE_SLOT_META_KEY } from '@/lib/dnd/system-variants';
import { unlockOffer, exceptionsIn, variantKindWithExceptions, describeException } from '@/lib/dnd/slots/entitlement';

/** Resolve a feat name (within a track) to its catalog data, so a projected feat shows real traits/body. */
function resolveFeat(name: string, track: string): PF2FeatResolution | null {
  const hit = PF2_ALL_FEATS.find((f) => f.track === track && f.name.toLowerCase() === name.toLowerCase());
  return hit ? { level: hit.level, traits: hit.traits ?? [], body: hit.effect ?? '' } : null;
}

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

  const body = (await req.json().catch(() => ({}))) as { choice?: unknown; commitTo?: unknown; acceptException?: boolean };
  const data = normalizeCharacter((row.data as unknown) ?? blankCharacter(row.name)) as PF2Data;
  const { className, level } = buildState(data);
  let choices = (data.pf2Build?.choices ?? []) as PF2RecordedChoice[];

  // 1) Record a choice, if one was sent.
  if (body.choice != null) {
    const choice = readChoice(body.choice);
    if (!choice) return NextResponse.json({ error: 'That choice is malformed.' }, { status: 400 });

    // ── THE VALUE IS GATED HERE, not just the slot (slot plan S6d) ─────────────────────────────────
    //
    // `pf2PlanLevelUp` has always scoped which SLOTS a level offers — one prompt per (level, track). What
    // nothing checked was WHAT you put in one: `readChoice` validates the shape and nothing else, so the
    // walker would happily record a level-13 feat into a level-2 class slot. The Foundations builder has
    // gated this since S4; the level walker, which is where the owner's "build level by level with the
    // appropriately scoped system mechanics" actually happens, did not.
    //
    // Judged against the CATALOG entry, never the choice's own claim, for the same reason `gatePf2Edit`
    // gives: otherwise a crafted POST declares a level-20 feat to be level 1 and walks straight through.
    // A feat the catalog does not know is homebrew and passes — it never claimed to be official content,
    // and refusing it would block authoring rather than close a hole.
    const rawVariants = (row as { system_variants?: unknown }).system_variants;
    const buildVariant = readActiveSlotMeta(rawVariants).kind ?? 'vanilla';
    const offer = unlockOffer({ isDM: access.access.isDM, kind: buildVariant });

    if (choice.kind === 'feat' && choice.value && isRulesEnforcedKind(buildVariant) && !access.access.isDM) {
      const def = PF2_ALL_FEATS.find((f) => f.name.toLowerCase() === choice.value!.trim().toLowerCase());
      if (def) {
        const sidecar = (data as PF2Data & { pf2e?: PF2Character }).pf2e;
        const elig = pf2FeatEligibility(def, sidecar
          ? pf2ContextFor(sidecar)
          : { className, ancestry: '', level: choice.level, featNames: [] });
        if (!elig.ok) {
          const accepted = body.acceptException === true && offer.offered;
          if (!accepted) {
            return NextResponse.json({ error: elig.reason, canTakeAnyway: offer.offered }, { status: 400 });
          }
          choice.exception = {
            name: def.name,
            reason: elig.reason ?? 'not available to this character',
            entitlement: offer.stamps,
            level: choice.level,
          };
        }
      }
    }
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

  const nextData: PF2Data & { pf2e?: PF2Character } = {
    ...data,
    meta: { ...data.meta, level: newLevel },
    pf2Build: { ...(data.pf2Build ?? {}), choices },
  } as PF2Data & { pf2e?: PF2Character };

  // Project the EARNED feat choices into the pf2e sidecar so they actually show on the sheet, and keep the
  // sidecar's own level in step. Idempotent — re-projecting replaces, never duplicates. (Boosts stay
  // recorded-only; see pf2ProjectLevelUpFeats for why attribute projection waits on partial-boost state.)
  const sidecar = nextData.pf2e;
  if (sidecar) {
    nextData.pf2e = {
      ...sidecar,
      identity: { ...sidecar.identity, level: newLevel },
      feats: pf2ProjectLevelUpFeats(sidecar.feats ?? [], choices, newLevel, resolveFeat),
    };
  }

  // The badge, derived from the merged ledger — the same rule every other write path uses, so a PF2
  // level-walker exception reads "Altered vanilla" and names itself just as a Foundations one does.
  const rawVariantsOut = (row as { system_variants?: unknown }).system_variants;
  const priorKind = readActiveSlotMeta(rawVariantsOut).kind ?? 'vanilla';
  const exceptions = exceptionsIn(choices);
  const nextKind = variantKindWithExceptions(priorKind, exceptions);

  const patch: Record<string, unknown> = { data: nextData };
  if (nextKind !== priorKind) {
    const raw = rawVariantsOut && typeof rawVariantsOut === 'object' ? (rawVariantsOut as Record<string, unknown>) : {};
    patch.system_variants = { ...raw, [ACTIVE_SLOT_META_KEY]: { ...readActiveSlotMeta(rawVariantsOut), kind: nextKind } };
  }

  const { error } = await supabaseAdmin.from('dnd_characters').update(patch).eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Could not save the level choices.' }, { status: 500 });

  const plan = pf2PlanLevelUp({ className, to: Math.max(newLevel, commitTo ?? newLevel), recorded: choices, from: newLevel });
  return NextResponse.json({
    ok: true, level: newLevel, choices, plan,
    variantKind: nextKind,
    ...(exceptions.length ? { exceptions: exceptions.map(describeException) } : {}),
  });
}
