// __tests__/dnd/condition-text-coverage.test.ts — every condition a system lists must have its MECHANICAL
// text reachable, or the AI/user can't answer "what does X do" — the core "AI answers from the library"
// promise. Text comes from one of two sources (matching library.ts): a glossary article (5e/PF2) or the
// system's full-text condition list (IG's IG_CONDITIONS). A condition in the chip list with NEITHER is a
// name that explains nothing. glossary.test.ts guards the glossary's own entries but never checks that
// the CONDITION list is fully backed — this does.
import { describe, it, expect } from 'vitest';
import { systemConditions } from '@/lib/dnd/system-rules';
import { glossaryFor } from '@/lib/dnd/glossary';
import { IG_CONDITIONS } from '@/lib/dnd/systems/intuitive-games/content';
import { CONDITION_MECHANICS_5E, conditionMechanics5e } from '@/lib/dnd/conditions/dnd5e';
import { exhaustionSpeedPenalty } from '@/lib/dnd/mechanics/exhaustion';

const FOCUS = ['dnd5e-2024', 'dnd5e-2014', 'pathfinder2e', 'intuitive-games'] as const;

describe.each(FOCUS)('%s — every condition has reachable mechanical text', (system) => {
  it('each condition is explained by a glossary article or the system full-text list', () => {
    const glossTerms = new Set(glossaryFor(system).map((e) => e.term.toLowerCase()));
    const fullText = system === 'intuitive-games'
      ? new Set(IG_CONDITIONS.map((c) => c.name.toLowerCase()))
      : new Set<string>();
    const orphaned = systemConditions(system).filter(
      (c) => !glossTerms.has(c.toLowerCase()) && !fullText.has(c.toLowerCase()),
    );
    expect(orphaned, `these conditions have no reachable text (not in the glossary or the full-text list)`).toEqual([]);
  });
});

// Owner 2026-07-19: nothing previously asserted that every tracked 5e condition has a
// MECHANICAL model behind it — only that it had reachable text. A condition added to the
// name list with no mechanics would render as a label that silently does nothing.
describe('every 5e condition has a mechanical model', () => {
  const EXHAUSTION = 'Exhaustion'; // modelled separately, by tier, in lib/dnd/mechanics/exhaustion.ts

  for (const system of ['dnd5e-2014', 'dnd5e-2024'] as const) {
    it(`${system}: each condition resolves to mechanics (or is Exhaustion)`, () => {
      const names = systemConditions(system);
      expect(names.length).toBeGreaterThan(0);
      const orphans = names.filter((n) => n !== EXHAUSTION && !conditionMechanics5e(n));
      expect(orphans, `conditions with no mechanical model: ${orphans.join(', ')}`).toEqual([]);
    });
  }

  it('exhaustion is deliberately absent from the flat registry, not forgotten', () => {
    // Its effects are tier-scaled, so a single flat record could not express it.
    expect(conditionMechanics5e(EXHAUSTION)).toBeUndefined();
    // Returns a SIGNED penalty (−5 ft per level in 2024), so it reads as negative.
    expect(exhaustionSpeedPenalty(3, '2024', 'vanilla')).toBe(-15);
  });

  it('every modelled condition carries either effects or an explanatory note', () => {
    // A record with neither would be a silent no-op — the exact failure this guards.
    for (const c of CONDITION_MECHANICS_5E) {
      const meaningful = c.effects.length > 0 || c.note.trim().length > 0;
      expect(meaningful, `${c.name} has no effects and no note`).toBe(true);
    }
  });
});
