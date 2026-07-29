// lib/dnd/party-overview.ts — every PC's defences on one screen (P3-7).
//
// The slice calls this "a new arrangement of existing data", and that is right — every number here is
// already computed by a per-system resolver. What it is NOT is a single table with the same columns for
// everyone, and that is the whole difficulty:
//
//   · **5e** stores AC on the sheet and derives passive Perception as 10 + the Perception modifier.
//   · **Pathfinder 2e** DERIVES AC (`pf2ArmorClass`, including a raised shield) and has Perception as a
//     first-class proficiency, not a skill.
//   · **Intuitive Games has no armour class at all.** Its `IGCombat` carries `damageReduction` and a
//     `defensivePower`; there is no to-hit target to report. Printing a blank AC column for an IG character
//     would read as missing data, and printing a number derived from something else would be inventing a
//     rule — the exact failure Ground Rule 3 exists to prevent.
//
// So a member's defence is a LABELLED value: "AC 17" for 5e and PF2, "DR 3" for IG. The DM reads what the
// system actually gives them, and nothing pretends to be something it is not.
import { normalizeSystem, type CharacterSystem } from './systems';
import { resolveHp } from './combat-hp';
import { pf2ArmorClass, pf2PerceptionTotal, pf2SaveTotal } from './systems/pathfinder2e/rules';
import { igSaves } from './systems/intuitive-games/rules';
import type { PF2Character } from './systems/pathfinder2e/model';
import type { IGCharacter } from './systems/intuitive-games/model';
import { abilityMod, profBonusForLevel, profContribution, type ProfLevel } from '@/app/dnd/_sheet/rules/dnd';

/** A defence with its own name, because the systems do not share one. */
export interface LabelledStat {
  label: string;
  value: number;
}

/**
 * Wrap a computed number, or null if it is not finite.
 *
 * The resolvers assume well-formed input: `pf2ArmorClass` reads `armorRank` expecting a rank string, and a
 * legacy or half-migrated sidecar holding a number yields **NaN** rather than throwing. "AC NaN" on a DM's
 * screen mid-combat is worse than "—", and NaN propagates silently through every comparison, so it is
 * stopped at the boundary rather than trusted.
 */
function stat(label: string, value: number): LabelledStat | null {
  return Number.isFinite(value) ? { label, value } : null;
}

export interface PartyMember {
  id: string;
  name: string;
  system: CharacterSystem;
  /** The system's primary defensive number, named. Null when the sheet has not been built. */
  defense: LabelledStat | null;
  /** Passive Perception (5e) or Perception (PF2). Null where the system has no equivalent. */
  perception: LabelledStat | null;
  /** Saves, keyed by whatever the system calls them — three for PF2/IG, six for 5e. */
  saves: Record<string, number>;
  currentHp: number | null;
  maxHp: number | null;
  conditions: string[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Build one member's row from a character row's `data` blob.
 *
 * `system` decides which sidecar is authoritative — the same rule `resolveHp` follows, and for the same
 * reason: a transposed character can carry a stale sidecar, and sniffing for whichever key exists would
 * report the dead one.
 */
export function summarizeMember(input: {
  id: string;
  name: string;
  system: CharacterSystem | string | null | undefined;
  data: unknown;
}): PartyMember {
  const system = normalizeSystem(input.system);
  const d = (input.data && typeof input.data === 'object' ? input.data : {}) as Record<string, unknown>;
  const hp = resolveHp(system, input.data);

  if (system === 'pathfinder2e') {
    const pf2 = d.pf2e as PF2Character | undefined;
    // `perception` and `saves` are checked as well as `combat`/`identity`, because the resolvers reach
    // straight into them — `pf2PerceptionTotal` does `char.perception.rank` with no guard of its own. A
    // half-written sidecar would otherwise throw and take the ENTIRE DM panel down, not just one row. The
    // panel's job is to survive one bad character.
    if (!pf2?.combat || !pf2?.identity || !pf2?.perception || !pf2?.saves) {
      return { id: input.id, name: input.name, system, defense: null, perception: null, saves: {}, ...hp, conditions: [] };
    }
    return {
      id: input.id, name: input.name, system,
      defense: stat('AC', pf2ArmorClass(pf2)),
      // PF2 Perception is a proficiency in its own right, not a skill — and it is an active number, not a
      // "passive" one, so it is labelled as PF2 labels it.
      perception: stat('Perc', pf2PerceptionTotal(pf2)),
      saves: {
        Fort: pf2SaveTotal('Fortitude', pf2),
        Ref: pf2SaveTotal('Reflex', pf2),
        Will: pf2SaveTotal('Will', pf2),
      },
      ...hp,
      // PF2 conditions are an ARRAY of `{ name, value? }`, not a value-keyed record. My first pass ran
      // `Object.entries` over it, which iterates array INDICES — producing "0 [object Object]" on a DM's
      // screen. Typechecked fine, because `unknown` swallowed it.
      conditions: (pf2.combat.conditions ?? []).map((c) => (c.value && c.value > 1 ? `${c.name} ${c.value}` : c.name)),
    };
  }

  if (system === 'intuitive-games') {
    const ig = d.ig as IGCharacter | undefined;
    if (!ig?.combat || !ig?.identity) {
      return { id: input.id, name: input.name, system, defense: null, perception: null, saves: {}, ...hp, conditions: [] };
    }
    const saves = igSaves(ig);
    return {
      id: input.id, name: input.name, system,
      // NOT an AC. IG has no to-hit target; `damageReduction` is its defensive stat, so that is what the
      // column says. Reporting a blank AC would read as missing data.
      defense: { label: 'DR', value: num(ig.combat.damageReduction) },
      // IG has no Perception proficiency, and inventing one from Wisdom would be a rule we made up.
      perception: null,
      saves: { Fort: saves.Fortitude, Ref: saves.Reflex, Will: saves.Will },
      ...hp,
      conditions: [...(ig.combat.conditions ?? [])],
    };
  }

  // Both 5e editions share the `combat`/`abilities`/`skills` shape.
  //
  // The proficiency model here is NOT a boolean. Skills store `{ prof: 'none' | 'proficient' | 'expertise',
  // misc }`, and the sheet's own `profContribution` turns that into a number (expertise doubles). My first
  // pass read `.proficient` and `.expertise` as booleans, which would have silently reported every skilled
  // character as unproficient — a wrong number that looks entirely plausible on a DM screen. These are the
  // sheet's own helpers, so this panel and the sheet cannot disagree.
  const combat = (d.combat ?? {}) as Record<string, unknown>;
  const abilities = (d.abilities ?? {}) as Record<string, unknown>;
  const skills = (d.skills ?? {}) as Record<string, { prof?: ProfLevel; misc?: unknown }>;
  const level = num((d.meta as Record<string, unknown> | undefined)?.level) || 1;
  const pb = profBonusForLevel(level);

  // Passive Perception = 10 + the Perception check modifier.
  const perceptionSkill = skills.perception ?? {};
  const perceptionMod = abilityMod(num(abilities.wis))
    + profContribution(perceptionSkill.prof ?? 'none', pb)
    + num(perceptionSkill.misc);

  const saveKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  const saveBlock = (d.saves ?? {}) as Record<string, { proficient?: boolean; misc?: unknown }>;
  const saves: Record<string, number> = {};
  for (const k of saveKeys) {
    const s = saveBlock[k] ?? {};
    // Saves DO use a boolean `proficient` — `blank.ts` builds them as `{ proficient: false, misc: 0 }`,
    // unlike skills. Two shapes in one character, which is exactly why this reads each from its own source
    // rather than assuming they match.
    saves[k.toUpperCase()] = abilityMod(num(abilities[k])) + (s.proficient ? pb : 0) + num(s.misc);
  }

  return {
    id: input.id, name: input.name, system,
    defense: num(combat.ac) ? { label: 'AC', value: num(combat.ac) } : null,
    perception: { label: 'Passive Perc', value: 10 + perceptionMod },
    saves,
    ...hp,
    conditions: Array.isArray(combat.conditions) ? (combat.conditions as unknown[]).map(String) : [],
  };
}

/** The whole party, in the order given. */
export function summarizeParty(
  rows: readonly { id: string; name: string; system?: string | null; data?: unknown }[],
): PartyMember[] {
  return (rows ?? []).map((r) => summarizeMember({ id: r.id, name: r.name, system: r.system, data: r.data }));
}

/**
 * Every save key present across the party, in a stable order.
 *
 * A mixed table has 5e characters with six saves and PF2/IG characters with three, so the table cannot
 * assume one column set. Returning the union — rather than intersecting to what everyone has — means a
 * lone 5e character does not lose four of their saves to the presence of a PF2 character.
 */
export function partySaveKeys(members: readonly PartyMember[]): string[] {
  const ORDER = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA', 'Fort', 'Ref', 'Will'];
  const present = new Set<string>();
  for (const m of members ?? []) for (const k of Object.keys(m.saves ?? {})) present.add(k);
  return ORDER.filter((k) => present.has(k));
}
