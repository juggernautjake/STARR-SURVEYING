// app/dnd/_sheet/engine/apply.ts — layer effects onto the derived block (Phase C17).
//
// C12 computes the base derived numbers; C13 resolves effects; this ties them
// together so magic items (and any effect source) actually change saves, skills,
// spell DC/attack, initiative, and the character's resistances. Combined with the
// AC path (C15) and attack path (C16), an attuned "+1 everything" item moves every
// connected number. Magic-item bonuses are just effects gated on `attuned` — feed
// this the output of equipment.collectItemEffects (already attunement-resolved).
//
// Effect target conventions:
//   saves:  'saves' / 'all_saves' (all), or '<ability>_saves' (e.g. 'dex_saves')
//   skills: 'all_skills', or 'skill.<key>' (e.g. 'skill.stealth')
//   others: 'spell_save_dc', 'spell_attack', 'initiative'
import { ABILITY_KEYS, type Derived } from './derive';
import { SKILLS } from '../rules/dnd';
import {
  resolveNumeric,
  resistances,
  immunities,
  vulnerabilities,
  grantedProficiencies,
  type Effect,
} from './effects';

export interface DerivedWithEffects extends Derived {
  resistances: string[];
  immunities: string[];
  vulnerabilities: string[];
  grantedProficiencies: string[];
}

/** Apply already-active effects to a base Derived block, returning the final numbers. */
export function applyEffectsToDerived(d: Derived, effects: Effect[]): DerivedWithEffects {
  const allSaves = resolveNumeric(effects, 'saves') + resolveNumeric(effects, 'all_saves');
  const saves = {} as Derived['saves'];
  for (const k of ABILITY_KEYS) {
    const bonus = allSaves + resolveNumeric(effects, `${k}_saves`);
    saves[k] = { ...d.saves[k], mod: d.saves[k].mod + bonus };
  }

  const allSkills = resolveNumeric(effects, 'all_skills');
  const skills: Derived['skills'] = {};
  for (const s of SKILLS) {
    const cur = d.skills[s.key];
    const bonus = allSkills + resolveNumeric(effects, `skill.${s.key}`);
    skills[s.key] = { ...cur, mod: cur.mod + bonus };
  }

  const spell = d.spell
    ? {
        ...d.spell,
        saveDC: d.spell.saveDC + resolveNumeric(effects, 'spell_save_dc'),
        attack: d.spell.attack + resolveNumeric(effects, 'spell_attack'),
      }
    : null;

  const initiative = d.initiative + resolveNumeric(effects, 'initiative');

  const passives = {
    perception: 10 + skills.perception.mod,
    investigation: 10 + skills.investigation.mod,
    insight: 10 + skills.insight.mod,
  };

  return {
    ...d,
    saves,
    skills,
    spell,
    initiative,
    passives,
    resistances: resistances(effects),
    immunities: immunities(effects),
    vulnerabilities: vulnerabilities(effects),
    grantedProficiencies: grantedProficiencies(effects),
  };
}
