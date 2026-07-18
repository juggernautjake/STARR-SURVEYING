// __tests__/dnd/statrail-effective-speed.test.ts — the StatRail Speed pill showed BASE combat.speed
// while the Combat panel showed the effective walk speed (Boots of Striding + the exhaustion −5ft/level
// penalty the ledger folds in). So a speed item — and, more importantly, exhaustion's speed hit the user
// asked to be real — never showed in the most prominent place. The rail now shows the effective speed.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIL = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/StatRail.tsx'), 'utf8');

describe('StatRail Speed is the ledger-effective walk speed', () => {
  it('reads the ledger speed_walk (folds items + exhaustion), not base combat.speed', () => {
    expect(RAIL).toContain("ledger.value('speed_walk', combat.speed)");
  });
  it('shows the effective speed while editing the base (display prop)', () => {
    expect(RAIL).toContain('{walkSpeed}');
    // the base is still what the InlineNumber edits
    expect(RAIL).toContain('value={combat.speed}');
    expect(RAIL).toContain('speedModified');
  });
});
