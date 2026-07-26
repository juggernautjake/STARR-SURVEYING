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
import { gateIgPicks, markIgOffRules } from '@/lib/dnd/systems/intuitive-games/rules-gate';
import type { IGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import { readActiveSlotMeta, isRulesEnforcedKind, unboundReasonFor, ACTIVE_SLOT_META_KEY } from '@/lib/dnd/system-variants';
import { unlockOffer, splitAcknowledged, exceptionsIn, variantKindWithExceptions, describeException } from '@/lib/dnd/slots/entitlement';
import { igBuilderChoicesFor, mergeIgBuilderChoices } from '@/lib/dnd/systems/intuitive-games/builder-choices';
import type { IGRecordedChoice } from '@/lib/dnd/systems/intuitive-games/levelup';

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

  // Rules gate (IG S4). The vanilla-only CAMPAIGN gate at submission is a different axis and does
  // not cover this: `igIsVanilla` is name-in-catalog only, so a Druid power on an Arcanist reads
  // as vanilla book content and passes submission untouched. That asks "is this from the book";
  // this asks "may this character have it".
  const rawVariants = (character as { system_variants?: unknown }).system_variants;
  const buildVariant = readActiveSlotMeta(rawVariants).kind ?? 'vanilla';
  const buildGate = gateIgPicks(picks, {
    // Enforced for ALTERED-VANILLA too — see `isRulesEnforcedKind`. Only a custom build opts out.
    enforce: !access.access.isDM && isRulesEnforcedKind(buildVariant),
    unboundReason: unboundReasonFor(buildVariant, access.access.isDM),
  });
  // The ESCAPE HATCH (slot plan S6c) — the third system on the shared decision core. Client names picks it
  // is knowingly taking; the reason recorded is this gate's own. Anything not named is still refused.
  //
  // IG's gate covers POWERS and the SPECIALIZATION, not feats — `igPowerEligibility` has no feat equivalent,
  // and IG's feat constraint is the per-level BUDGET rather than an eligibility rule. So the hatch offers
  // exactly those two, which is what the build can honour; a hatch over the feat budget would show an
  // exception this route never records.
  const offer = unlockOffer({ isDM: access.access.isDM, kind: buildVariant });
  const acknowledged = Array.isArray(body?.exceptions)
    ? (body.exceptions as unknown[]).filter((f): f is string => typeof f === 'string')
    : [];
  const { accepted, stillRefused } = splitAcknowledged(
    buildGate.refused,
    offer.offered ? acknowledged : [],
    offer.stamps,
    picks.level ?? 1,
  );
  if (stillRefused.length) {
    return NextResponse.json({
      error: `This is a vanilla character, so it can only take what its class and level grant. Remove or change: ${
        stillRefused.map((r) => `${r.name} (${r.reason})`).join('; ')
      } — or take it anyway as a recorded exception.`,
      refused: stillRefused,
    }, { status: 400 });
  }

  const assembled = assembleIGVanillaCharacter(picks);

  // THE SAME LEDGER `igPlanLevelUp` READS. Foundations collected these picks; without recording them the
  // walker re-prompts every level's feat and power as though nothing had been chosen. Same fix as 5e's
  // `builderChoicesFor` and PF2's `pf2BuilderChoicesFor`, against IG's scraped schedule.
  const priorChoices = ((character as { data?: { igBuild?: { choices?: IGRecordedChoice[] } } }).data?.igBuild?.choices) ?? [];
  const built = assembled as unknown as { igBuild?: { choices?: IGRecordedChoice[] } };
  built.igBuild = {
    ...(built.igBuild ?? {}),
    choices: mergeIgBuilderChoices(priorChoices, igBuilderChoicesFor({
      subclass: picks.subclass || picks.className,
      level: picks.level ?? 1,
      feats: picks.feats,
      powers: picks.powers,
      specialization: picks.specialization,
      exceptions: accepted,
    }), picks.level ?? 1),
  };

  // The badge, derived from the MERGED ledger rather than this request — so a rebuild cannot demote a
  // character whose exception the level walker recorded, and removing the off-rules pick returns it to
  // plain vanilla. Same rule as the 5e and PF2 routes.
  const exceptions = exceptionsIn(built.igBuild.choices);
  const nextKind = variantKindWithExceptions(buildVariant, exceptions);
  // Carry the off-rules reasons onto the built sheet (IG S3). Only reachable for a custom
  // character or a DM build — a vanilla one was refused above, so it never accumulates any.
  if (Object.keys(buildGate.offRules).length && (assembled as { ig?: unknown }).ig) {
    const built = assembled as unknown as { ig: IGCharacter };
    for (const [name, reason] of Object.entries(buildGate.offRules)) {
      built.ig = markIgOffRules(built.ig, name, reason);
    }
  }
  const dmGranted = (Array.isArray(character.dm_granted) ? character.dm_granted : []) as { kind?: ElementKind; name: string; grantedBy?: string | null; mechanics?: string | null }[];
  const summary = summarizeCharacterProvenance(assembled, 'intuitive-games', dmGranted);

  const patch: Record<string, unknown> = { data: assembled, name: assembled.meta.name || character.name };
  if (nextKind !== buildVariant) {
    // Only the active slot's `kind` moves; the rest of the column carries through untouched so a build never
    // rewrites lineage, art or summaries.
    const raw = rawVariants && typeof rawVariants === 'object' ? (rawVariants as Record<string, unknown>) : {};
    patch.system_variants = { ...raw, [ACTIVE_SLOT_META_KEY]: { ...readActiveSlotMeta(rawVariants), kind: nextKind } };
  }

  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update(patch)
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    variantKind: nextKind,
    ...(exceptions.length ? { exceptions: exceptions.map(describeException) } : {}),
    summary: { vanilla: summary.vanilla.length, custom: summary.custom.length, dmGranted: summary.dmGranted.length, hasBlockingCustom: summary.hasBlockingCustom },
    elements: summary.elements,
  });
}
