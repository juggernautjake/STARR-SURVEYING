// lib/dnd/systems/intuitive-games/catalog.ts — the Intuitive Games vanilla library projected into a
// UI-ready, grouped catalog (IG builder Slice 7). The content lib (content.ts) holds the raw lists; this
// groups them (with effect text + provenance) so the builder's picker and the on-sheet reference browser
// render straight from one deterministic source. Everything here is VANILLA by definition — it IS the
// system — so each entry carries `source: 'vanilla'`. Custom/DM-granted elements come from the sheet +
// dm_granted and are flagged by provenance.ts, not here.
import {
  IG_STANCES, IG_FEATS, IG_POWERS, IG_SPELL_ROSTER, IG_DEFENSIVE_POWERS, IG_WEAPON_TYPES, IG_MOVEMENT_TYPES,
  IG_SUBCLASSES, IG_CREATURE_TYPES, IG_ACTIONS, igCreaturesByGroup, type NamedEntry,
} from './content';
import { igAllFeats } from './feats';
import { systemSpecies, systemClasses, systemSkills, systemConditions } from '../../system-rules';
import type { ElementKind } from '../../provenance';

export interface CatalogEntry {
  kind: ElementKind;
  name: string;
  effect?: string;
  source: 'vanilla';
}

export interface CatalogGroup {
  /** Section title, e.g. "Stances", "Powers · Evocation". */
  title: string;
  kind: ElementKind;
  entries: CatalogEntry[];
}

const entry = (kind: ElementKind, e: NamedEntry | string): CatalogEntry =>
  typeof e === 'string' ? { kind, name: e, source: 'vanilla' } : { kind, name: e.name, effect: e.effect, source: 'vanilla' };

/** Group a NamedEntry list by its `category`, preserving first-seen category order. */
function byCategory(kind: ElementKind, list: NamedEntry[], titlePrefix: string): CatalogGroup[] {
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
  groups.push({ title: 'Classes', kind: 'class', entries: systemClasses('intuitive-games').map((c) => entry('class', c.name)) });
  groups.push({ title: 'Subclasses', kind: 'subclass', entries: IG_SUBCLASSES.map((n) => entry('subclass', n)) });

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

  groups.push({ title: 'Weapon types', kind: 'weapon-type', entries: IG_WEAPON_TYPES.map((n) => entry('weapon-type', n)) });
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

  return groups.filter((g) => g.entries.length > 0);
}

/** Total number of vanilla elements in the catalog (handy for a header count). */
export function igCatalogCount(): number {
  return igCatalog().reduce((n, g) => n + g.entries.length, 0);
}
