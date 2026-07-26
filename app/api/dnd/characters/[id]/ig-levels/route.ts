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
import { igPowerEligibility, igSpecializationEligibility } from '@/lib/dnd/systems/intuitive-games/eligibility';
import { readActiveSlotMeta, isRulesEnforcedKind, ACTIVE_SLOT_META_KEY } from '@/lib/dnd/system-variants';
import { unlockOffer, exceptionsIn, variantKindWithExceptions, describeException } from '@/lib/dnd/slots/entitlement';

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

  const body = (await req.json().catch(() => ({}))) as { choice?: unknown; commitTo?: unknown; acceptException?: boolean };
  const data = normalizeCharacter((row.data as unknown) ?? blankCharacter(row.name)) as IGData;
  const { subclass, level } = buildState(data);
  let choices = (data.igBuild?.choices ?? []) as IGRecordedChoice[];

  // 1) Record a choice, if one was sent.
  if (body.choice != null) {
    const choice = readChoice(body.choice);
    if (!choice) return NextResponse.json({ error: 'That choice is malformed.' }, { status: 400 });

    // ── THE VALUE IS GATED HERE, not just the slot (slot plan S6d) ─────────────────────────────────
    //
    // `igPlanLevelUp` scopes which slots a level grants, from the scraped schedule — but `readChoice`
    // only checked the shape of the answer, so the walker recorded whatever name it was handed. A
    // Beastmaster could take an Arcanist's power at level 3 and the level would read as complete.
    //
    // IG's gate covers POWERS and the SPECIALIZATION, matching `gateIgPicks`: `igPowerEligibility` has no
    // feat equivalent (IG feat prerequisites are unstructured prose), so feats stay bounded by the
    // per-level BUDGET rather than by eligibility, exactly as they are in the Foundations builder.
    const rawVariants = (row as { system_variants?: unknown }).system_variants;
    const buildVariant = readActiveSlotMeta(rawVariants).kind ?? 'vanilla';
    const offer = unlockOffer({ isDM: access.access.isDM, kind: buildVariant });
    const gated = isRulesEnforcedKind(buildVariant) && !access.access.isDM;

    if (gated && choice.value && (choice.kind === 'subclass-power' || choice.kind === 'specialization')) {
      // THE PICK UNDER REVIEW MUST NOT JUSTIFY ITSELF.
      //
      // `igPowerEligibility` treats already-known powers as legitimate — right, because whatever granted
      // them was. But `igRecordChoice` REPLACES the entry at this (level, kind), so the choice being
      // replaced is not "already known": it is the thing being judged. Without this filter a player could
      // take an illegal power through the hatch, save the SAME choice again, and have it pass clean the
      // second time — removing the exception and returning the badge to "Vanilla" while keeping the power.
      // Verified against a live character before the fix: the flag vanished on the second save.
      //
      // The same value at ANOTHER level is excluded too. Holding one power twice is its own problem, but
      // it must not become a way to launder the first copy.
      //
      // `gateIgPicks` and `gatePf2Picks` have always said this ("every power in this build is under review,
      // so treating them as already-known would make the whole set vacuously legal") — this is that rule,
      // applied where I had missed it.
      const selfJustifying = (c: IGRecordedChoice) =>
        (c.level === choice.level && c.kind === choice.kind)
        || (c.value ?? '').trim().toLowerCase() === choice.value!.trim().toLowerCase();
      const ctx = {
        className: data.meta?.className ?? '',
        subclass: data.meta?.subclass ?? '',
        level: choice.level,
        specializations: choices
          .filter((c) => c.kind === 'specialization' && c.value && !selfJustifying(c))
          .map((c) => c.value as string),
        knownPowers: choices
          .filter((c) => c.kind === 'subclass-power' && c.value && !selfJustifying(c))
          .map((c) => c.value as string),
      };
      const elig = choice.kind === 'specialization'
        ? igSpecializationEligibility(choice.value, ctx)
        : igPowerEligibility(choice.value, ctx);
      if (!elig.ok) {
        const accepted = body.acceptException === true && offer.offered;
        if (!accepted) {
          return NextResponse.json({ error: elig.reason, canTakeAnyway: offer.offered }, { status: 400 });
        }
        choice.exception = {
          name: choice.value,
          reason: elig.reason ?? 'not available to this character',
          entitlement: offer.stamps,
          level: choice.level,
        };
      }
    }
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
  // The badge, derived from the merged ledger — the same rule every other write path uses.
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

  const plan = igPlanLevelUp({ subclass, to: Math.max(newLevel, commitTo ?? newLevel), recorded: choices, from: newLevel });
  return NextResponse.json({
    ok: true, level: newLevel, choices, plan,
    variantKind: nextKind,
    ...(exceptions.length ? { exceptions: exceptions.map(describeException) } : {}),
  });
}
