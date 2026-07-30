// __tests__/dnd/no-ambiguous-default.test.ts — nothing defaults to "no system" (owner, 2026-07-30).
//
// *"I want you to get rid of anything on the site that is system ambiguous… trying to have a catch-all
// ambiguous option doesn't make sense. The default should always be the 2024 D&D edition."*
//
// THE VALUE IS NOT DELETED, and that distinction is the change. `SYSTEM_AMBIGUOUS` stays as the value that
// means "we genuinely do not know" — which the AI grounding needs in order to REFUSE to answer rather than
// guess a system's rules. What is gone is offering it as a CHOICE, and falling back to it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SYSTEM, SYSTEM_AMBIGUOUS, normalizeSystem, isSystemAvailable } from '@/lib/dnd/systems';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the default system', () => {
  it('is the 2024 edition, and it is a real playable system', () => {
    expect(DEFAULT_SYSTEM).toBe('dnd5e-2024');
    expect(isSystemAvailable(DEFAULT_SYSTEM)).toBe(true);
  });

  it('is what an UNSET value becomes', () => {
    for (const v of ['', null, undefined, '   ']) {
      expect(normalizeSystem(v), `${JSON.stringify(v)} should default`).toBe(DEFAULT_SYSTEM);
    }
  });

  it('but an UNRECOGNISED value does not become it — that would guess a rulebook', () => {
    // The correction that mattered. Defaulting a typo'd or legacy system key to 2024 would apply one
    // rulebook's rules to a character built against another, confidently, including inside an AI prompt.
    // Nothing a player can create reaches this branch — every surface offers the four real systems and
    // starts on the default — so it guards DATA, not choices, which is why the owner's ask and the
    // routing safety net do not actually conflict.
    for (const v of ['not-a-system', 'dnd-5e-2024', 'pathfinder']) {
      expect(normalizeSystem(v), `${v} must not be guessed`).toBe(SYSTEM_AMBIGUOUS);
    }
  });

  it('still honours an EXPLICIT ambiguous, so a caller that knows it does not know can say so', () => {
    // The grounding layer establishes this deliberately and then refuses to answer. Coercing it to 2024
    // would turn "I cannot tell you" into a confident answer from one system's rules.
    expect(normalizeSystem(SYSTEM_AMBIGUOUS)).toBe(SYSTEM_AMBIGUOUS);
  });

  it('leaves a real system alone', () => {
    for (const k of ['dnd5e-2014', 'pathfinder2e', 'intuitive-games']) expect(normalizeSystem(k)).toBe(k);
  });
});

describe('no player-facing surface offers it', () => {
  it('character creation has no ambiguous option and starts on the default', () => {
    const src = read('app/dnd/_ui/NewCharacterForm.tsx');
    expect(src).not.toMatch(/<option value=\{SYSTEM_AMBIGUOUS\}/);
    expect(src).not.toMatch(/System-ambiguous \(no specific ruleset\)/);
    expect(src).toMatch(/useState<string>\(DEFAULT_SYSTEM\)/);
  });

  it('the character list has no "No system" filter', () => {
    // It would be a permanently empty bucket now that nothing can be created without a system.
    expect(read('app/dnd/characters/page.tsx')).not.toMatch(/No system ·/);
  });

  it('the builder help no longer tells a player they can stay ambiguous', () => {
    expect(read('app/dnd/_ui/BuilderHelp.tsx')).not.toMatch(/stay system-ambiguous/);
  });
});
