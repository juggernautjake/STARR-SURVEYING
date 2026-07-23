// __tests__/dnd/guided-builder.test.ts — the guided step-by-step builder (B1) is wired end to end.
// Source-anchored: the wizard route + shell + stepbystep routing are structural claims that are cheap to
// break silently (a renamed route, a reverted redirect), so we anchor them here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('guided character builder (B1)', () => {
  it('has a dedicated /builder route that owner-gates and assembles per-system steps', () => {
    const page = read('app/dnd/characters/[id]/builder/page.tsx');
    // Owner-gated like the levels page.
    expect(page).toMatch(/if \(!canWrite\) redirect/);
    // Each system gets a Foundations step from its existing builder, + a Review step.
    expect(page).toContain('Dnd5eManualBuilder');
    expect(page).toContain('PF2CharacterBuilder');
    expect(page).toContain('IGCharacterBuilder');
    expect(page).toContain('LevelBuilder'); // 5e Levels step
    expect(page).toContain('<GuidedBuilder');
    expect(page).toMatch(/phase: 'Review'/);
  });

  it('the stepbystep create mode routes to the dedicated builder, not the sheet', () => {
    const form = read('app/dnd/_ui/NewCharacterForm.tsx');
    expect(form).toMatch(/mode === 'stepbystep'/);
    expect(form).toMatch(/characters\/\$\{j\.characterId\}\/builder/);
  });

  it('the builder roller is docked (NOT the floating sheet roller)', () => {
    const roller = read('app/dnd/_ui/builder/BuilderRoller.tsx');
    // Uses the shared animated stage + dice pad, but never IMPORTS/wraps in the FloatingRoller (the
    // floating window is the sheet/play affordance; the builder roller is fixed in the page).
    expect(roller).toContain('rollerStageFor');
    expect(roller).toContain('DicePad');
    expect(roller).not.toMatch(/import[^\n]*FloatingRoller/);
    expect(roller).not.toMatch(/<FloatingRoller/);
    // And offers a stat roll (4d6 drop lowest) whose results are KEPT as a list (roll six, then assign),
    // not lost from the animated dice on the next roll.
    expect(roller).toMatch(/drop.*lowest/i);
    expect(roller).toMatch(/rolledStats/);
    expect(roller).toMatch(/Rolled scores/i);
  });

  it('the shell groups steps by phase Foundations -> Levels -> Review', () => {
    const shell = read('app/dnd/_ui/builder/GuidedBuilder.tsx');
    expect(shell).toContain('BuilderRoller'); // the docked roller is built into the shell
    expect(shell).toMatch(/phase/); // phase-grouped rail
  });
});
