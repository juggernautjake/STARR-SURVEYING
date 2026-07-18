// lib/dnd/systems/pathfinder2e/catalog.ts — the PF2 vanilla library projected into a UI-ready, grouped
// catalog. content.ts holds the raw data; this groups it (classes, ancestries, backgrounds, skills, the
// three-action economy) so the builder's pickers and the on-sheet reference browser render from one
// deterministic source. Everything here is vanilla by definition — it IS the system.
import { PF2_CLASSES, PF2_ANCESTRIES, PF2_BACKGROUNDS, PF2_SKILLS, PF2_WEAPONS, PF2_ARMORS, PF2_SPELLS } from './content';

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
  groups.push({ title: 'Weapons', kind: 'weapon', entries: PF2_WEAPONS.map((w) => ({ name: w.name, effect: `${w.category} ${w.group.toLowerCase()}; ${w.damageDie} ${w.damageType}${w.traits.length ? `; ${w.traits.join(', ')}` : ''}` })) });
  groups.push({ title: 'Armor', kind: 'armor', entries: PF2_ARMORS.filter((a) => a.category !== 'unarmored').map((a) => ({ name: a.name, effect: `${a.category}; +${a.acBonus} AC, Dex cap +${a.dexCap ?? '∞'}, Str ${a.strength}` })) });
  groups.push({ title: 'Spells', kind: 'spell', entries: PF2_SPELLS.map((s) => ({ name: s.name, effect: `${rankLabel(s.rank)}, ${s.traditions.join('/')} — ${s.effect}` })) });
  // The 3-action economy, at a glance (matches the glossary's basic actions).
  groups.push({
    title: 'Actions · basic', kind: 'action', entries: [
      { name: 'Strike ◆', effect: 'Make one attack with a weapon or unarmed attack.' },
      { name: 'Stride ◆', effect: 'Move up to your Speed.' },
      { name: 'Step ◆', effect: 'Move 5 feet without triggering reactions.' },
      { name: 'Interact ◆', effect: 'Draw an item, open a door, or other manipulate action.' },
      { name: 'Seek ◆', effect: 'Perception check to find hidden creatures or objects.' },
      { name: 'Raise a Shield ◆', effect: 'Gain your shield’s circumstance bonus to AC until your next turn.' },
    ],
  });
  return groups.filter((g) => g.entries.length > 0);
}

/** Total number of vanilla elements (for a header count). */
export function pf2CatalogCount(): number {
  return pf2Catalog().reduce((n, g) => n + g.entries.length, 0);
}
