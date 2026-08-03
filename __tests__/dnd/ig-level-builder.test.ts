// __tests__/dnd/ig-level-builder.test.ts — IG-4: the IG level-by-level UI walks the tested /ig-levels plan
// and the levels page dispatches IG characters to it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI = readFileSync(join(process.cwd(), 'app/dnd/_ui/IGLevelBuilder.tsx'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/levels/page.tsx'), 'utf8');

describe('IGLevelBuilder (IG-4)', () => {
  it('fetches the plan and records/commits through /ig-levels', () => {
    expect(UI).toContain('/ig-levels');
    // Carries `acceptException` since S6d: the walker gates the POWER and SPECIALIZATION now, so a
    // refusal needs a deliberate override rather than being a dead end.
    expect(UI).toContain('JSON.stringify({ choice, acceptException })');
    expect(UI).toContain('JSON.stringify({ commitTo: target })');
  });

  it('shows ONE outstanding choice at a time, resolved through the shared screen model (P5-7b)', () => {
    // Was `plan?.outstanding?.[0]`. P5-7b keeps the one-at-a-time property and changes where it comes
    // from: the player's selected screen, falling back to the first. Proven behaviourally in
    // `slot-steps.test.tsx`; the grep here only pins that IG shares that module rather than copying it.
    expect(UI).toContain('resolveSlotFocus(steps, focusId)');
    expect(UI).toContain("from '@/lib/dnd/builder/slot-steps'");
    expect(UI).not.toContain('plan?.outstanding?.[0]');
  });

  it('renders the screen strip — IG owes two feats at level 1, and both must be reachable (P5-7b)', () => {
    expect(UI).toContain('<SlotSteps');
    expect(UI).toContain('onSelect={setFocusId}');
  });

  it('pulls options from the plan, else the right IG catalog (feats by category, skills, trait benefits)', () => {
    expect(UI).toContain('choice.options?.length'); // plan options first (subclass power / spec / capstone)
    expect(UI).toMatch(/feat-general.*IG_FEATS.*General/s);
    expect(UI).toContain("systemSkills('intuitive-games')");
    expect(UI).toContain('TRAIT_BENEFITS');
  });

  it('will not commit past the current level until the plan is ready', () => {
    expect(UI).toMatch(/canCommit = plan\?\.ready && target > currentLevel/);
  });

  it('offers the flagged Multiclass Dedication house-rule in the feat pickers (MC-IG)', () => {
    expect(UI).toContain('igMulticlassTargets(subclass).map(igMulticlassDedicationName)');
    expect(UI).toMatch(/feat-general.*dedications/s);
    expect(UI).toMatch(/feat-combat.*dedications/s);
  });
});

describe('levels page dispatches IG → IGLevelBuilder', () => {
  it('IG uses IGLevelBuilder; PF2 and 5e keep their own builders', () => {
    expect(PAGE).toContain('import IGLevelBuilder');
    expect(PAGE).toMatch(/system === 'intuitive-games' \?\s*[\s\S]*IGLevelBuilder/);
    expect(PAGE).toContain('<PF2LevelBuilder');
    expect(PAGE).toContain('<LevelBuilder');
  });
});
