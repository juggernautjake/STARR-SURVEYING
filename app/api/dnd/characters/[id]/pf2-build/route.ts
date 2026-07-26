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
import { readActiveSlotMeta, isRulesEnforcedKind, unboundReasonFor, ACTIVE_SLOT_META_KEY } from '@/lib/dnd/system-variants';
import { unlockOffer, splitAcknowledged, exceptionsIn, variantKindWithExceptions, describeException } from '@/lib/dnd/slots/entitlement';
import { pf2BuilderChoicesFor, mergePf2BuilderChoices } from '@/lib/dnd/systems/pathfinder2e/builder-choices';
import type { PF2RecordedChoice } from '@/lib/dnd/systems/pathfinder2e/levelup';

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
  const rawVariants = (character as { system_variants?: unknown }).system_variants;
  const buildVariant = readActiveSlotMeta(rawVariants).kind ?? 'vanilla';
  const tradition = pf2Class(picks.className ?? '')?.spellcasting?.tradition;
  const buildGate = gatePf2Picks(picks, {
    // Enforced for ALTERED-VANILLA too — see `isRulesEnforcedKind`. Only a custom build opts out.
    enforce: !access.access.isDM && isRulesEnforcedKind(buildVariant),
    unboundReason: unboundReasonFor(buildVariant, access.access.isDM),
  }, { feats: PF2_ALL_FEATS, spells: PF2_ALL_SPELLS }, tradition);
  // The ESCAPE HATCH (slot plan S6b) — the PF2 half of the 5e mechanism, sharing its decision core so the
  // two systems cannot drift into different ideas of what an exception is. The client names picks it is
  // knowingly taking; the REASON recorded is this gate's own, never one the caller supplied. Anything not
  // named is still refused, so this is opt-in per pick rather than a switch that disables the gate.
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

  const assembled = assemblePF2VanillaCharacter(picks);

  // THE SAME LEDGER THE PF2 LEVEL WALKER READS. `pf2PlanLevelUp` is already slot-driven — one prompt per
  // (level, feat TRACK) — but Foundations stored a flat `feats: string[]` and `assemblePF2VanillaCharacter`
  // writes `pf2Build` without `choices`, so every slot still read as unfilled and the walker asked again for
  // picks the player had just made. Attributing them here is the PF2 half of the same fix made for 5e, and
  // it is what lets the builder cap at the real slot count instead of accepting thirty feats at level 1.
  const prior = ((character as { data?: { pf2Build?: { choices?: PF2RecordedChoice[] } } }).data?.pf2Build?.choices) ?? [];
  assembled.pf2Build = {
    ...assembled.pf2Build,
    choices: mergePf2BuilderChoices(prior, pf2BuilderChoicesFor({
      className: picks.className, level: picks.level ?? 1, feats: picks.feats, subclass: picks.subclass,
      exceptions: accepted,
    }), picks.level ?? 1),
  };

  // The badge, derived from the MERGED ledger rather than this request — so a rebuild cannot demote a
  // character whose exception was recorded by the level walker, and removing the off-rules pick returns it
  // to plain vanilla instead of leaving a scar. Same rule as the 5e route.
  const exceptions = exceptionsIn(assembled.pf2Build.choices);
  const nextKind = variantKindWithExceptions(buildVariant, exceptions);

  const dmGranted = (Array.isArray(character.dm_granted) ? character.dm_granted : []) as { kind?: ElementKind; name: string; grantedBy?: string | null; mechanics?: string | null }[];
  const summary = summarizeCharacterProvenance(assembled, 'pathfinder2e', dmGranted);

  const patch: Record<string, unknown> = { data: assembled, name: assembled.meta.name || character.name };
  if (nextKind !== buildVariant) {
    // Only the active slot's `kind` moves; the rest of the column is carried through untouched so a build
    // never rewrites lineage, art or summaries.
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
