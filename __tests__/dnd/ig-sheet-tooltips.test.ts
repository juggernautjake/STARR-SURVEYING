// __tests__/dnd/ig-sheet-tooltips.test.ts — the IG sheet's Combat panel must DISPLAY the active stance +
// conditions with a hover tooltip explaining each (owner: "if they have a condition/stance, clearly
// display it; hovering shows how it works"). Source-anchored (the render needs the component + an IG
// character); the pure tooltip text is covered by ig-in-play.test.ts.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/IGSheet.tsx'), 'utf8');

describe('IGSheet shows in-play stances + conditions with tooltips', () => {
  it('sources the tooltip text from the tested in-play model, not ad-hoc strings', () => {
    expect(SRC).toContain("from '@/lib/dnd/systems/intuitive-games/inPlay'");
    expect(SRC).toContain('igStanceInPlay(');
    expect(SRC).toContain('igConditionInPlay(');
  });

  it('renders a hover tooltip (title) on both the stance and condition chips', () => {
    // Both the stance chip and the condition chip pass the model's tooltip to a title attribute.
    expect(SRC).toMatch(/title=\{e\?\.tooltip/);
    // A help cursor signals the tooltip affordance on each.
    expect((SRC.match(/cursor: 'help'/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('shows the stance at the character level (Basic below Lv 5 / Advanced at Lv 5+)', () => {
    expect(SRC).toMatch(/igStanceInPlay\(name, derived\.level\)/);
    expect(SRC).toMatch(/one active at a time/i); // the label tells the player only one stance applies
  });
});
