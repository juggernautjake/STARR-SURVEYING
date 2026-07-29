// lib/dnd/bestiary/import.ts — one SRD creature → one `dnd_creatures` row (P13-3, the pure half).
//
// SPLIT DELIBERATELY. The transform is pure and testable today; the INSERT needs `dnd_creatures`, and seed
// 462 is written but unapplied. Writing both halves together would have produced a file nothing could
// exercise — so this is the half that can be argued with now, and the writer is a thin loop over it later.
//
// SHAPE-TOLERANT ON PURPOSE. The 5.1 SRD is published as JSON by several projects and they disagree about
// casing and nesting (`armor_class` vs `ac`, a number vs `[{ value }]`, `special_abilities` vs `traits`).
// Rather than bind to one publisher, every field is read through a list of candidate paths and the first
// one that yields a usable value wins. A missing field is left undefined — never defaulted to 0, which
// would print an AC nobody wrote.
//
// LICENCE IS NOT OPTIONAL. `source`, `licence` and `attribution` are required by seed 462's NOT NULLs and
// by the licences themselves, so they are parameters of the import rather than fields of the creature —
// an importer cannot forget what it was never allowed to omit.
import { normalizeStatblock, type Statblock, type StatblockEntry, type StatblockEntryKind } from '@/lib/dnd/homebrew/statblock';
import { deriveCreature, type DerivedCreature } from './derive';

export interface ImportProvenance {
  /** 'SRD 5.1', 'Monster Core'. */
  source: string;
  /** 'CC-BY-4.0', 'ORC'. */
  licence: string;
  /** The exact line the licence requires travel with the content. */
  attribution: string;
  sourceUrl?: string;
  /** Prefixes the slug: 'srd51' → 'srd51:adult-red-dragon'. Keeps two editions of one creature apart. */
  slugPrefix: string;
  system: string;
}

export interface CreatureRow {
  slug: string;
  name: string;
  system: string;
  type?: string;
  size?: string;
  alignment?: string;
  cr?: string;
  cr_sort?: number;
  statblock: Statblock;
  description?: string;
  tags: string[];
  environments: string[];
  source: string;
  licence: string;
  attribution: string;
  source_url?: string;
  variant_eligible: boolean;
}

export interface ImportedCreature {
  row: CreatureRow;
  derived: DerivedCreature;
}

const pick = (o: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

const asText = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  // `armor_class: [{ value: 19, type: 'natural' }]` — the 2024-shaped publishers nest it.
  if (Array.isArray(v) && v.length) return asText((v[0] as Record<string, unknown>)?.value ?? v[0]);
  if (v && typeof v === 'object') return asText((v as Record<string, unknown>).value);
  return undefined;
};

const asNum = (v: unknown): number | undefined => {
  const t = asText(v);
  if (t === undefined) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/** `Adult Red Dragon` → `adult-red-dragon`. Stable, so a re-import UPSERTs rather than duplicating. */
export function creatureSlug(name: string, prefix: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${prefix}:${base}`;
}

/** Fractions and integers alike, for the sortable companion column. Null when unparseable — never 0. */
export function crSort(cr: string | undefined): number | undefined {
  if (!cr) return undefined;
  const frac = cr.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (frac) { const d = Number(frac[2]); return d === 0 ? undefined : Number(frac[1]) / d; }
  const n = Number(cr);
  return Number.isFinite(n) ? n : undefined;
}

/** Publisher key → the entry kind it means. Anything unlisted becomes an `action`, per P13-1's rule that
 *  losing authored rules text is worse than mis-filing a heading. */
const ENTRY_SOURCES: [string[], StatblockEntryKind][] = [
  [['special_abilities', 'specialAbilities', 'traits'], 'trait'],
  [['actions'], 'action'],
  [['bonus_actions', 'bonusActions'], 'bonus'],
  [['reactions'], 'reaction'],
  [['legendary_actions', 'legendaryActions'], 'legendary'],
  [['lair_actions', 'lairActions'], 'lair'],
];

function readEntries(raw: Record<string, unknown>): StatblockEntry[] {
  const out: StatblockEntry[] = [];
  for (const [keys, kind] of ENTRY_SOURCES) {
    const list = pick(raw, keys);
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const e = item as Record<string, unknown>;
      const rawName = asText(pick(e, ['name'])) ?? '';
      const body = asText(pick(e, ['desc', 'description', 'body'])) ?? '';
      if (!rawName && !body) continue;
      // PUBLISHED STAT BLOCKS BURY THE LIMIT IN THE NAME — "Legendary Resistance (3/Day)", "Fire Breath
      // (Recharge 5-6)". Split it out, because a use limit is a resource a DM SPENDS, not part of the
      // title: three refused saves is the whole difference between one boss fight and another. Anything
      // unrecognised stays in the name rather than being dropped.
      const limit = rawName.match(/^(.*?)\s*\((\d+\s*\/\s*(?:day|turn|round|rest|short rest|long rest)|recharge[^)]*)\)\s*$/i);
      const name = limit ? limit[1].trim() : rawName;
      const uses = limit ? limit[2].trim() : asText(pick(e, ['uses', 'usage_limit', 'usageLimit']));
      out.push({
        kind,
        name,
        body,
        ...(uses ? { uses } : {}),
        ...(asText(pick(e, ['attack_bonus', 'attackBonus', 'toHit'])) !== undefined
          ? { toHit: formatSigned(asNum(pick(e, ['attack_bonus', 'attackBonus', 'toHit']))) }
          : {}),
        ...(asText(pick(e, ['damage_dice', 'damageDice', 'damage'])) ? { damage: asText(pick(e, ['damage_dice', 'damageDice', 'damage']))! } : {}),
      });
    }
  }
  return out;
}

const formatSigned = (n: number | undefined): string | undefined =>
  n === undefined ? undefined : n < 0 ? `-${Math.abs(n)}` : `+${n}`;

/**
 * One raw SRD entry → the row plus everything derived from it. `deriveCreature` supplies the tags, the
 * variant-eligibility flag and the weak/elite statblocks in one call, so an importer cannot apply two of
 * the three — which is the whole reason that seam exists.
 */
export function srdCreatureToRow(raw: Record<string, unknown>, prov: ImportProvenance): ImportedCreature | null {
  const name = asText(pick(raw, ['name']));
  // A creature with no name is not a creature. Refused rather than imported as 'Unnamed', which would put
  // a row in the bestiary nobody can search for and nobody can fix.
  if (!name) return null;

  const cr = asText(pick(raw, ['challenge_rating', 'challengeRating', 'cr', 'level']));
  const statblock = normalizeStatblock({
    ac: asNum(pick(raw, ['armor_class', 'armorClass', 'ac'])),
    acNote: asText(pick(raw, ['armor_desc', 'armorDesc'])),
    hp: asNum(pick(raw, ['hit_points', 'hitPoints', 'hp'])),
    hitDice: asText(pick(raw, ['hit_dice', 'hitDice'])),
    speed: asText(pick(raw, ['speed'])),
    abilities: {
      str: asNum(pick(raw, ['strength', 'str'])), dex: asNum(pick(raw, ['dexterity', 'dex'])),
      con: asNum(pick(raw, ['constitution', 'con'])), int: asNum(pick(raw, ['intelligence', 'int'])),
      wis: asNum(pick(raw, ['wisdom', 'wis'])), cha: asNum(pick(raw, ['charisma', 'cha'])),
    },
    senses: asText(pick(raw, ['senses'])),
    languages: asText(pick(raw, ['languages'])),
    cr,
    resistances: asText(pick(raw, ['damage_resistances', 'damageResistances'])),
    immunities: asText(pick(raw, ['damage_immunities', 'damageImmunities'])),
    vulnerabilities: asText(pick(raw, ['damage_vulnerabilities', 'damageVulnerabilities'])),
    conditionImmunities: asText(pick(raw, ['condition_immunities', 'conditionImmunities'])),
    entries: readEntries(raw),
  });

  const type = asText(pick(raw, ['type']));
  const size = asText(pick(raw, ['size']));
  const derived = deriveCreature({ name, system: prov.system, cr, type, size, statblock });

  return {
    row: {
      slug: creatureSlug(name, prov.slugPrefix),
      name,
      system: prov.system,
      ...(type ? { type } : {}),
      ...(size ? { size } : {}),
      ...(asText(pick(raw, ['alignment'])) ? { alignment: asText(pick(raw, ['alignment']))! } : {}),
      ...(cr ? { cr } : {}),
      ...(crSort(cr) !== undefined ? { cr_sort: crSort(cr) } : {}),
      statblock,
      ...(asText(pick(raw, ['desc', 'description'])) ? { description: asText(pick(raw, ['desc', 'description']))! } : {}),
      tags: derived.tags,
      environments: Array.isArray(raw.environments) ? (raw.environments as string[]).map(String) : [],
      source: prov.source,
      licence: prov.licence,
      attribution: prov.attribution,
      ...(prov.sourceUrl ? { source_url: prov.sourceUrl } : {}),
      variant_eligible: derived.variantEligible,
    },
    derived,
  };
}
