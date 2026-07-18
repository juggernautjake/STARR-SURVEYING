// __tests__/dnd/statrail-effective-maxhp.test.ts — the always-visible StatRail showed the BASE max HP
// and computed its HP tone from it, while the Combat panel showed the effective max (base + hp_max
// effects). So a +HP buff (Heroes' Feast / Aid) raised the panel's max but not the rail's, and the
// rail's low-HP colour used the wrong denominator. The rail now reads the effective max (edit base,
// show effective — the abilities pattern).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIL = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/StatRail.tsx'), 'utf8');

describe('StatRail max HP is the ledger-effective value', () => {
  it('reads effMaxHp from the ledger, not base combat.maxHp', () => {
    expect(RAIL).toContain("ledger.value('hp_max', combat.maxHp)");
  });
  it('computes the HP fraction/tone from the effective max', () => {
    expect(RAIL).toContain('combat.currentHp / Math.max(1, effMaxHp)');
    expect(RAIL).not.toContain('combat.currentHp / Math.max(1, combat.maxHp)');
  });
  it('shows the effective max while still editing the base (display prop)', () => {
    expect(RAIL).toContain('display={<span');
    expect(RAIL).toContain('{effMaxHp}');
    expect(RAIL).toContain('value={combat.maxHp}'); // the editable base is unchanged
  });
});
