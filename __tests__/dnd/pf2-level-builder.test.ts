// __tests__/dnd/pf2-level-builder.test.ts — B10: the PF2 level-by-level UI walks the tested /pf2-levels
// plan and the levels page dispatches PF2 characters to it (not the 5e class-table builder).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI = readFileSync(join(process.cwd(), 'app/dnd/_ui/PF2LevelBuilder.tsx'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/levels/page.tsx'), 'utf8');
const OPTIONS = readFileSync(join(process.cwd(), 'lib/dnd/slots/walker-options.ts'), 'utf8');

describe('PF2LevelBuilder (B10)', () => {
  it('fetches the plan and records/commits through the /pf2-levels route', () => {
    expect(UI).toContain('/pf2-levels');
    // Carries `acceptException` since S6d — the walker now gates the VALUE as well as the slot, so a
    // refusal needs a way to be taken deliberately rather than being a dead end.
    expect(UI).toContain('JSON.stringify({ choice, acceptException })');
    expect(UI).toContain("JSON.stringify({ commitTo: target })");
  });

  it('shows ONE outstanding choice at a time, resolved through the shared screen model (P5-7b)', () => {
    // This used to pin `plan?.outstanding?.[0]` — the literal expression, not the rule. P5-7b replaced it:
    // the walker now renders whichever screen the player selected, falling back to the first when nothing
    // is selected or when the selected one was just answered. The one-at-a-time property is unchanged;
    // where it comes from is not.
    //
    // The behaviour itself is proven in `slot-steps.test.tsx` against the pure module. What is worth a
    // grep here is that this walker did not keep a private copy of the selection logic.
    expect(UI).toContain('resolveSlotFocus(steps, focusId)');
    expect(UI).toContain("from '@/lib/dnd/builder/slot-steps'");
    expect(UI).not.toContain('plan?.outstanding?.[0]');
  });

  it('renders the screen strip, so a player can reach a choice that is not the first (P5-7b)', () => {
    // The point of the slice. Without this the walker resolves a focus it gives no way to change.
    expect(UI).toContain('<SlotSteps');
    expect(UI).toContain('onSelect={setFocusId}');
  });

  it('offers subclass options from the class, feats scoped to the slot, and 4 boosts', () => {
    expect(UI).toContain('pf2Class(className)?.subclassOptions');
    // S6g CHANGED WHAT THIS ASSERTS, on purpose. It used to pin the literal filter
    // `f.track === choice.track && f.level <= choice.level` — which is how the defect survived: the
    // suite pinned the implementation as if it were the rule, so the filter that made the escape hatch
    // unreachable was actively protected by a green test. (S6f hit the identical trap on the 5e walker.)
    // The RULE is that the slot's track/class scope the offer and the LEVEL is shown rather than
    // enforced; `walker-options.test.ts` proves that behaviourally against the real catalog and gate.
    expect(UI).toContain('pf2WalkerFeatOptions(choice.track, choice.level, className)');
    expect(UI).not.toContain('f.level <= choice.level');
    expect(UI).toContain('picks.length !== 4'); // boosts require exactly 4
  });

  it('will not commit past the current level until the plan is ready', () => {
    expect(UI).toMatch(/canCommit = plan\?\.ready && target > currentLevel/);
  });

  it('does not import the 5e feat list or class registry (PF2 reads its own data)', () => {
    expect(UI).not.toContain('feats/dnd5e-2024');
    // The catalog read moved into `lib/dnd/slots/walker-options.ts` with S6g, so this asserts the
    // PROPERTY that mattered — PF2's walker is fed PF2 data — one hop away, rather than pinning an
    // import line that is no longer where the decision lives.
    expect(UI).toContain('slots/walker-options');
    expect(OPTIONS).toContain('systems/pathfinder2e/data');
    expect(OPTIONS).not.toContain('feats/dnd5e-2024');
  });
});

describe('levels page dispatches by system', () => {
  it('PF2 → PF2LevelBuilder, everything else → the 5e LevelBuilder', () => {
    expect(PAGE).toContain('import PF2LevelBuilder');
    expect(PAGE).toMatch(/system === 'pathfinder2e' \?\s*[\s\S]*PF2LevelBuilder/);
    expect(PAGE).toContain('<LevelBuilder');
  });
});
