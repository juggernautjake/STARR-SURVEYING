// lib/dnd/system-rules-entries.ts — derive the RAG/browse store entries from the SAME authoritative
// catalog (Phase V, system-grounding Slice 4). This keeps `dnd_system_entries` a projection of
// `system-rules.ts` (single source of truth) so the browse UI and semantic retrieval reflect exactly
// the facts grounding already injects — no drift between the two. Pure; the seed script embeds + upserts.
import type { SystemEntryInput } from './system-store';
import { rulesForSystem } from './system-rules';
import type { CharacterSystem } from './systems';
import { spellCatalog } from './spells';
import { SPELL_MECHANICS } from './spells/mechanics';
import { COMPANION_RULE_SETS } from './companions/dnd5e-2024';

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

  // Any name-only classes (systems with a classNames superset beyond the detailed classes).
  const detailed = new Set(r.content.classes.map((c) => c.name));
  for (const name of r.content.classNames ?? []) {
    if (!detailed.has(name)) entries.push({ kind: 'class', name, body: `${name} — a ${r.label} class.`, source: src });
  }

  // Species / ancestries + skills + conditions as list entries.
  entries.push({ kind: 'species', name: 'Playable species/ancestries', body: r.content.species.join(', '), source: src });
  // Per-ancestry mechanical notes (when the system's ancestries carry mechanics), each its own entry.
  (r.content.ancestryNotes ?? []).forEach((note) => {
    const nm = note.split(/[—-]/)[0].trim();
    entries.push({ kind: 'species', name: nm || 'Ancestry', body: note, source: src });
  });
  entries.push({ kind: 'rule', name: 'Skill list', body: r.content.skills.map((s) => `${s.name} (${s.ability})`).join(', '), source: src });
  entries.push({ kind: 'condition', name: 'Conditions', body: r.content.conditions.join(', '), source: src });
  entries.push({ kind: 'feat', name: 'Example feats', body: r.content.sampleFeats.join(', '), source: src });

  // ── Spells, spellcasting rules, companions ────────────────────────────────
  // Projected so SEMANTIC retrieval reaches them too. Grounding already injects spells via a
  // deterministic name match (grounding.ts matchSpells), which answers "how does Fireball
  // work" — but not "what should I take to deal with a swarm", where the reader never says a
  // spell's name. These entries close that gap (2026-07-20).
  //
  // System-scoped by construction: spellCatalog() returns [] for a system with no catalog, so
  // 2014 and PF2 get nothing rather than 2024's numbers.
  for (const sp of spellCatalog(system).spells) {
    const tags = [sp.concentration ? 'Concentration' : '', sp.ritual ? 'Ritual' : ''].filter(Boolean).join(', ');
    entries.push({
      kind: 'spell',
      name: sp.name,
      body:
        `${sp.level === 0 ? 'Cantrip' : `Level ${sp.level}`} ${sp.school}. ` +
        `Casting time ${sp.castTime}; range ${sp.range}; components ${sp.components}` +
        `${sp.material ? ` (${sp.material})` : ''}; duration ${sp.duration}${tags ? `; ${tags}` : ''}. ` +
        `Classes: ${sp.classes.join(', ')}. ${sp.summary}` +
        `${sp.higher ? ` At higher levels: ${sp.higher}` : ''}` +
        `${sp.editionNote ? ` 2024 vs 2014: ${sp.editionNote}` : ''}`,
      // The system's canonical source string, so every projected entry is consistent in the
      // store (the catalog's own 'PHB 2024' names the same book more tersely).
      source: src,
    });
  }

  // How spellcasting WORKS — each explainer with its worked example, so "what breaks
  // concentration" retrieves the rule AND a concrete illustration.
  if (system === 'dnd5e-2024') {
    for (const m of SPELL_MECHANICS) {
      entries.push({
        kind: 'rule',
        name: m.title,
        body: `${m.rule} Example: ${m.example}${m.gotchas?.length ? ` Watch out: ${m.gotchas.join(' ')}` : ''}`,
        source: src,
      });
    }
    for (const c of COMPANION_RULE_SETS) {
      entries.push({
        kind: 'rule',
        name: `${c.name} (${c.grantedBy})`,
        body: `${c.rules.join(' ')}${c.editionNote ? ` 2024 vs 2014: ${c.editionNote}` : ''}`,
        source: src,
      });
    }
  }

  return entries;
}
