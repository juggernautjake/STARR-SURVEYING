// lib/dnd/systems/pathfinder2e/catalog.ts — the PF2 vanilla library projected into a UI-ready, grouped
// catalog. content.ts holds the raw data; this groups it (classes, ancestries, backgrounds, skills, the
// three-action economy) so the builder's pickers and the on-sheet reference browser render from one
// deterministic source. Everything here is vanilla by definition — it IS the system.
import { PF2_CLASSES, PF2_ANCESTRIES, PF2_BACKGROUNDS, PF2_SKILLS } from './content';
// The FULL tranches, not the 25-entry seed. The seed stays in content.ts for the consumers that
// predate the catalog buildout; anything BROWSABLE should show what we actually have.
import {
  PF2_WEAPONS_FULL, PF2_ARMORS_FULL, PF2_SHIELDS, PF2_RUNES, PF2_ITEMS,
  PF2_ALL_SPELLS, PF2_ALL_FEATS, PF2_CONDITIONS, PF2_ACTIONS,
} from './data';

const rankLabel = (r: number) => (r === 0 ? 'cantrip' : `rank ${r}`);

export interface PF2CatalogEntry { name: string; effect?: string }
export interface PF2CatalogGroup { title: string; kind: string; entries: PF2CatalogEntry[] }

/** The full PF2 vanilla catalog, grouped for display. */
export function pf2Catalog(): PF2CatalogGroup[] {
  const groups: PF2CatalogGroup[] = [];
  groups.push({ title: 'Ancestries', kind: 'ancestry', entries: PF2_ANCESTRIES.map((a) => ({ name: a.name, effect: a.summary })) });
  groups.push({ title: 'Classes', kind: 'class', entries: PF2_CLASSES.map((c) => ({ name: c.name, effect: c.summary })) });
  groups.push({ title: 'Backgrounds', kind: 'background', entries: PF2_BACKGROUNDS.map((b) => ({ name: b.name, effect: `${b.skill} · ${b.feat}. ${b.summary}` })) });
  groups.push({ title: 'Skills', kind: 'skill', entries: PF2_SKILLS.map((s) => ({ name: s.name, effect: `Governed by ${s.attribute}${s.armorPenalty ? ' · armor check penalty applies' : ''}.` })) });
  // Per-class subclass choices (Bloodline/Racket/Instinct/…) so the AI picks a real one.
  const subclasses = PF2_CLASSES.flatMap((c) => c.subclassOptions.map((name) => ({ name, effect: `${c.name} ${c.subclassMechanism}` })));
  if (subclasses.length) groups.push({ title: 'Subclasses', kind: 'subclass', entries: subclasses });
  // Gear + spells (the catalogs added with the deterministic model) so an AI build references real ones.
  groups.push({ title: 'Weapons', kind: 'weapon', entries: PF2_WEAPONS_FULL.map((w) => ({ name: w.name, effect: `${w.category} ${w.group.toLowerCase()}; ${w.damageDie} ${w.damageType}${w.traits.length ? `; ${w.traits.join(', ')}` : ''}` })) });
  groups.push({ title: 'Armor', kind: 'armor', entries: PF2_ARMORS_FULL.filter((a) => a.category !== 'unarmored').map((a) => ({ name: a.name, effect: `${a.category}; +${a.acBonus} AC, Dex cap +${a.dexCap ?? '∞'}, Str ${a.strength}` })) });
  groups.push({ title: 'Shields', kind: 'shield', entries: PF2_SHIELDS.map((s) => ({ name: s.name, effect: `+${s.acBonus} AC; Hardness ${s.hardness}, HP ${s.hp} (BT ${s.bt})` })) });
  groups.push({ title: 'Runes', kind: 'rune', entries: PF2_RUNES.map((r) => ({ name: r.name, effect: `${r.kind} ${r.appliesTo} rune, level ${r.level} — ${r.effect}` })) });
  groups.push({ title: 'Items', kind: 'item', entries: PF2_ITEMS.map((i) => ({ name: i.name, effect: `${i.category}, level ${i.level} — ${i.effect}` })) });
  groups.push({ title: 'Feats', kind: 'feat', entries: PF2_ALL_FEATS.map((f) => ({ name: f.name, effect: `Level ${f.level} ${f.track} feat — ${f.effect}` })) });
  groups.push({ title: 'Conditions', kind: 'condition', entries: PF2_CONDITIONS.map((c) => ({ name: c.name, effect: c.effect })) });
  groups.push({ title: 'Spells', kind: 'spell', entries: PF2_ALL_SPELLS.map((s) => ({ name: s.name, effect: `${rankLabel(s.rank)}, ${s.traditions.join('/')} — ${s.effect}` })) });
  // The full action list, replacing the six hand-written examples this used to carry. Cost is shown
  // with the three-action economy's own glyphs, because that economy IS the system's defining
  // mechanic and a bare name loses it.
  const costGlyph = (c: string) =>
    c === '1' ? ' ◆' : c === '2' ? ' ◆◆' : c === '3' ? ' ◆◆◆' : c === 'reaction' ? ' ↺' : c === 'free' ? ' ⬦' : '';
  groups.push({
    title: 'Actions', kind: 'action',
    entries: PF2_ACTIONS.map((a) => ({ name: `${a.name}${costGlyph(a.cost)}`, effect: a.effect })),
  });
  return groups.filter((g) => g.entries.length > 0);
}

/** Total number of vanilla elements (for a header count). */
export function pf2CatalogCount(): number {
  return pf2Catalog().reduce((n, g) => n + g.entries.length, 0);
}
