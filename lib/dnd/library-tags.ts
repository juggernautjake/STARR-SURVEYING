// lib/dnd/library-tags.ts — one tag vocabulary for every kind of library content.
//
// S2 of DND_2024_COMPLETE_LIBRARY_2026-07-20. Search and filtering need a uniform way to say
// what a thing IS, across content types that have nothing else in common: a spell has a level
// and a school, a weapon has properties, a condition has neither.
//
// TAGS ARE DERIVED, NEVER HAND-MAINTAINED. Every tag here is a projection of data the entry
// already carries — a spell's school IS a tag, its class list IS a set of tags. Hand-authored
// tags rot the moment someone edits the underlying field and forgets the tag, and then the
// filters quietly lie. If a tag can't be derived, it doesn't belong in this file.
//
// The same tags drive three surfaces, which is the point: the visible chips a reader sees, the
// filter facets they click, and the `data` payload the AI retrieves — so "show me concentration
// spells" and "what concentration spells are there" are answered from one source.

import type { SpellDef } from './spells';

/** The facet a tag belongs to. Filter UIs group by this. */
export type TagGroup =
  | 'type'      // spell, weapon, armor, feat, condition…
  | 'level'     // cantrip, level 1…9
  | 'school'    // evocation, abjuration…
  | 'class'     // bard, cleric…
  | 'casting'   // action, bonus action, reaction, ritual
  | 'duration'  // instantaneous, concentration, hours…
  | 'range'     // self, touch, ranged, area
  | 'effect'    // damage, healing, buff, control, utility
  | 'damage'    // fire, cold, psychic…
  | 'source';   // PHB 2024

export interface LibraryTag {
  /** Stable machine key, e.g. 'school:evocation'. Unique within an entry. */
  key: string;
  /** What a reader sees on the chip. */
  label: string;
  group: TagGroup;
}

const tag = (group: TagGroup, value: string, label?: string): LibraryTag => ({
  key: `${group}:${value.toLowerCase().replace(/\s+/g, '-')}`,
  label: label ?? value,
  group,
});

export const TAG_GROUP_LABEL: Record<TagGroup, string> = {
  type: 'Type',
  level: 'Level',
  school: 'School',
  class: 'Class',
  casting: 'Casting time',
  duration: 'Duration',
  range: 'Range',
  effect: 'Effect',
  damage: 'Damage type',
  source: 'Source',
};

/** Order the groups appear in a filter panel — most-used first. */
export const TAG_GROUP_ORDER: TagGroup[] = [
  'type', 'level', 'school', 'class', 'effect', 'damage', 'casting', 'duration', 'range', 'source',
];

// ── Derivation helpers ──────────────────────────────────────────────────────

/** 'Instantaneous' / '1 minute' / 'Until dispelled' → a coarse, filterable bucket. */
function durationBucket(duration: string, concentration?: boolean): LibraryTag[] {
  const out: LibraryTag[] = [];
  if (concentration) out.push(tag('duration', 'concentration', 'Concentration'));
  const d = duration.toLowerCase();
  if (d.includes('instantaneous')) out.push(tag('duration', 'instantaneous', 'Instantaneous'));
  else if (d.includes('until dispelled') || d.includes('permanent')) out.push(tag('duration', 'permanent', 'Until dispelled'));
  else if (/\bround/.test(d)) out.push(tag('duration', 'rounds', 'Rounds'));
  else if (/\bminute/.test(d)) out.push(tag('duration', 'minutes', 'Minutes'));
  else if (/\bhour/.test(d)) out.push(tag('duration', 'hours', 'Hours'));
  else if (/\bday/.test(d)) out.push(tag('duration', 'days', 'Days or longer'));
  return out;
}

/** 'Self (15-foot cone)' / 'Touch' / '120 feet' → self / touch / ranged, plus 'area' when shaped. */
function rangeBucket(range: string): LibraryTag[] {
  const out: LibraryTag[] = [];
  const r = range.toLowerCase();
  if (r.startsWith('self')) out.push(tag('range', 'self', 'Self'));
  else if (r.startsWith('touch')) out.push(tag('range', 'touch', 'Touch'));
  else out.push(tag('range', 'ranged', 'Ranged'));
  // A shape in the range string means it hits an area, which is what people actually filter for.
  if (/(cone|cube|sphere|line|radius|emanation|cylinder)/.test(r)) out.push(tag('range', 'area', 'Area of effect'));
  return out;
}

/** '1 action' / '1 bonus action' / '1 reaction' / longer rituals. */
function castingBucket(castTime: string, ritual?: boolean): LibraryTag[] {
  const out: LibraryTag[] = [];
  const c = castTime.toLowerCase();
  if (c.includes('bonus action')) out.push(tag('casting', 'bonus-action', 'Bonus action'));
  else if (c.includes('reaction')) out.push(tag('casting', 'reaction', 'Reaction'));
  else if (c.includes('action')) out.push(tag('casting', 'action', 'Action'));
  else out.push(tag('casting', 'long', 'Longer than an action'));
  if (ritual) out.push(tag('casting', 'ritual', 'Ritual'));
  return out;
}

/** What the spell DOES, from its structured resolution — the most useful filter of all
 *  ("show me the healing spells") and the one no single field carries. */
function effectBuckets(s: SpellDef): LibraryTag[] {
  const out: LibraryTag[] = [];
  if (s.damage?.length) out.push(tag('effect', 'damage', 'Deals damage'));
  if (s.heal) out.push(tag('effect', 'healing', 'Healing'));
  if (s.attack) out.push(tag('effect', 'attack-roll', 'Attack roll'));
  if (s.save) out.push(tag('effect', 'saving-throw', 'Saving throw'));
  if (!s.damage?.length && !s.heal) out.push(tag('effect', 'utility', 'Utility'));
  return out;
}

// ── Public: tags for a spell ────────────────────────────────────────────────

/** Every tag a spell carries, derived from its own fields. */
export function tagsForSpell(s: SpellDef): LibraryTag[] {
  const out: LibraryTag[] = [
    tag('type', 'spell', 'Spell'),
    s.level === 0 ? tag('level', 'cantrip', 'Cantrip') : tag('level', String(s.level), `Level ${s.level}`),
    tag('school', s.school),
    ...s.classes.map((c) => tag('class', c)),
    ...castingBucket(s.castTime, s.ritual),
    ...durationBucket(s.duration, s.concentration),
    ...rangeBucket(s.range),
    ...effectBuckets(s),
    ...(s.damage ?? []).map((d) => tag('damage', d.type)),
    tag('source', s.source),
  ];
  // De-duplicate by key — a spell dealing 2d6 fire + 2d6 radiant must not carry 'damage:fire' twice.
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t.key) ? false : (seen.add(t.key), true)));
}

/** Tags for a generic library entry (feat, weapon, condition…) that has no richer shape yet.
 *  Deliberately minimal: it claims only what it can actually derive. */
export function tagsForEntry(kind: string, source?: string): LibraryTag[] {
  const out = [tag('type', kind)];
  if (source) out.push(tag('source', source));
  return out;
}

// ── Public: filtering ───────────────────────────────────────────────────────

/** Does an entry's tag set satisfy the selected filters?
 *
 *  WITHIN a group the selections are OR (level 1 or level 2), ACROSS groups they are AND
 *  (level 1 AND evocation). That is what people expect from faceted search and what makes the
 *  facets composable — AND within a group would make selecting two levels return nothing. */
export function matchesTagFilters(entryTags: LibraryTag[], selected: string[]): boolean {
  if (!selected.length) return true;
  const have = new Set(entryTags.map((t) => t.key));
  const byGroup = new Map<string, string[]>();
  for (const key of selected) {
    const group = key.split(':')[0];
    byGroup.set(group, [...(byGroup.get(group) ?? []), key]);
  }
  for (const keys of byGroup.values()) {
    if (!keys.some((k) => have.has(k))) return false;
  }
  return true;
}

/** Count how many entries carry each tag, for facet counts in the filter UI. */
export function tagCounts(entries: LibraryTag[][]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tags of entries) {
    for (const t of tags) counts.set(t.key, (counts.get(t.key) ?? 0) + 1);
  }
  return counts;
}

/** All distinct tags across a set of entries, grouped and ordered for a filter panel. */
export function facetsFor(entries: LibraryTag[][]): { group: TagGroup; label: string; tags: LibraryTag[] }[] {
  const byKey = new Map<string, LibraryTag>();
  for (const tags of entries) for (const t of tags) byKey.set(t.key, t);
  const all = [...byKey.values()];
  return TAG_GROUP_ORDER
    .map((group) => ({
      group,
      label: TAG_GROUP_LABEL[group],
      tags: all.filter((t) => t.group === group).sort(sortWithinGroup(group)),
    }))
    .filter((f) => f.tags.length > 0);
}

/** Levels sort numerically (cantrip first); everything else alphabetically. */
function sortWithinGroup(group: TagGroup) {
  return (a: LibraryTag, b: LibraryTag) => {
    if (group === 'level') {
      const n = (t: LibraryTag) => (t.key === 'level:cantrip' ? -1 : Number(t.key.split(':')[1]) || 0);
      return n(a) - n(b);
    }
    return a.label.localeCompare(b.label);
  };
}
