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
