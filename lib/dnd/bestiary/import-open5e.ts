// lib/dnd/bestiary/import-open5e.ts — one Open5e v2 creature → one `dnd_creatures` row.
//
// ── WHY A THIRD TRANSFORM ────────────────────────────────────────────────────────────────────────────
//
// This is the third source shape in the bestiary and, like the second, it earns its own reader rather than
// another fallback path bolted onto `srdCreatureToRow`. Open5e v2 shares almost no field paths with either
// existing source:
//
//   5e-bits                  Foundry pf2e                    Open5e v2
//   ----------------------   -----------------------------   ---------------------------------------
//   armor_class[0].value     system.attributes.ac.value      armor_class            (a bare number)
//   strength: 8              system.abilities.str.mod        ability_scores.strength
//   senses: { darkvision }   system.perception.senses[]      darkvision_range       (a number of FEET)
//   special_abilities[]      items[type=action]              traits[] + actions[].action_type
//   type: "humanoid (elf)"   traits[]                        type: { name, key }    (an OBJECT)
//
// The B1-3 lesson is the reason: a tolerant reader pointed at an unfamiliar shape does not fail, it
// silently returns a creature with four missing lines and reports success. Every field below is read from
// the path Open5e actually publishes, verified against live responses rather than an imagined fixture.
//
// ── SENSES ARE NUMBERS HERE, AND THAT IS THE TRAP ────────────────────────────────────────────────────
//
// The other two sources publish a senses LINE. Open5e publishes `darkvision_range: 60` and
// `passive_perception: 17` as separate integers with no prose anywhere, so a reader that looks for a
// `senses` string finds nothing and every creature loses its darkvision — which is exactly what happened
// to all 334 creatures in B1-3, from the opposite cause. The line is composed here instead, in the order a
// stat block prints it, and a creature with no special senses gets the passive Perception alone rather
// than an invented dash.
//
// `normal_sight_range` is deliberately NOT printed: it is 10560 (two miles) on ordinary creatures, which
// is Open5e recording "has eyes", not a sense a stat block states.
//
// ── LICENCE ──────────────────────────────────────────────────────────────────────────────────────────
//
// Every Open5e document declares its licences as data (`licenses: [{ key }]`), and this refuses anything
// that is not on the allowlist — the same rule as the PF2 importer, and the same reason: unstated is
// unknown, and a creature whose licence we cannot state does not get catalogued (G3). The allowlist is an
// ALLOWLIST rather than a blocklist because a blocklist says yes to everything nobody thought of.
//
// Note this is where the boundary sits for the whole bestiary: the freely-licensed monster corpus is large
// (Tome of Beasts, Creature Codex, Monstrous Menagerie, Black Flag), and the copyrighted Monster Manual
// corpus is not part of it at any size. Nothing here reads a page that reproduces a book.
import { normalizeStatblock, type Statblock, type StatblockEntry, type StatblockEntryKind } from '@/lib/dnd/homebrew/statblock';
import { deriveCreature } from './derive';
import { creatureSlug, crSort, formatCr, type CreatureRow, type ImportedCreature, type ImportProvenance } from './import';

/** Licence keys we are able to state and redistribute under. Anything else is refused by name. */
export const OPEN5E_LICENCES = new Set(['ogl-10a', 'cc-by-40', 'cc0']);

export interface Open5eLicence { key?: string; name?: string }

/** Whether a document's licence set permits redistribution.
 *
 *  ANY match is enough, mirroring the fix B1-5 had to make for Pathfinder: a document that carries both
 *  OGL and CC-BY is dual-licensed and we may use either. A document that states NO licence is refused —
 *  unstated is unknown, not permissive. */
export function open5eIsRedistributable(licences: Open5eLicence[] | undefined | null): boolean {
  const keys = (licences ?? []).map((l) => String(l?.key ?? '').toLowerCase()).filter(Boolean);
  return keys.some((k) => OPEN5E_LICENCES.has(k));
}

/** The licence line the row records. Both are named when a document is dual-licensed, because which one we
 *  rely on is not ours to decide for a downstream reader. */
export function open5eLicenceLabel(licences: Open5eLicence[] | undefined | null): string {
  const names = (licences ?? [])
    .map((l) => LICENCE_LABELS[String(l?.key ?? '').toLowerCase()] ?? l?.name)
    .filter(Boolean) as string[];
  return names.join(' / ');
}

const LICENCE_LABELS: Record<string, string> = {
  'ogl-10a': 'OGL-1.0a',
  'cc-by-40': 'CC-BY-4.0',
  cc0: 'CC0',
};

const str = (v: unknown): string | undefined => {
  if (typeof v === 'string') { const s = v.trim(); return s || undefined; }
  if (v && typeof v === 'object') {
    // `type`, `size` and the damage entries are `{ name, key }`. The NAME is the printed word.
    const o = v as Record<string, unknown>;
    return str(o.name) ?? str(o.key);
  }
  return undefined;
};

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const ABILITY_KEYS = {
  str: 'strength', dex: 'dexterity', con: 'constitution',
  int: 'intelligence', wis: 'wisdom', cha: 'charisma',
} as const;

const SKILL_LABELS: Record<string, string> = {
  animal_handling: 'Animal Handling', sleight_of_hand: 'Sleight of Hand',
};
const label = (k: string) => SKILL_LABELS[k] ?? k.replace(/(^|_)(\w)/g, (_, s, c) => (s ? ' ' : '') + c.toUpperCase());

const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));

/**
 * The senses line, composed from the integers Open5e publishes instead of prose.
 *
 * Order follows a printed stat block — the special senses, then passive Perception last — so a DM reading
 * it recognises the line rather than parsing it.
 */
export function open5eSenses(raw: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const ranged: Array<[string, string]> = [
    ['blindsight_range', 'blindsight'],
    ['darkvision_range', 'darkvision'],
    ['tremorsense_range', 'tremorsense'],
    ['truesight_range', 'truesight'],
  ];
  for (const [key, word] of ranged) {
    const n = num(raw[key]);
    if (n !== undefined && n > 0) parts.push(`${word} ${n} ft.`);
  }
  const pp = num(raw.passive_perception);
  if (pp !== undefined) parts.push(`passive Perception ${pp}`);
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * The speed line.
 *
 * From `speed` (the modes the creature actually has) rather than `speed_all` (every mode, zero-filled) —
 * printing "fly 0 ft., burrow 0 ft." on a wolf would be four false statements per creature. `hover` is a
 * boolean rather than a distance and is appended to the fly entry, which is how the books print it.
 */
export function open5eSpeed(raw: Record<string, unknown>): string | undefined {
  const speed = (raw.speed && typeof raw.speed === 'object' ? raw.speed : null) as Record<string, unknown> | null;
  if (!speed) return undefined;
  const unit = str(speed.unit) === 'feet' ? 'ft.' : (str(speed.unit) ?? 'ft.');
  const hover = (raw.speed_all as Record<string, unknown> | undefined)?.hover === true;
  const parts: string[] = [];
  const walk = num(speed.walk);
  if (walk !== undefined && walk > 0) parts.push(`${walk} ${unit}`);
  for (const mode of ['burrow', 'climb', 'fly', 'swim'] as const) {
    const n = num(speed[mode]);
    if (n !== undefined && n > 0) parts.push(`${mode} ${n} ${unit}${mode === 'fly' && hover ? ' (hover)' : ''}`);
  }
  return parts.length ? parts.join(', ') : undefined;
}

/** Saves as a printed line. `saving_throws` holds only the PROFICIENT ones; `saving_throws_all` fills in
 *  every ability from its modifier, which would print six saves on a creature the book gives none. */
export function open5eSaves(raw: Record<string, unknown>): string | undefined {
  const src = (raw.saving_throws && typeof raw.saving_throws === 'object' ? raw.saving_throws : null) as Record<string, unknown> | null;
  if (!src) return undefined;
  const parts: string[] = [];
  for (const [abbr, full] of Object.entries(ABILITY_KEYS)) {
    const n = num(src[full]);
    if (n !== undefined) parts.push(`${abbr.toUpperCase()} ${sign(n)}`);
  }
  return parts.length ? parts.join(', ') : undefined;
}

/** Skills, same reasoning as saves — the proficient list, not the zero-filled one. */
export function open5eSkills(raw: Record<string, unknown>): string | undefined {
  const src = (raw.skill_bonuses && typeof raw.skill_bonuses === 'object' ? raw.skill_bonuses : null) as Record<string, unknown> | null;
  if (!src) return undefined;
  const parts = Object.entries(src)
    .map(([k, v]) => { const n = num(v); return n === undefined ? null : `${label(k)} ${sign(n)}`; })
    .filter(Boolean) as string[];
  return parts.length ? parts.join(', ') : undefined;
}

const ACTION_KINDS: Record<string, StatblockEntryKind> = {
  ACTION: 'action',
  BONUS_ACTION: 'bonus',
  REACTION: 'reaction',
  LEGENDARY_ACTION: 'legendary',
  LAIR_ACTION: 'lair',
  MYTHIC_ACTION: 'legendary',
};

/** "Recharge 5-6", "3/Day" — the resource a DM spends mid-fight, kept out of the name (see `uses`). */
export function open5eUses(limits: unknown): string | undefined {
  if (!limits || typeof limits !== 'object') return undefined;
  const l = limits as Record<string, unknown>;
  const type = str(l.type);
  const param = num(l.param);
  if (type === 'RECHARGE_ON_ROLL' && param !== undefined) return param >= 6 ? 'Recharge 6' : `Recharge ${param}-6`;
  if (type === 'PER_DAY' && param !== undefined) return `${param}/Day`;
  if (type === 'RECHARGE_AFTER_REST') return 'Recharges after a Short or Long Rest';
  return type ? type.toLowerCase().replace(/_/g, ' ') : undefined;
}

/** An attack's damage, assembled from the die fields. Both the base and the extra die are printed, because
 *  a Slam that deals "1d8 + 4 plus 6d6 fire" is a very different attack from one that deals 1d8 + 4. */
export function open5eDamage(attack: Record<string, unknown>): string | undefined {
  const build = (count: unknown, die: unknown, bonus: unknown, type: unknown): string | undefined => {
    const c = num(count);
    const d = str(die)?.toLowerCase();
    const b = num(bonus);
    if (!c || !d) return b ? `${b}${str(type) ? ` ${str(type)!.toLowerCase()}` : ''}` : undefined;
    const t = str(type);
    return `${c}${d}${b ? ` + ${b}` : ''}${t ? ` ${t.toLowerCase()}` : ''}`;
  };
  const base = build(attack.damage_die_count, attack.damage_die_type, attack.damage_bonus, attack.damage_type);
  const extra = build(attack.extra_damage_die_count, attack.extra_damage_die_type, attack.extra_damage_bonus, attack.extra_damage_type);
  return [base, extra].filter(Boolean).join(' plus ') || undefined;
}

function readEntries(raw: Record<string, unknown>): StatblockEntry[] {
  const out: StatblockEntry[] = [];

  for (const t of Array.isArray(raw.traits) ? raw.traits : []) {
    const o = t as Record<string, unknown>;
    const name = str(o.name);
    const body = str(o.desc);
    if (name && body) out.push({ kind: 'trait', name, body });
  }

  const actions = (Array.isArray(raw.actions) ? raw.actions : []) as Record<string, unknown>[];
  // Sorted by the source's own `order_in_statblock`, because the array arrives ALPHABETICAL — which puts
  // Multiattack in the middle of the list, where it means nothing. The books print it first for a reason.
  const ordered = [...actions].sort((a, b) => (num(a.order_in_statblock) ?? 99) - (num(b.order_in_statblock) ?? 99));
  for (const a of ordered) {
    const name = str(a.name);
    const body = str(a.desc);
    if (!name || !body) continue;
    const kind = ACTION_KINDS[str(a.action_type) ?? ''] ?? 'action';
    const entry: StatblockEntry = { kind, name, body };

    const attack = (Array.isArray(a.attacks) ? a.attacks : [])[0] as Record<string, unknown> | undefined;
    if (attack) {
      const toHit = num(attack.to_hit_mod);
      if (toHit !== undefined) entry.toHit = sign(toHit);
      const dmg = open5eDamage(attack);
      if (dmg) entry.damage = dmg;
    }
    const uses = open5eUses(a.usage_limits);
    if (uses) entry.uses = uses;
    const cost = num(a.legendary_action_cost);
    if (cost !== undefined && cost > 1) entry.cost = `${cost} actions`;

    out.push(entry);
  }
  return out;
}

/**
 * The entry list: v2's, plus v1's actions when v2 migrated none.
 *
 * Traits always come from v2 (they are complete there), and the fallback adds only the ACTION-shaped
 * kinds — so a creature never ends up with its traits listed twice.
 */
export function entriesFor(raw: Record<string, unknown>, v1?: Record<string, unknown>): StatblockEntry[] {
  const v2 = readEntries(raw);
  const fallback = v1FallbackEntries(v1);
  if (!fallback.length) return v2;

  // PER KIND, which the first version got wrong in a way the run reported and I nearly shipped. It fell
  // back only when v2 had NOTHING but traits — and 205 Tome of Beasts 3 creatures have exactly one
  // migrated entry, a Reaction. Those short-circuited as "v2 has actions" and kept the reaction while
  // losing every actual attack: 205 monsters that could parry but never strike.
  //
  // So v2 wins for any kind it actually carries (its entries have the structured to-hit and damage that
  // make an entry rollable), and v1 supplies only the kinds v2 left empty. Nothing is ever listed twice.
  const have = new Set(v2.map((e) => e.kind));
  const filled = fallback.filter((e) => !have.has(e.kind));
  if (!filled.length) return v2;
  return [...v2, ...filled];
}

/**
 * An attack's to-hit and damage, read out of the prose a publisher wrote.
 *
 * Needed only for the v1 fallback below, where actions arrive as `{ name, desc }` with no structured
 * attack. This is EXTRACTION, not invention: `+8 to hit` and `18 (3d8+5) slashing damage` are both stated
 * verbatim in the text, and pulling them out is what turns a readable stat block into a clickable one
 * (G4). Nothing is computed — an action whose prose states neither gets neither.
 */
export function parseAttackFromProse(desc: string): { toHit?: string; damage?: string } {
  const out: { toHit?: string; damage?: string } = {};
  const hit = desc.match(/([+-]\d+)\s+to hit/i);
  if (hit) out.toHit = hit[1];

  // "18 (3d8+5) slashing damage", and any "plus 21 (6d6) fire damage" riders after it. The averaged number
  // outside the parentheses is dropped: it is the source's own rounding of the dice, and printing both
  // would show a DM two numbers for one hit.
  const parts: string[] = [];
  const re = /\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*([a-z]+)?\s*damage/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc)) !== null) {
    parts.push(`${m[1].replace(/\s+/g, '')}${m[2] ? ` ${m[2].toLowerCase()}` : ''}`);
  }
  if (parts.length) out.damage = parts.join(' plus ');
  return out;
}

/** The v1 action lists, in the order a stat block prints them. */
const V1_LISTS: Array<[string, StatblockEntryKind]> = [
  ['actions', 'action'],
  ['bonus_actions', 'bonus'],
  ['reactions', 'reaction'],
  ['legendary_actions', 'legendary'],
];

/**
 * Actions read from Open5e's v1 endpoint, for creatures whose v2 record has none.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────────
 *
 * v2 is the better source: it publishes attacks as structured data (`to_hit_mod`, damage dice), which is
 * what makes an entry rollable without parsing prose. But its migration is INCOMPLETE — 396 of Tome of
 * Beasts 3's 397 creatures arrive with `actions: []`, while v1 carries all of them. Verified per creature
 * against both endpoints, not inferred: `tob3_ahu-nixta-mechanon` has an empty v2 action list and a Slam,
 * a Multiattack and a Utility Arm in v1.
 *
 * Importing them from v2 alone would have put 396 stat blocks in the catalogue with a full defensive line
 * and NOTHING TO DO ON THEIR TURN — each one transforming successfully, looking complete, and useless at
 * the table. That is the B1-3 failure exactly, and the reason the run counts missing actions out loud.
 *
 * The fallback is per-creature and only fires when v2 is empty, so a creature genuinely printed without
 * actions (a Frog, a Seahorse, a Shrieker — three real cases) stays that way rather than being padded.
 */
export function v1FallbackEntries(v1: Record<string, unknown> | undefined): StatblockEntry[] {
  if (!v1) return [];
  const out: StatblockEntry[] = [];
  for (const [key, kind] of V1_LISTS) {
    const list = v1[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const o = (item ?? {}) as Record<string, unknown>;
      const name = str(o.name);
      const body = str(o.desc);
      if (!name || !body) continue;
      out.push({ kind, name, body, ...parseAttackFromProse(body) });
    }
  }
  return out;
}

/**
 * Transform one Open5e v2 creature into a catalogue row.
 *
 * Returns null — with the reason recorded by the caller — when the creature has no name, or when its
 * document's licence is not one we can state. Nothing is guessed and nothing is defaulted: a missing AC
 * stays missing rather than becoming 0.
 */
export function open5eCreatureToRow(
  raw: Record<string, unknown>,
  prov: ImportProvenance,
  /** The same creature's v1 record, used ONLY to supply actions v2 has not migrated. See `v1FallbackEntries`. */
  v1?: Record<string, unknown>,
): ImportedCreature | null {
  const name = str(raw.name);
  if (!name) return null;

  const scores = (raw.ability_scores && typeof raw.ability_scores === 'object' ? raw.ability_scores : null) as Record<string, unknown> | null;
  const abilities: Statblock['abilities'] = {};
  if (scores) {
    for (const [abbr, full] of Object.entries(ABILITY_KEYS)) {
      const n = num(scores[full]);
      if (n !== undefined) abilities[abbr as keyof typeof ABILITY_KEYS] = n;
    }
  }

  const ri = (raw.resistances_and_immunities && typeof raw.resistances_and_immunities === 'object'
    ? raw.resistances_and_immunities : {}) as Record<string, unknown>;

  const cr = formatCr(raw.challenge_rating);
  const statblock = normalizeStatblock({
    ac: num(raw.armor_class),
    acNote: str(raw.armor_detail),
    hp: num(raw.hit_points),
    hitDice: str(raw.hit_dice),
    speed: open5eSpeed(raw),
    abilities: Object.keys(abilities).length ? abilities : undefined,
    saves: open5eSaves(raw),
    skills: open5eSkills(raw),
    senses: open5eSenses(raw),
    // `languages` is `{ as_string, data[] }`; the string is the printed line and the array is a lookup.
    languages: str((raw.languages as Record<string, unknown> | undefined)?.as_string),
    cr,
    xp: num(raw.experience_points),
    resistances: str(ri.damage_resistances_display),
    immunities: str(ri.damage_immunities_display),
    vulnerabilities: str(ri.damage_vulnerabilities_display),
    conditionImmunities: str(ri.condition_immunities_display),
    entries: entriesFor(raw, v1),
  });

  const type = str(raw.type)?.toLowerCase();
  const size = str(raw.size);
  const alignment = str(raw.alignment)?.toLowerCase();

  const derived = deriveCreature({ name, system: prov.system, type, size, cr, statblock });

  const row: CreatureRow = {
    slug: creatureSlug(name, prov.slugPrefix),
    name,
    system: prov.system,
    type,
    size,
    alignment,
    cr,
    cr_sort: crSort(cr),
    statblock,
    // The book is named in the description as well as in `source`, because a DM reading a Tome of Beasts
    // creature next to an SRD one should be able to see which book it came from without leaving the page.
    description: `From ${prov.source}.`,
    tags: derived.tags,
    environments: (Array.isArray(raw.environments) ? raw.environments : [])
      .map((e) => str(e))
      .filter(Boolean) as string[],
    source: prov.source,
    licence: prov.licence,
    attribution: prov.attribution,
    source_url: prov.sourceUrl,
    variant_eligible: derived.variantEligible,
  };

  return { row, derived };
}
