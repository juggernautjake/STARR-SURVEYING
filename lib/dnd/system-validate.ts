// lib/dnd/system-validate.ts — the safety net (Phase V, system-grounding Slice 3).
//
// After a character is built/edited/transposed, check it against its ACTIVE system's rules
// catalog and report anything that doesn't belong to that system — a level out of range, an
// ability score past the cap, a class or species that isn't in the system (a classic
// cross-edition contamination, e.g. a "Warlock" in Pathfinder 2e or an "Aasimar" in 2014).
// Pure + system-scoped: it never uses another system's data, and the ambiguous case validates
// nothing system-specific. Violations are surfaced to the user (never silently kept).
import type { Character } from '@/app/dnd/_sheet/types';
import { SYSTEM_AMBIGUOUS, systemLabel, type CharacterSystem } from './systems';
import { rulesForSystem, systemClassNames, systemSpecies } from './system-rules';

export interface SystemViolation {
  /** Sheet field the issue is about (e.g. 'meta.className'). */
  field: string;
  /** 'error' = definitely wrong for this system; 'warn' = likely wrong / unrecognized. */
  severity: 'error' | 'warn';
  message: string;
}

/** True when any catalog entry name appears as a whole word in the free-text field (case-insensitive).
 *  Handles multiclass / variant strings like "Fighter 3 / Rogue 2" or "Variant Human". */
function mentionsAny(text: string, names: string[]): boolean {
  const t = ` ${text.toLowerCase()} `;
  return names.some((n) => {
    const nl = n.toLowerCase();
    return t.includes(` ${nl} `) || t.includes(` ${nl}s `) || t.includes(`/${nl}`) || t.includes(`${nl}/`) || t.includes(`(${nl}`) || t.includes(`${nl})`);
  });
}

/**
 * Validate a built character against its system. Returns [] for the ambiguous/unknown case (nothing
 * system-specific to check) and for a valid character. Deterministic — no external services.
 */
export function validateCharacterForSystem(character: Character, system: CharacterSystem): SystemViolation[] {
  const r = rulesForSystem(system);
  if (system === SYSTEM_AMBIGUOUS || !r) return [];
  const out: SystemViolation[] = [];
  const label = systemLabel(system);
  const c = character;

  // 1. Level within the system's range.
  const level = c?.meta?.level;
  if (typeof level === 'number' && (level < r.levelMin || level > r.levelMax)) {
    out.push({ field: 'meta.level', severity: 'error', message: `Level ${level} is outside ${label}'s range (${r.levelMin}–${r.levelMax}).` });
  }

  // 2. Ability scores within the cap — only for score-based systems (5e). PF2 stores modifiers, so a
  //    numeric ability field there isn't a 3–20 score and can't be range-checked the same way.
  if (r.ability.scoreBased && c?.abilities) {
    for (const [k, v] of Object.entries(c.abilities)) {
      if (typeof v !== 'number') continue;
      if (v > r.ability.scoreMax) out.push({ field: `abilities.${k}`, severity: 'warn', message: `${k.toUpperCase()} ${v} exceeds ${label}'s normal cap of ${r.ability.scoreMax}.` });
      else if (v < r.ability.scoreMin) out.push({ field: `abilities.${k}`, severity: 'error', message: `${k.toUpperCase()} ${v} is below the minimum (${r.ability.scoreMin}).` });
    }
  }

  // 3. Class belongs to the system (token match; tolerant of multiclass/subclass strings).
  const className = String(c?.meta?.className ?? '').trim();
  if (className && !mentionsAny(className, systemClassNames(system))) {
    out.push({ field: 'meta.className', severity: 'warn', message: `Class "${className}" is not a recognized ${label} class — verify it isn't from another system.` });
  }

  // 4. Species/ancestry belongs to the system.
  const species = String(c?.meta?.species ?? '').trim();
  if (species && !mentionsAny(species, systemSpecies(system))) {
    out.push({ field: 'meta.species', severity: 'warn', message: `Species "${species}" is not a standard ${label} option — verify it isn't from another system.` });
  }

  return out;
}

/** A compact one-line-per-violation summary for prompts / notes / chat replies. */
export function violationsSummary(violations: SystemViolation[]): string {
  if (!violations.length) return '';
  return violations.map((v) => `[${v.severity}] ${v.field}: ${v.message}`).join('\n');
}
