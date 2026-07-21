// lib/dnd/systems/intuitive-games/catalog.ts — the Intuitive Games vanilla library projected into a
// UI-ready, grouped catalog (IG builder Slice 7). The content lib (content.ts) holds the raw lists; this
// groups them (with effect text + provenance) so the builder's picker and the on-sheet reference browser
// render straight from one deterministic source. Everything here is VANILLA by definition — it IS the
// system — so each entry carries `source: 'vanilla'`. Custom/DM-granted elements come from the sheet +
// dm_granted and are flagged by provenance.ts, not here.
import {
  IG_STANCES, IG_FEATS, IG_POWERS, IG_SPELL_ROSTER, IG_DEFENSIVE_POWERS, IG_WEAPON_TYPES, IG_MOVEMENT_TYPES,
  IG_CREATURE_TYPES, IG_ACTIONS, IG_BACKGROUND_DEFS, IG_DAMAGE_TYPE_DATA, IG_COVER, IG_SIZE_CATEGORIES,
  IG_REDISTRIBUTION_MATERIALS, igCreaturesByGroup, type NamedEntry,
} from './content';
import {
  IG_WEAPON_CLASS_DATA, IG_WEAPON_PROPERTIES, IG_ARMORS, IG_SHIELDS, IG_EQUIPMENT_PACKS,
  IG_PROFESSIONAL_KITS, IG_ENCHANTMENTS,
} from './items';
import { IG_COMPANION_TYPE_DEFS, IG_COMPANION_FEATURES, IG_COMPANION_ASPECTS, IG_COMPANION_SIZES } from './companions';
import { igParentClasses, IG_CLASS_TAXONOMY } from './taxonomy';
import { igAllFeats } from './feats';
import { systemSpecies, systemSkills, systemConditions } from '../../system-rules';
import type { ElementKind } from '../../provenance';

/** The kinds this catalog groups by.
 *
 *  A superset of `ElementKind` (IG-S5). `ElementKind` is the PROVENANCE vocabulary — the kinds a held
 *  element can be classified vanilla/custom/DM-granted as — and gear tables, cover, damage types and the
 *  companion build options are reference content nobody "holds", so they were never going to earn an
 *  ElementKind. Widening here rather than there keeps the provenance vocabulary honest (every ElementKind
 *  still means something a character can carry) while letting the browsable catalog be complete, which is
 *  what IG-S5 is actually asking for. Consumers that filter by an ElementKind keep working unchanged. */
export type IGCatalogKind =
  | ElementKind
  | 'weapon-class' | 'weapon-property' | 'armor' | 'shield' | 'equipment' | 'enchantment'
  | 'companion-type' | 'companion-feature' | 'companion-size'
  | 'damage-type' | 'cover' | 'size' | 'redistribution-material';

export interface CatalogEntry {
  kind: IGCatalogKind;
  name: string;
  effect?: string;
  source: 'vanilla';
}

export interface CatalogGroup {
  /** Section title, e.g. "Stances", "Powers · Evocation". */
  title: string;
  kind: IGCatalogKind;
  entries: CatalogEntry[];
}

const entry = (kind: IGCatalogKind, e: NamedEntry | string): CatalogEntry =>
  typeof e === 'string' ? { kind, name: e, source: 'vanilla' } : { kind, name: e.name, effect: e.effect, source: 'vanilla' };

/** Group a NamedEntry list by its `category`, preserving first-seen category order. */
function byCategory(kind: IGCatalogKind, list: NamedEntry[], titlePrefix: string): CatalogGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, CatalogEntry[]>();
  for (const e of list) {
    const cat = e.category ?? '';
    if (!buckets.has(cat)) { buckets.set(cat, []); order.push(cat); }
    buckets.get(cat)!.push(entry(kind, e));
  }
  return order.map((cat) => ({ title: cat ? `${titlePrefix} · ${cat}` : titlePrefix, kind, entries: buckets.get(cat)! }));
}

/**
 * The full Intuitive Games vanilla catalog, grouped for display. Ancestries / classes / skills / conditions
 * come from the shared rules catalog (so they stay in sync with the system-rules entry); the IG-specific
 * content (stances, feats, powers, defensive powers, weapon types, movement, subclasses, companion types)
 * comes from the content library.
 */
export function igCatalog(): CatalogGroup[] {
  const groups: CatalogGroup[] = [];

  groups.push({ title: 'Ancestries', kind: 'ancestry', entries: systemSpecies('intuitive-games').map((n) => entry('ancestry', n)) });
  // Classes = the four PARENT classes; Subclasses = every subclass across all families (Area T1) — the
  // canonical taxonomy, replacing the old arbitrary flat split (some subclasses were listed as classes, and
  // the subclass group held only 5 of the 14).
  groups.push({ title: 'Classes', kind: 'class', entries: igParentClasses().map((n) => entry('class', n)) });
  groups.push({ title: 'Subclasses', kind: 'subclass', entries: IG_CLASS_TAXONOMY.flatMap((t) => t.subclasses).map((n) => entry('subclass', n)) });

  // Stances carry their A/B effect text.
  groups.push({ title: 'Stances', kind: 'stance', entries: IG_STANCES.map((s) => entry('stance', s)) });

  // Feats bucketed General / Combat — the FULL catalog (igAllFeats, 150+), matching the sheet's feat
  // picker and the AI's add_feat, not the ~20-entry IG_FEATS the sheet just references. Any IG_FEATS name
  // the full catalog doesn't carry is preserved under an "unlisted" group (never silently dropped).
  groups.push(...byCategory('feat', igAllFeats(), 'Feats'));
  const featSet = new Set(igAllFeats().map((f) => f.name.trim().toLowerCase()));
  const unlistedFeats = IG_FEATS.filter((f) => !featSet.has(f.name.trim().toLowerCase()));
  if (unlistedFeats.length) groups.push({ title: 'Feats · Unlisted (pending reconcile)', kind: 'feat', entries: unlistedFeats.map((f) => entry('feat', f)) });

  // Powers: the FULL spell-list roster grouped by school — parity with the sheet's add-power picker and
  // the AI's add_power (which both use the roster), so the builder can't offer fewer powers than they can.
  // Effect text is attached from IG_POWERS where Brendan's text has landed; name-only otherwise (honest
  // WIP, never fabricated — Ground Rule 2). Any IG_POWERS the current roster doesn't list are PRESERVED
  // under an "unlisted" group (possible renames/removals only Brendan can reconcile — never silently dropped).
  const powerMeta = new Map(IG_POWERS.map((p) => [p.name.trim().toLowerCase(), p] as const));
  for (const [school, spellNames] of Object.entries(IG_SPELL_ROSTER)) {
    groups.push({
      title: `Powers · ${school}`,
      kind: 'power',
      entries: spellNames.map((n) => ({ kind: 'power' as const, name: n, effect: powerMeta.get(n.trim().toLowerCase())?.effect, source: 'vanilla' as const })),
    });
  }
  const rosterSet = new Set(Object.values(IG_SPELL_ROSTER).flat().map((n) => n.trim().toLowerCase()));
  const unlisted = IG_POWERS.filter((p) => !rosterSet.has(p.name.trim().toLowerCase()));
  if (unlisted.length) groups.push({ title: 'Powers · Unlisted (pending reconcile)', kind: 'power', entries: unlisted.map((p) => entry('power', p)) });
  groups.push({ title: 'Defensive powers', kind: 'defensive-power', entries: IG_DEFENSIVE_POWERS.map((d) => entry('defensive-power', d)) });

  // Backgrounds. IG-S5 found these CATALOGUED but never SURFACED: `IG_BACKGROUND_DEFS` has been in
  // content.ts, and the classifier's KIND_NAMES already recognised a background by name, but igCatalog()
  // never emitted a group for them — so the builder's picker and the AI grounding (which both read this
  // function) could not offer a single one. The effect line carries what the choice actually decides:
  // starting HP, the boosts, the proficiencies and the stance it grants.
  groups.push({
    title: 'Backgrounds', kind: 'background',
    entries: IG_BACKGROUND_DEFS.map((b) => ({
      kind: 'background' as const, name: b.name, source: 'vanilla' as const,
      effect: `${b.hp} HP · ${b.boosts} · proficient: ${b.proficiencies.join(', ')} · grants the ${b.stance} stance.`,
    })),
  });

  groups.push({ title: 'Weapon types', kind: 'weapon-type', entries: IG_WEAPON_TYPES.map((n) => entry('weapon-type', n)) });
  // The gear tables. The site's WEAPONS page publishes a framework and no named weapons (IG_WEAPON_RULES
  // says so in as many words), so what there IS to catalogue is the classes and the properties — and
  // those are what a player picks between when building a weapon on the sheet. Armor and shields ARE
  // complete on the site, and none of the four had any catalog presence before IG-S5.
  groups.push({
    title: 'Weapon classes', kind: 'weapon-class',
    entries: IG_WEAPON_CLASS_DATA.map((w) => ({ kind: 'weapon-class' as const, name: w.name, source: 'vanilla' as const, effect: `${w.kind} · ${w.cost} · ${w.notes}` })),
  });
  groups.push({
    title: 'Weapon properties', kind: 'weapon-property',
    entries: IG_WEAPON_PROPERTIES.map((p) => ({ kind: 'weapon-property' as const, name: p.name, source: 'vanilla' as const, effect: `${p.appliesTo}. ${p.text}` })),
  });
  groups.push({
    title: 'Armor', kind: 'armor',
    entries: IG_ARMORS.map((a) => ({ kind: 'armor' as const, name: a.name, source: 'vanilla' as const, effect: `${a.group} · DR ${a.dr} · ${a.strength} · ${a.cost}${a.notes ? ` · ${a.notes}` : ''}` })),
  });
  groups.push({
    title: 'Shields', kind: 'shield',
    entries: IG_SHIELDS.map((s) => ({ kind: 'shield' as const, name: s.name, source: 'vanilla' as const, effect: `${s.group} · ${s.cost}${s.notes ? ` · ${s.notes}` : ''}` })),
  });
  groups.push({
    title: 'Equipment packs', kind: 'equipment',
    entries: [
      ...IG_EQUIPMENT_PACKS.map((p) => ({ kind: 'equipment' as const, name: p.name, source: 'vanilla' as const, effect: `${p.cost} — ${p.contents}` })),
      // The kits are a bare name list on the site, all at one price; they get the same price line rather
      // than an invented description of what is in each.
      ...IG_PROFESSIONAL_KITS.map((k) => ({ kind: 'equipment' as const, name: `${k} kit`, source: 'vanilla' as const, effect: '4 Solidas.' })),
    ],
  });
  groups.push({
    title: 'Magical items · Eldritch Jewel enchantments', kind: 'enchantment',
    entries: IG_ENCHANTMENTS.map((e) => ({ kind: 'enchantment' as const, name: e.name, source: 'vanilla' as const, effect: e.effect })),
  });

  groups.push({ title: 'Movement types', kind: 'movement-type', entries: IG_MOVEMENT_TYPES.map((n) => entry('movement-type', n)) });
  groups.push({ title: 'Skills', kind: 'skill', entries: systemSkills('intuitive-games').map((s) => entry('skill', s.name)) });
  groups.push({ title: 'Conditions', kind: 'condition', entries: systemConditions('intuitive-games').map((n) => entry('condition', n)) });
  groups.push({ title: 'Companion creature types', kind: 'creature-type', entries: IG_CREATURE_TYPES.map((n) => entry('creature-type', n)) });
  // The full bestiary, grouped by category (Data Sheet: Creatures).
  const bestiary = igCreaturesByGroup();
  for (const [grp, list] of Object.entries(bestiary)) {
    groups.push({ title: `Creatures · ${grp}`, kind: 'creature-type', entries: list.map((n) => entry('creature-type', n)) });
  }
  // Actions grouped by the 3-action economy (Reference Sheet). Actions aren't provenance-classified, so
  // these carry the 'action' kind purely for display in the reference browser.
  const econ = new Map<string, typeof IG_ACTIONS>();
  for (const a of IG_ACTIONS) { const k = `${a.economy} actions`; if (!econ.has(k)) econ.set(k, []); econ.get(k)!.push(a); }
  for (const [title, list] of econ) {
    groups.push({ title: `Actions · ${title}`, kind: 'action', entries: list.map((a) => ({ kind: 'action' as const, name: a.note ? `${a.name} (${a.note})` : a.name, source: 'vanilla' as const })) });
  }

  // The companion BUILD system (companions.ts), which the catalog previously represented only as the
  // bestiary's creature-type groups — i.e. what a companion IS, never what it can be built with. An
  // Archon picking features and aspects had nothing to pick from here.
  groups.push({
    title: 'Companion types', kind: 'companion-type',
    entries: IG_COMPANION_TYPE_DEFS.map((c) => ({ kind: 'companion-type' as const, name: c.name, source: 'vanilla' as const, effect: `${c.subclass}${c.sizeLimit ? ` · ${c.sizeLimit}` : ''} — ${c.effect}` })),
  });
  groups.push({
    title: 'Companion features', kind: 'companion-feature',
    entries: IG_COMPANION_FEATURES.map((f) => ({ kind: 'companion-feature' as const, name: f.name, source: 'vanilla' as const, effect: f.effect })),
  });
  // Aspects share the companion-feature kind because they are the same THING to a picker — a named
  // option a companion takes — and differ only in what unlocks them, which the title already says.
  groups.push({
    title: 'Companion aspects (require the Aspect class power)', kind: 'companion-feature',
    entries: IG_COMPANION_ASPECTS.map((a) => ({ kind: 'companion-feature' as const, name: a.name, source: 'vanilla' as const, effect: a.effect })),
  });
  groups.push({
    title: 'Companion sizes', kind: 'companion-size',
    entries: IG_COMPANION_SIZES.map((s) => ({ kind: 'companion-size' as const, name: s.name, source: 'vanilla' as const, effect: `Reach ${s.reachFt} ft · STR ${s.strMod >= 0 ? '+' : ''}${s.strMod} · DEX ${s.dexMod >= 0 ? '+' : ''}${s.dexMod} · Stealth ${s.stealthMod >= 0 ? '+' : ''}${s.stealthMod} · ${s.note}` })),
  });

  // Core-rules reference tables. Not things a character "holds", which is why they have no ElementKind
  // and why they were missing — but a player mid-fight wants to look up cover and damage types, and the
  // library is where they would look.
  groups.push({
    title: 'Damage types', kind: 'damage-type',
    entries: IG_DAMAGE_TYPE_DATA.map((d) => ({ kind: 'damage-type' as const, name: d.name, source: 'vanilla' as const, effect: d.note })),
  });
  groups.push({
    title: 'Cover', kind: 'cover',
    entries: IG_COVER.map((c) => ({ kind: 'cover' as const, name: c.name, source: 'vanilla' as const, effect: c.effect })),
  });
  // Sizes are a bare name list on the site — nine categories with a single shared note and no per-size
  // table. That note goes on every entry rather than a per-size effect being invented for each.
  groups.push({
    title: 'Size categories', kind: 'size',
    entries: IG_SIZE_CATEGORIES.map((n) => ({ kind: 'size' as const, name: n, source: 'vanilla' as const })),
  });
  groups.push({
    title: 'Redistribution materials', kind: 'redistribution-material',
    entries: IG_REDISTRIBUTION_MATERIALS.map((m) => ({ kind: 'redistribution-material' as const, name: m.name, source: 'vanilla' as const, effect: `${m.description} Launch damage: ${m.launchDamage}.` })),
  });

  return groups.filter((g) => g.entries.length > 0);
}

/** Total number of vanilla elements in the catalog (handy for a header count). */
export function igCatalogCount(): number {
  return igCatalog().reduce((n, g) => n + g.entries.length, 0);
}
