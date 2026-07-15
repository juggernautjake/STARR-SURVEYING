// lib/dnd/system-rules-entries.ts — derive the RAG/browse store entries from the SAME authoritative
// catalog (Phase V, system-grounding Slice 4). This keeps `dnd_system_entries` a projection of
// `system-rules.ts` (single source of truth) so the browse UI and semantic retrieval reflect exactly
// the facts grounding already injects — no drift between the two. Pure; the seed script embeds + upserts.
import type { SystemEntryInput } from './system-store';
import { rulesForSystem } from './system-rules';
import type { CharacterSystem } from './systems';

/** Turn a system's catalog into a flat list of store entries (rules, classes, species, conditions). */
export function systemRulesEntries(system: CharacterSystem): SystemEntryInput[] {
  const r = rulesForSystem(system);
  if (!r) return [];
  const src = r.source;
  const entries: SystemEntryInput[] = [];

  // Core mechanical facts as individual rule entries (each retrievable on its own).
  entries.push({ kind: 'rule', name: 'Ability score generation', body: r.ability.generation, source: src });
  entries.push({ kind: 'rule', name: 'Ability score range & cap', body: `${r.ability.range} Modifier: ${r.ability.modifier}`, source: src });
  entries.push({ kind: 'rule', name: 'Proficiency', body: r.proficiency, source: src });
  entries.push({ kind: 'rule', name: 'Levels & advancement', body: `Levels ${r.levelMin}–${r.levelMax}. ${r.advancement}`, source: src });
  entries.push({ kind: 'rule', name: 'Saving throws', body: r.saves, source: src });
  entries.push({ kind: 'rule', name: 'Core resolution', body: r.coreResolution, source: src });
  entries.push({ kind: 'rule', name: 'Action economy', body: r.actionEconomy, source: src });
  entries.push({ kind: 'rule', name: 'Rest & recovery', body: r.rest, source: src });
  entries.push({ kind: 'rule', name: 'Stat & feat progression', body: r.progressionCadence, source: src });

  // Edition "must-know" facts (the anti-cross-contamination reminders).
  r.keyFacts.forEach((f, i) => entries.push({ kind: 'rule', name: `Key fact ${i + 1}`, body: f, source: src }));

  // Classes — one entry each with its mechanical knobs.
  for (const c of r.content.classes) {
    const hp = c.hitDie != null ? `Hit die d${c.hitDie}` : `${c.hpPerLevel} HP/level`;
    const caster = c.caster === 'none' ? 'non-caster' : `${c.caster} caster`;
    entries.push({ kind: 'class', name: c.name, body: `${c.name} — key ability ${c.keyAbility}; ${hp}; save proficiencies ${c.saves.join(' & ')}; ${caster}.`, source: src });
  }

  // Species / ancestries + skills + conditions as list entries.
  entries.push({ kind: 'species', name: 'Playable species/ancestries', body: r.content.species.join(', '), source: src });
  entries.push({ kind: 'rule', name: 'Skill list', body: r.content.skills.map((s) => `${s.name} (${s.ability})`).join(', '), source: src });
  entries.push({ kind: 'condition', name: 'Conditions', body: r.content.conditions.join(', '), source: src });
  entries.push({ kind: 'feat', name: 'Example feats', body: r.content.sampleFeats.join(', '), source: src });

  return entries;
}
