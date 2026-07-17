// lib/dnd/library.ts — shapes a system's authoritative catalog into the sections the library
// pages render, and provides the cross-system keyword search that backs the search box.
//
// Source of truth is lib/dnd/system-rules.ts (+ system-rules-extra.ts): complete, deterministic
// and DB-free. The dnd_system_entries store is an optional projection used for semantic retrieval;
// the pages deliberately do NOT depend on it, so the library is fully readable with no embeddings
// key and no seeded rows.
import { GAME_SYSTEMS, systemLabel, type CharacterSystem } from './systems';
import { rulesForSystem, type SystemRules } from './system-rules';
import { glossaryFor, searchGlossary } from './glossary';
import { classesForSystem } from './classes/registry';
import { FEATS_2024, type Feat } from './feats/dnd5e-2024';
import { PF2_BACKGROUNDS, PF2_ARMORS, PF2_WEAPONS, type PF2BackgroundDef, type PF2ArmorDef, type PF2WeaponDef } from './systems/pathfinder2e/content';

/** The full feat registry for a system, or [] when only a catalog sample exists. System-keyed
 *  dispatcher (the pattern `findFeat`'s comment calls for) so a feat never leaks across systems. */
function featsForSystem(system: string): Feat[] {
  return system === 'dnd5e-2024' ? FEATS_2024 : [];
}

/** Backgrounds a system exposes as structured library data. System-keyed so PF2's backgrounds never
 *  surface under another system. Only Pathfinder 2e has these as first-class library entries today. */
function backgroundsForSystem(system: string): PF2BackgroundDef[] {
  return system === 'pathfinder2e' ? PF2_BACKGROUNDS : [];
}

/** Armor / weapons a system exposes as structured library data (PF2 only today). System-keyed so a
 *  PF2 breastplate or longsword never surfaces under a 5e system, whose gear lives elsewhere. */
function armorsForSystem(system: string): PF2ArmorDef[] {
  return system === 'pathfinder2e' ? PF2_ARMORS : [];
}
function weaponsForSystem(system: string): PF2WeaponDef[] {
  return system === 'pathfinder2e' ? PF2_WEAPONS : [];
}
const DMG_TYPE: Record<string, string> = { B: 'bludgeoning', P: 'piercing', S: 'slashing' };

export interface LibraryFact {
  label: string;
  value: string;
}

export interface LibrarySection {
  id: string;
  title: string;
  /** Short intro shown under the section heading. */
  lead?: string;
  /** Prose paragraphs. */
  body?: string[];
  /** Label/value rows (rendered as a definition table). */
  facts?: LibraryFact[];
  /** Simple chip lists (conditions, species…). */
  chips?: string[];
  /** Tabular data with headers. */
  table?: { headers: string[]; rows: string[][] };
}

export interface LibrarySystemPage {
  key: string;
  name: string;
  publisher?: string;
  notes?: string;
  source: string;
  /** One-line characterisation, e.g. "d100 roll-under · no levels". */
  tagline: string;
  sections: LibrarySection[];
}

/** A short, honest characterisation of the system's core maths — the thing people scan for. */
export function taglineFor(r: SystemRules): string {
  const bits: string[] = [];
  const res = r.coreResolution.toLowerCase();
  if (res.includes('roll under')) bits.push('d100 roll-under');
  else if (res.includes('highest die')) bits.push('d6 pool · highest die');
  else if (res.includes('hits')) bits.push('d6 pool · count hits');
  else if (res.includes('1d10')) bits.push('1d10 + stat + skill');
  else if (res.includes('degrees of success')) bits.push('d20 · degrees of success');
  else bits.push('d20 + modifiers');

  bits.push(r.levelMin === r.levelMax ? 'no levels' : `levels ${r.levelMin}–${r.levelMax}`);
  const dice = r.content.classes.some((c) => c.hitDie != null);
  if (dice) bits.push('hit dice');
  else if (r.content.classes.some((c) => c.hpPerLevel != null)) bits.push('flat HP/level');
  return bits.join(' · ');
}

/** The system's noun for a "class" — used as a section heading so we don't call a playbook a class. */
function classNoun(key: string): string {
  if (key === 'blades') return 'Playbooks';
  if (key === 'cyberpunk-red') return 'Roles';
  if (key === 'shadowrun6e') return 'Archetypes';
  if (key === 'coc7e') return 'Occupations';
  return 'Classes';
}

/** The system's noun for a "species". */
function speciesNoun(key: string): string {
  if (key === 'blades') return 'Heritages';
  if (key === 'pathfinder2e' || key === 'pathfinder1e') return 'Ancestries';
  if (key === 'shadowrun6e') return 'Metatypes';
  return 'Species';
}

function featNoun(key: string): string {
  if (key === 'blades') return 'Special Abilities';
  if (key === 'cyberpunk-red') return 'Role Abilities';
  if (key === 'shadowrun6e') return 'Qualities';
  if (key === 'coc7e') return 'Signature Moves';
  return 'Feats';
}

/** Build the full, renderable page for one system. */
export function libraryPageFor(key: CharacterSystem): LibrarySystemPage | null {
  const r = rulesForSystem(key);
  if (!r) return null;
  const meta = GAME_SYSTEMS.find((s) => s.key === key);
  const sections: LibrarySection[] = [];

  sections.push({
    id: 'core',
    title: 'How the game resolves',
    lead: 'The core maths — everything else hangs off this.',
    facts: [
      { label: 'Core resolution', value: r.coreResolution },
      { label: 'Action economy', value: r.actionEconomy },
      { label: 'Saving throws', value: r.saves },
      { label: 'Rest & recovery', value: r.rest },
    ],
  });

  sections.push({
    id: 'abilities',
    title: 'Abilities & attributes',
    lead: `${r.ability.abilities.length} attributes: ${r.ability.abilities.join(' · ')}`,
    facts: [
      { label: 'How they are generated', value: r.ability.generation },
      { label: 'Range & cap', value: r.ability.range },
      { label: 'Modifier', value: r.ability.modifier },
    ],
  });

  sections.push({
    id: 'advancement',
    title: 'Advancement & competence',
    facts: [
      { label: 'Levels', value: r.levelMin === r.levelMax ? 'This system has NO character levels.' : `Levels ${r.levelMin}–${r.levelMax}.` },
      { label: 'Advancement', value: r.advancement },
      { label: 'Proficiency / competence', value: r.proficiency },
      { label: 'When stats change', value: r.progressionCadence },
    ],
  });

  if (r.keyFacts.length) {
    sections.push({
      id: 'gotchas',
      title: 'Must-know facts',
      lead: 'The things most often got wrong — usually by importing another system’s assumptions.',
      body: r.keyFacts,
    });
  }

  if (r.content.classes.length) {
    const hpHeader = r.content.classes.some((c) => c.hitDie != null) ? 'Hit die' : 'HP / level';
    sections.push({
      id: 'classes',
      title: classNoun(r.key),
      lead: `${r.content.classes.length} in the core line-up.`,
      table: {
        headers: ['Name', 'Key ability', hpHeader, 'Saves', 'Casting'],
        rows: r.content.classes.map((c) => [
          c.name,
          c.keyAbility,
          c.hitDie != null ? `d${c.hitDie}` : c.hpPerLevel != null ? String(c.hpPerLevel) : '—',
          c.saves.length ? c.saves.join(', ') : '—',
          c.caster === 'none' ? '—' : c.caster,
        ]),
      },
    });
  }

  if (r.content.skills.length) {
    sections.push({
      id: 'skills',
      title: 'Skills',
      lead: `${r.content.skills.length} skills and the attribute each is governed by.`,
      table: {
        headers: ['Skill', 'Governed by'],
        rows: r.content.skills.map((s) => [s.name, s.ability]),
      },
    });
  }

  if (r.content.species.length) {
    sections.push({
      id: 'species',
      title: speciesNoun(r.key),
      chips: r.content.species,
      body: r.content.ancestryNotes?.length ? r.content.ancestryNotes : undefined,
    });
  }

  // Backgrounds (PF2 only today) — a real table of what each grants, since backgrounds are a level-1
  // choice as consequential as ancestry/class in Pathfinder 2e.
  const backgrounds = backgroundsForSystem(key);
  if (backgrounds.length) {
    sections.push({
      id: 'backgrounds',
      title: 'Backgrounds',
      lead: `${backgrounds.length} backgrounds — each grants attribute boosts, a trained skill, a Lore, and a skill feat.`,
      table: {
        headers: ['Background', 'Boosts', 'Trained skill', 'Skill feat'],
        rows: backgrounds.map((b) => [b.name, b.boosts.join(', '), `${b.skill} · ${b.lore}`, b.feat]),
      },
    });
  }

  // Armor + weapons (PF2 only today) — the gear tables players scan for.
  const armors = armorsForSystem(key).filter((a) => a.category !== 'unarmored');
  if (armors.length) {
    sections.push({
      id: 'armor',
      title: 'Armor',
      lead: `${armors.length} armors — AC bonus, Dex cap, and the Strength that waives their penalties.`,
      table: {
        headers: ['Armor', 'Category', 'AC', 'Dex cap', 'Str', 'Check', 'Speed'],
        rows: armors.map((a) => [a.name, a.category, `+${a.acBonus}`, `+${a.dexCap ?? '∞'}`, `+${a.strength}`, `${a.checkPenalty}`, `${a.speedPenalty} ft`]),
      },
    });
  }
  const weapons = weaponsForSystem(key);
  if (weapons.length) {
    sections.push({
      id: 'weapons',
      title: 'Weapons',
      lead: `${weapons.length} weapons — damage, type, and traits.`,
      table: {
        headers: ['Weapon', 'Category', 'Damage', 'Group', 'Traits'],
        rows: weapons.map((w) => [w.name, w.category, `${w.damageDie} ${w.damageType}${w.range ? ` (${w.range} ft)` : ''}`, w.group, w.traits.join(', ') || '—']),
      },
    });
  }

  if (r.content.conditions.length) {
    sections.push({ id: 'conditions', title: 'Conditions', lead: `${r.content.conditions.length} standardized states.`, chips: r.content.conditions });
  }

  if (r.content.sampleFeats.length) {
    sections.push({ id: 'feats', title: featNoun(r.key), lead: 'A representative sample — not the complete list.', chips: r.content.sampleFeats });
  }

  return {
    key: r.key,
    name: r.label,
    publisher: meta?.publisher,
    notes: meta?.notes,
    source: r.source,
    tagline: taglineFor(r),
    sections,
  };
}

/** Every system's page, in the GAME_SYSTEMS order. */
export function allLibraryPages(): LibrarySystemPage[] {
  return GAME_SYSTEMS.map((s) => libraryPageFor(s.key)).filter((p): p is LibrarySystemPage => !!p);
}

export interface LibraryHit {
  system: string;
  systemName: string;
  kind: string;
  name: string;
  body: string;
  /** Higher is better. */
  score: number;
}

/**
 * Search the catalog — across ONE system, or across all of them when `system` is omitted.
 * Pure and DB-free, so the library's search box works with no embeddings key and no seeded rows.
 */
export function searchLibrary(query: string, system?: CharacterSystem | null, limit = 40): LibraryHit[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/).filter((w) => w.length > 1).slice(0, 6);
  if (!words.length) return [];

  const keys = system ? [system] : GAME_SYSTEMS.map((s) => s.key);
  const hits: LibraryHit[] = [];

  for (const key of keys) {
    const r = rulesForSystem(key);
    if (!r) continue;
    const name = systemLabel(key);

    // The GLOSSARY first: these are the fully-written articles, so a lookup returns a real
    // explanation rather than a one-line stub. Scored high so they outrank the generated
    // catalog lines for the same word (e.g. the "Blinded" article beats the conditions list).
    for (const g of searchGlossary(key, q, 30)) {
      hits.push({ system: key, systemName: name, kind: g.kind, name: g.term, body: g.body, score: g.score + 6 });
    }
    // Terms already covered by the glossary shouldn't also appear as thin catalog entries.
    const explained = new Set(glossaryFor(key).map((e) => e.term.toLowerCase()));
    const push = (kind: string, n: string, b: string) => {
      // Skip anything the glossary already explains properly — its article is strictly better
      // than the one-line summary generated here.
      if (explained.has(n.toLowerCase())) return;
      const hay = `${n}\n${b}`.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (n.toLowerCase().includes(w)) score += 3;
        else if (hay.includes(w)) score += 1;
      }
      // Every word must appear somewhere, so "warlock slots" doesn't match everything with "slots".
      if (!words.every((w) => hay.includes(w))) return;
      if (n.toLowerCase() === q) score += 10;
      if (score > 0) hits.push({ system: key, systemName: name, kind, name: n, body: b, score });
    };

    push('rule', 'Core resolution', r.coreResolution);
    push('rule', 'Action economy', r.actionEconomy);
    push('rule', 'Saving throws', r.saves);
    push('rule', 'Rest & recovery', r.rest);
    push('rule', 'Proficiency', r.proficiency);
    push('rule', 'Advancement', r.advancement);
    push('rule', 'Progression cadence', r.progressionCadence);
    push('rule', 'Ability generation', r.ability.generation);
    push('rule', 'Ability range & cap', r.ability.range);
    push('rule', 'Ability modifier', r.ability.modifier);
    r.keyFacts.forEach((f, i) => push('rule', `Key fact ${i + 1}`, f));
    for (const c of r.content.classes) {
      const hp = c.hitDie != null ? `Hit die d${c.hitDie}` : c.hpPerLevel != null ? `${c.hpPerLevel} HP/level` : 'no hit die';
      push('class', c.name, `${c.name} — key ability ${c.keyAbility}; ${hp}; saves ${c.saves.join(' & ') || '—'}; ${c.caster === 'none' ? 'non-caster' : `${c.caster} caster`}.`);
    }
    for (const n of r.content.classNames ?? []) if (!r.content.classes.some((c) => c.name === n)) push('class', n, `${n} — a ${r.label} class.`);
    // Systems with FULL class data (dnd5e-2024 AND now dnd5e-2014) also expose every class feature by
    // name, so "action surge", "sneak attack", or "brutal critical" finds the actual rules text and
    // its level — the whole 2014 roster projects into library search automatically once registered.
    for (const c of classesForSystem(key)) {
      for (const f of c.features) {
        if (f.choice && !f.body) continue;
        push('feature', f.name, `${c.name} · level ${f.level} — ${f.body}`);
      }
    }
    for (const s of r.content.skills) push('skill', s.name, `${s.name} — governed by ${s.ability} in ${r.label}.`);
    for (const s of r.content.species) push('species', s, `${s} — a playable ${speciesNoun(r.key).toLowerCase().replace(/s$/, '')} in ${r.label}.`);
    for (const n of r.content.ancestryNotes ?? []) push('species', n.split(/[—-]/)[0].trim() || 'Ancestry', n);
    for (const c of r.content.conditions) push('condition', c, `${c} — a condition in ${r.label}.`);
    // Systems with a full FEATS registry (dnd5e-2024) expose EVERY feat with its real benefit text and
    // category, so "great weapon master" or "alert" returns the actual rules, not a one-line stub.
    const fullFeats = featsForSystem(key);
    if (fullFeats.length) {
      for (const f of fullFeats) push('feat', f.name, `${f.name} (${f.category} feat) — ${f.benefit}`);
    } else {
      for (const f of r.content.sampleFeats) push('feat', f, `${f} — ${featNoun(r.key).toLowerCase()} in ${r.label}.`);
    }
    // Backgrounds (PF2 only today): each grants attribute boosts, a trained skill, a Lore, and a skill
    // feat — real structured data from the PF2 content library, searchable by name or "background".
    for (const b of backgroundsForSystem(key)) {
      push('background', b.name, `${b.name} background — trains ${b.skill} + ${b.lore}; grants the ${b.feat} skill feat; boosts ${b.boosts.join(', ')}. ${b.summary}`);
    }
    // Armor + weapons (PF2 only today): the stats a player scans for — AC bonus / Dex cap / Strength for
    // armor; damage die + type + traits for weapons. System-scoped so 5e gear never surfaces here.
    for (const a of armorsForSystem(key)) {
      if (a.category === 'unarmored') continue;
      push('armor', a.name, `${a.name} — ${a.category} armor; +${a.acBonus} AC, Dex cap +${a.dexCap ?? '∞'}, Str ${a.strength}, check ${a.checkPenalty}, speed ${a.speedPenalty} ft.`);
    }
    for (const w of weaponsForSystem(key)) {
      push('weapon', w.name, `${w.name} — ${w.category} ${w.group.toLowerCase()}; ${w.damageDie} ${DMG_TYPE[w.damageType] ?? w.damageType}${w.range ? `, ranged ${w.range} ft` : ''}${w.traits.length ? `; ${w.traits.join(', ')}` : ''}.`);
    }
  }

  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}
