// lib/dnd/statblocks/derive-native.ts — a creature's numbers, rebuilt on another system's scale (N2-1).
//
// Owner, 2026-07-30: *"Right now it seems like the skunk has the same stat block for all four systems. You
// need to study how each system works and make sure that every creature in the bestiary has a full custom
// stat block for each system and that it is totally balanced and correct."*
//
// ── WHY TRANSPOSITION WAS NOT ALREADY THIS ──────────────────────────────────────────────────────────
//
// `transposeCreature` CARRIES the numbers across and lists what it could not convert. That is right for
// what it does — it never claims the result is balanced, it claims the result is honest about not being.
// But it means a skunk reads identically in all four systems, because AC 15 / HP 4 are simply copied, and
// the owner is correct that this is not four stat blocks.
//
// This module does the other thing: it throws the source's NUMBERS away and rebuilds them from the target
// system's own measured tier table, keeping the source's PROSE and shape. The result is a creature that
// belongs on the target's scale — a CR ¼ skunk becomes a level −1 Pathfinder creature with a level −1
// creature's AC and HP, not a 5e creature with a warning attached.
//
// ── THE THREE THINGS IT WILL NOT DO ─────────────────────────────────────────────────────────────────
//
//   1. **It will not derive for Intuitive Games.** IG publishes no creature-building table (N1-3), so
//      `nativeScaleFor` returns null and this returns null with a reason. IG keeps transposition plus the
//      stance/condition layer. Inventing an IG table to make the grid look complete is the exact thing
//      this phase forbids.
//   2. **It will not invent a tier.** A source with no readable CR/level cannot be placed on any scale, and
//      a guessed tier would silently decide every number that follows.
//   3. **It will not hide a clamp or a thin measurement.** A CR 30 creature has no PF2 level 30 to become,
//      and a tier measured from four creatures is a weaker claim than one measured from 250. Both end up in
//      `notes`, which is rendered, not just returned.
//
// Pure and total: no I/O, no clock, no randomness. Same input, same block, forever.
import type { Statblock, StatblockEntry } from '@/lib/dnd/homebrew/statblock';
import { scoreToMod, modToScore, type BestiarySystem } from '@/lib/dnd/bestiary/transpose';

import { formatTier, mapTier, nativeScaleFor, parseTier, rowFor, type TierScale } from './tier';

export interface DeriveInput {
  name: string;
  system: string;
  type?: string | null;
  size?: string | null;
  cr?: string | null;
  statblock: Statblock;
}

export interface DeriveResult {
  system: BestiarySystem;
  /** The rebuilt block. Prose is the source's; every number is the target's. */
  statblock: Statblock;
  /** The tier on the TARGET's scale, formatted the way that system writes it. */
  tier: string;
  /** One line per derived decision, in the order they were made. Rendered on the page (N3-4). */
  notes: string[];
  /** How many creatures the tier row was measured from — a thin row is a weaker claim, visibly. */
  sample: number;
}

/** Why a derivation could not be made. Returned rather than thrown: "no table for this system" is a normal
 *  answer the UI has to render, not an error. */
export interface DeriveRefusal {
  refused: true;
  reason: string;
}

const SYSTEM_LABEL: Record<string, string> = {
  'dnd5e-2014': 'D&D 5e (2014)',
  'dnd5e-2024': 'D&D 5e (2024)',
  pathfinder2e: 'Pathfinder 2e',
  'intuitive-games': 'Intuitive Games',
};
const label = (s: string) => SYSTEM_LABEL[s] ?? s;

/**
 * Rebuild `input` as a native creature of `target`.
 *
 * Returns a refusal — not null, not a throw — when the target has no table or the source has no tier, so
 * every caller has a sentence to show instead of an empty stat block.
 */
export function deriveNativeStatblock(
  input: DeriveInput,
  target: BestiarySystem,
): DeriveResult | DeriveRefusal {
  const toScale = nativeScaleFor(target);
  if (!toScale) {
    return {
      refused: true,
      reason: `${label(target)} publishes no creature-building table, so a native block cannot be derived — this creature is converted rather than rebuilt.`,
    };
  }

  const fromScale = nativeScaleFor(input.system);
  const sb = input.statblock ?? {};
  const sourceTier = parseTier(input.cr ?? sb.cr);
  if (sourceTier === null) {
    return {
      refused: true,
      reason: `${input.name} has no challenge rating or creature level to place it on a scale, so nothing can be derived from it without guessing.`,
    };
  }

  const notes: string[] = [];
  // A source on no known scale (an IG creature) is read on the DnD scale: IG's own levels are written like
  // 5e CRs and its creatures came from there. Said out loud rather than assumed silently.
  const readAs: TierScale = fromScale ?? 'dnd';
  if (!fromScale) {
    notes.push(`${label(input.system)} has no table of its own, so its level ${formatTier(sourceTier, 'dnd')} was read on the D&D scale.`);
  }

  const mapped = mapTier(sourceTier, readAs, toScale);
  if (readAs !== toScale) {
    notes.push(
      `${scaleWord(readAs)} ${formatTier(sourceTier, readAs)} maps to ${scaleWord(toScale)} ${formatTier(mapped.tier, toScale)}.`,
    );
  }
  if (mapped.clamped) {
    notes.push(
      `${scaleWord(toScale)} does not go that high — held at ${formatTier(mapped.tier, toScale)}, the top of its published range. Treat this block as the ceiling rather than an exact match.`,
    );
  }

  const found = rowFor(mapped.tier, toScale);
  if (!found) {
    return { refused: true, reason: `No measured row exists for ${scaleWord(toScale)} ${formatTier(mapped.tier, toScale)}.` };
  }
  const { row, exact } = found;
  if (!exact) {
    notes.push(
      `No tier ${formatTier(mapped.tier, toScale)} row was measurable, so the nearest measured tier (${formatTier(row.tier, toScale)}) was used.`,
    );
  }
  if (row.sample < 12) {
    // A number, not an adjective. "Measured from 4 creatures" is a claim the reader can size themselves.
    notes.push(`That tier was measured from only ${row.sample} creature${row.sample === 1 ? '' : 's'} — a weaker basis than the crowded tiers.`);
  }

  const out: Statblock = {};

  // ── The numbers: entirely the target's ────────────────────────────────────────────────────────────
  out.ac = row.ac;
  out.hp = row.hp;
  out.cr = formatTier(mapped.tier, toScale);
  notes.push(`AC ${row.ac} and ${row.hp} HP are the measured median for ${scaleWord(toScale)} ${out.cr}, not the source's numbers.`);

  // Hit dice are NOT carried: they describe the source's HP, and this HP is a different number. A block
  // showing "8d10 + 16" beside an unrelated total is worse than one showing no dice at all.
  if (sb.hitDice) notes.push(`Hit dice dropped — they described the original ${sb.hp ?? '?'} HP, not this one.`);

  // ── The shape: what each system prints ────────────────────────────────────────────────────────────
  //
  // N2-2. PF2 prints ability MODIFIERS and no scores; 5e prints scores. Converting the wrong way round is
  // the inversion `Statblock.abilityMods` exists to prevent — a +3 written into `abilities` renders as a
  // SCORE of 3, i.e. a crippling weakness where the source states a strength.
  if (toScale === 'pf2') {
    const mods = sb.abilityMods
      ?? (sb.abilities
        ? Object.fromEntries(Object.entries(sb.abilities).map(([k, v]) => [k, scoreToMod(Number(v))]))
        : undefined);
    if (mods && Object.keys(mods).length) {
      out.abilityMods = mods;
      if (!sb.abilityMods) notes.push('Ability scores converted to Pathfinder modifiers, which is how Pathfinder 2e prints them.');
    }
  } else {
    if (sb.abilities && Object.keys(sb.abilities).length) {
      out.abilities = sb.abilities;
    } else if (sb.abilityMods && Object.keys(sb.abilityMods).length) {
      // LOSSY and labelled: +3 could have come from 16 or 17, and this picks the even one. The source
      // states no score at all, so this is a reconstruction, not a reading.
      out.abilities = Object.fromEntries(
        Object.entries(sb.abilityMods).map(([k, v]) => [k, modToScore(Number(v))]),
      );
      notes.push('Ability scores reconstructed from Pathfinder modifiers — +3 could have been 16 or 17, and the even score was chosen.');
    }
    out.proficiencyBonus = proficiencyFor(mapped.tier);
  }

  // ── The prose: entirely the source's ──────────────────────────────────────────────────────────────
  //
  // Everything a creature IS rather than how strong it is. Rewriting these would be inventing a creature;
  // this phase rebuilds numbers, not identity.
  for (const k of ['speed', 'senses', 'languages', 'resistances', 'immunities', 'vulnerabilities', 'conditionImmunities', 'acNote'] as const) {
    const v = sb[k];
    if (typeof v === 'string' && v.trim()) out[k] = v;
  }

  // Attacks are re-pitched to the target's measured attack bonus; their DAMAGE and text stay the source's.
  // Damage is deliberately untouched: the corpus gives a median to-hit per tier but damage expressions are
  // too varied to median honestly, and a made-up dice expression would be the least defensible number here.
  if (sb.entries?.length) {
    out.entries = sb.entries.map((e) => retuneEntry(e, row.attack));
    const retuned = out.entries.filter((e, i) => e.toHit !== sb.entries![i].toHit).length;
    if (retuned) {
      notes.push(`${retuned} attack${retuned === 1 ? '' : 's'} re-pitched to +${row.attack}, this tier's measured to-hit. Damage is unchanged — the corpus supports a median to-hit, not a median damage expression.`);
    }
  }
  if (sb.spellcasting) out.spellcasting = sb.spellcasting;

  // ── Saves: dropped when crossing, then REBUILT where the target publishes them (N2-3) ─────────────
  //
  // Dropping is still right — a Pathfinder block listing "WIS +3" names a save Pathfinder has not got —
  // but dropping ALONE left a derived Pathfinder creature with no saving throws at all, and every
  // published PF2 creature has three. Measured coverage says so plainly: Pathfinder prints Fort/Ref/Will
  // on 25 of 25 tiers, D&D on 0 of 31. So the foreign saves go, and the target's own measured ones
  // replace them wherever the target actually prints saves.
  if (sb.saves && readAs !== toScale) {
    notes.push(`Saving throws dropped — ${label(input.system)} and ${label(target)} do not have the same saves, so carrying them across would name saves this system has not got.`);
  } else if (sb.saves) {
    out.saves = sb.saves;
  }

  if (row.fort !== undefined && row.ref !== undefined && row.will !== undefined) {
    // Only when the block does not already carry the target's own saves — a same-family derivation keeps
    // the creature's real ones, which are a designer's numbers and beat a median.
    if (!out.saves) {
      out.saves = `Fort ${signed(row.fort)}, Ref ${signed(row.ref)}, Will ${signed(row.will)}`;
      notes.push(`Fort/Ref/Will rebuilt at ${scaleWord(toScale)} ${out.cr}'s measured medians — every Pathfinder creature prints three saves, and a block without them is not a Pathfinder block.`);
    }
  }

  // Perception is a LINE in Pathfinder and a phrase inside 5e's senses ("passive Perception 13"), so it
  // cannot simply be carried either way. Where the target publishes it, the measured value is stated and
  // the source's other senses — darkvision, scent — are kept, since those describe the creature rather
  // than its numbers.
  if (row.perception !== undefined) {
    const rest = (sb.senses ?? '')
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter((s) => s && !/perception/i.test(s));
    out.senses = [`Perception ${signed(row.perception)}`, ...rest].join('; ');
    notes.push(`Perception set to ${signed(row.perception)}, this tier's measured median — the source wrote it in its own system's form, which does not transfer.`);
  }

  if (sb.skills) out.skills = sb.skills;

  return { system: target, statblock: out, tier: out.cr, notes, sample: row.sample };
}

/** Type guard, so callers branch on the refusal without reaching for `'refused' in x` everywhere. */
export function isRefusal(r: DeriveResult | DeriveRefusal): r is DeriveRefusal {
  return (r as DeriveRefusal).refused === true;
}

/** What a reader calls the number: 5e says CR, Pathfinder says level. */
function scaleWord(s: TierScale): string {
  return s === 'pf2' ? 'level' : 'CR';
}

/** "+8" / "-1". A modifier printed without its sign is a modifier a reader has to guess at. */
function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

/**
 * 5e's proficiency bonus by challenge rating — +2 through CR 4, then +1 every four CR.
 *
 * This IS in the SRD (it is the same progression a character uses), so it is stated rather than measured.
 * Pathfinder has no equivalent single number, which is why this is only applied on the D&D side.
 */
export function proficiencyFor(cr: number): number {
  if (cr < 5) return 2;
  return 2 + Math.floor((Math.min(cr, 30) - 1) / 4);
}

/**
 * Re-pitch one entry's to-hit, leaving everything else alone.
 *
 * Only entries that HAVE a to-hit are touched. A trait with no attack roll gets a bonus it never had if you
 * are careless here, and "Keen Smell +5" is nonsense a reader will notice immediately.
 */
function retuneEntry(e: StatblockEntry, attack: number): StatblockEntry {
  if (!e.toHit || !e.toHit.trim()) return e;
  return { ...e, toHit: attack >= 0 ? `+${attack}` : String(attack) };
}
