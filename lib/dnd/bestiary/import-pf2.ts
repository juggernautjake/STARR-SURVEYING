// lib/dnd/bestiary/import-pf2.ts — one Foundry PF2e actor → one `dnd_creatures` row (B1-5).
//
// A SEPARATE TRANSFORM, NOT A FLAG ON `srdCreatureToRow`. The two sources share nothing structural:
//
//   5e-bits            Foundry pf2e
//   ---------------    ------------------------------------------
//   armor_class[0]     system.attributes.ac.value
//   strength: 8        system.abilities.str.mod: 0      ← a MODIFIER, not a score
//   challenge_rating   system.details.level.value       ← a LEVEL, and it can be negative
//   actions: [...]     items: [{ type: 'melee' | 'action' | 'spell', system: {...} }]
//   senses: {...}      system.perception.senses: [{ type }]
//
// Pointing the 5e reader at this yields a creature with no AC, no HP, no abilities and no actions — which
// it would report as a successful import, because every field is optional. B1-3 already paid for that
// lesson three times over (`senses`, `saves`, `skills` silently absent on 334 of 334); the response is a
// transform written against the real shape rather than a tolerant one hoping to cover both.
//
// ── ABILITIES ARE MODIFIERS, AND THAT IS NOT A DETAIL ────────────────────────────────────────────────
//
// PF2's remaster prints only modifiers — there is no score behind `Dex +3` and no formula recovers one.
// Writing 3 into `abilities` renders it as a SCORE of 3: a crippling weakness where the source states a
// strength. So these go to `abilityMods`, which exists for exactly this and permits negatives.
//
// ── LICENCE ──────────────────────────────────────────────────────────────────────────────────────────
//
// Monster Core is published under the ORC licence, and each Foundry item states `publication.license`.
// Anything not marked ORC is refused rather than guessed at — same rule as everywhere else here.
import { normalizeStatblock, type Statblock, type StatblockEntry } from '@/lib/dnd/homebrew/statblock';
import { deriveCreature } from './derive';
import { creatureSlug, type CreatureRow, type ImportedCreature, type ImportProvenance } from './import';

/** Foundry writes sizes as two-letter codes. */
const SIZES: Record<string, string> = {
  tiny: 'Tiny', sm: 'Small', med: 'Medium', lg: 'Large', huge: 'Huge', grg: 'Gargantuan',
};

/** The trait that names what KIND of thing a creature is. A PF2 trait list mixes ancestry, type and
 *  descriptors — `["goblin", "humanoid"]` — with no marker saying which is which, so the type is found by
 *  matching against the closed list of creature types rather than by position. */
const CREATURE_TYPES = new Set([
  'aberration', 'animal', 'astral', 'beast', 'celestial', 'construct', 'dragon', 'dream', 'elemental',
  'ethereal', 'fey', 'fiend', 'fungus', 'giant', 'humanoid', 'monitor', 'ooze', 'petitioner', 'plant',
  // `kami` and `shadow` are Bestiary 3's, added in B6-1: without them the Shae, the Owb and the whole
  // Japanese-folklore set imported with NO type at all, which the audit reported and a per-creature check
  // could not have. A closed list is the right design here — a PF2 trait array mixes ancestry with type —
  // but a closed list has to be extended when the source publishes a new one.
  'kami', 'shade', 'shadow', 'spirit', 'time', 'undead',
]);

const text = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  // Foundry stores prose as HTML and salts it with @UUID[...]{Label} references. Strip the tags, keep the
  // label out of the reference (it is the readable half), and collapse the whitespace that leaves behind.
  const s = v
    .replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, '$1')
    .replace(/@(?:Damage|Check|Template)\[[^\]]*\]\{([^}]*)\}/g, '$1')
    .replace(/@(?:Damage|Check|Template)\[([^\]]*)\]/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return s || undefined;
};

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const signed = (n: number): string => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/** "Acrobatics +5, Stealth +5" from `{ acrobatics: { base: 5 } }`. */
function readSkills(skills: unknown): string | undefined {
  if (!skills || typeof skills !== 'object') return undefined;
  const parts = Object.entries(skills as Record<string, { base?: number }>)
    .map(([k, v]) => {
      const n = num(v?.base);
      return n === undefined ? null : `${k.charAt(0).toUpperCase()}${k.slice(1)} ${signed(n)}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

/** "Fort +5, Ref +7, Will +3" — PF2's three saves, in the order every stat block prints them. */
function readSaves(saves: unknown): string | undefined {
  if (!saves || typeof saves !== 'object') return undefined;
  const s = saves as Record<string, { value?: number }>;
  const parts = ([['fortitude', 'Fort'], ['reflex', 'Ref'], ['will', 'Will']] as const)
    .map(([key, label]) => {
      const n = num(s[key]?.value);
      return n === undefined ? null : `${label} ${signed(n)}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

/** "Perception +2; darkvision" — PF2 folds perception and senses into one line. */
function readPerception(perception: unknown): string | undefined {
  if (!perception || typeof perception !== 'object') return undefined;
  const p = perception as { mod?: number; senses?: Array<{ type?: string; range?: number }> };
  const bits: string[] = [];
  const mod = num(p.mod);
  if (mod !== undefined) bits.push(`Perception ${signed(mod)}`);
  const senses = (p.senses ?? [])
    .map((s) => (s?.type ? (s.range ? `${s.type} ${s.range} feet` : s.type) : null))
    .filter(Boolean);
  if (senses.length) bits.push(senses.join(', '));
  return bits.length ? bits.join('; ') : undefined;
}

/** "25 feet, fly 30 feet". */
function readSpeed(attrs: Record<string, unknown>): string | undefined {
  const sp = attrs.speed as { value?: number; otherSpeeds?: Array<{ type?: string; value?: number }> } | undefined;
  if (!sp) return undefined;
  const bits: string[] = [];
  const walk = num(sp.value);
  if (walk !== undefined) bits.push(`${walk} feet`);
  for (const o of sp.otherSpeeds ?? []) {
    const n = num(o?.value);
    if (o?.type && n !== undefined) bits.push(`${o.type} ${n} feet`);
  }
  return bits.length ? bits.join(', ') : undefined;
}

/** Melee/ranged strikes and actions, out of the embedded item list. */
function readEntries(items: unknown): StatblockEntry[] {
  if (!Array.isArray(items)) return [];
  const out: StatblockEntry[] = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const item = it as { type?: string; name?: string; system?: Record<string, unknown> };
    const sys = item.system ?? {};
    const name = text(item.name) ?? '';
    if (!name) continue;

    if (item.type === 'melee') {
      const bonus = num((sys.bonus as { value?: number })?.value);
      // `damageRolls` is keyed by random ids, so the VALUES are the payload — a creature can have several
      // (a bite that also does poison), and joining them is how the printed line reads.
      const rolls = Object.values((sys.damageRolls ?? {}) as Record<string, { damage?: string; damageType?: string }>)
        .map((d) => [d?.damage, d?.damageType].filter(Boolean).join(' '))
        .filter(Boolean);
      const traits = ((sys.traits as { value?: string[] })?.value ?? []).join(', ');
      out.push({
        kind: 'action',
        name,
        body: traits ? `Traits: ${traits}` : '',
        ...(bonus !== undefined ? { toHit: signed(bonus) } : {}),
        ...(rolls.length ? { damage: rolls.join(' plus ') } : {}),
      });
      continue;
    }

    if (item.type === 'action') {
      const body = text((sys.description as { value?: string })?.value) ?? '';
      if (!body) continue;
      const actionType = (sys.actionType as { value?: string })?.value;
      // PF2's three action categories map onto the shared kinds; anything else is an action, per P13-1's
      // rule that mis-filing a heading beats losing the text.
      const kind = actionType === 'reaction' ? 'reaction' : actionType === 'passive' ? 'trait' : 'action';
      const cost = num((sys.actions as { value?: number })?.value);
      out.push({ kind, name, body, ...(cost ? { cost: String(cost) } : {}) });
    }
  }
  return out;
}

/**
 * Every licence stated anywhere on the actor's items.
 *
 * A SET, NOT THE FIRST ONE — and that distinction was a real bug. The original read the first item's
 * licence and refused anything that was not ORC, which threw out the Halfling Street Watcher: a genuine
 * Monster Core creature whose six items carry BOTH `OGL` and `ORC`, because one legacy entry was never
 * re-marked in the remaster. "First item wins" is arbitrary — item order is an implementation detail of
 * the pack file — so a creature's usability was decided by which weapon happened to be listed first.
 */
export function pf2Licences(actor: Record<string, unknown>): string[] {
  const items = Array.isArray(actor.items) ? actor.items : [];
  const out = new Set<string>();
  for (const it of items) {
    const lic = ((it as { system?: { publication?: { license?: string } } })?.system?.publication?.license ?? '').trim();
    if (lic) out.add(lic.toUpperCase());
  }
  return [...out];
}

/**
 * The licences this import may redistribute under.
 *
 * ORC was the only entry while Monster Core was the only pack. **Pathfinder Bestiary 1, 2 and 3 are
 * pre-remaster books published under the OGL**, verified against the pack files rather than assumed — and
 * OGL 1.0a permits redistribution with attribution exactly as ORC does. It is the same licence the Kobold
 * Press and EN Publishing books arrive under in `import-open5e.ts`, accepted there since the first run.
 *
 * An ALLOWLIST, not a blocklist, for the reason B2-3 wrote down: a blocklist says yes to everything nobody
 * thought of, and the cost of a false negative here is one creature not being catalogued.
 */
export const PF2_LICENCES = new Set(['ORC', 'OGL']);

/**
 * May this actor be redistributed?
 *
 * ANY ALLOWED LICENCE ANYWHERE IS ENOUGH, and a stale marker on one embedded item does not un-license the
 * creature. An actor with NO stated licence is refused — unstated is unknown, the same rule the image
 * pipeline uses — and so is one marked only with terms this import is not entitled to redistribute.
 */
export function pf2IsRedistributable(actor: Record<string, unknown>): boolean {
  return pf2Licences(actor).some((l) => PF2_LICENCES.has(l));
}

/**
 * The licence line the ROW records, read off the actor rather than taken from the caller.
 *
 * The provenance argument states a licence per PACK, which was right when there was one pack and is wrong
 * now: `howl-of-the-wild-bestiary` carries BOTH OGL and ORC across its creatures, so a single pack-level
 * value would print the wrong terms on some fraction of it. Every licence the actor actually states is
 * named, because which one a downstream reader relies on is not ours to choose for them.
 */
export function pf2LicenceLabel(actor: Record<string, unknown>): string | undefined {
  const found = pf2Licences(actor).filter((l) => PF2_LICENCES.has(l)).sort();
  return found.length ? found.join(' / ') : undefined;
}

/**
 * One Foundry PF2e actor → the row plus its derived tags and variants.
 *
 * Returns null for anything that is not a usable NPC: a missing name, a non-`npc` document, or a licence
 * this import is not entitled to redistribute.
 */
export function pf2ActorToRow(
  actor: Record<string, unknown>,
  prov: ImportProvenance,
): ImportedCreature | null {
  if (actor?.type !== 'npc') return null;
  const name = text(actor.name);
  if (!name) return null;

  // ORC required. Foundry ships several packs and not all carry the same terms; guessing is the one thing
  // this must not do. An actor stating no licence at all is refused too — unstated is unknown.
  if (!pf2IsRedistributable(actor)) return null;

  const system = (actor.system ?? {}) as Record<string, unknown>;
  const attrs = (system.attributes ?? {}) as Record<string, unknown>;
  const details = (system.details ?? {}) as Record<string, unknown>;
  const traits = (system.traits ?? {}) as Record<string, unknown>;

  const abilityMods: Record<string, number> = {};
  for (const [k, v] of Object.entries((system.abilities ?? {}) as Record<string, { mod?: number }>)) {
    const n = num(v?.mod);
    if (n !== undefined) abilityMods[k] = n;
  }

  const level = num((details.level as { value?: number })?.value);
  // PF2 prints a creature's tier as "Creature 3" — and level −1 is real (a goblin warrior). `cr_sort`
  // takes the same number, so ordering works without a second parse.
  const cr = level === undefined ? undefined : String(level);

  const traitList = ((traits.value as string[]) ?? []).map((t) => String(t).toLowerCase());
  const type = traitList.find((t) => CREATURE_TYPES.has(t));
  const size = SIZES[String((traits.size as { value?: string })?.value ?? '').toLowerCase()];

  const statblock: Statblock = normalizeStatblock({
    ac: num((attrs.ac as { value?: number })?.value),
    hp: num((attrs.hp as { max?: number })?.max),
    speed: readSpeed(attrs),
    abilityMods,
    saves: readSaves(system.saves),
    skills: readSkills(system.skills),
    senses: readPerception(system.perception),
    languages: (((details.languages as { value?: string[] })?.value ?? []) as string[]).join(', ') || undefined,
    cr,
    entries: readEntries(actor.items),
  });

  const description = text((details.publicNotes as string) ?? undefined);
  const derived = deriveCreature({ name, system: prov.system, cr, type, size, statblock });

  const row: CreatureRow = {
    slug: creatureSlug(name, prov.slugPrefix),
    name,
    system: prov.system,
    ...(type ? { type } : {}),
    ...(size ? { size } : {}),
    ...(cr ? { cr } : {}),
    ...(level !== undefined ? { cr_sort: level } : {}),
    statblock,
    ...(description ? { description } : {}),
    tags: derived.tags,
    environments: [],
    source: prov.source,
    // The actor's own stated licence wins over the pack-level one — see `pf2LicenceLabel`. The provenance
    // value remains the fallback so a pack whose items state nothing usable still cannot reach here
    // without a licence at all (`pf2IsRedistributable` has already refused that case).
    licence: pf2LicenceLabel(actor) ?? prov.licence,
    attribution: prov.attribution,
    ...(prov.sourceUrl ? { source_url: prov.sourceUrl } : {}),
    variant_eligible: derived.variantEligible,
  };

  return { row, derived };
}
