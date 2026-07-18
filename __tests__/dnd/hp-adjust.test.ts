// __tests__/dnd/hp-adjust.test.ts — the base HP-adjustment path (adjustHp).
//
// The separateHp FORM pool path is covered by form-hp.test.ts (routeFormDamage). But the common,
// non-form path — temp HP absorbs damage first, remaining damage floors current at 0, and healing caps
// at the LEDGER-EFFECTIVE max (so a +HP item raises the cap) — lives in the adjustHp store callback and
// was otherwise unguarded. Source-anchored, like other client-only store behavior.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const STORE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');
const adjustHp = STORE.slice(STORE.indexOf('const adjustHp = useCallback'), STORE.indexOf('const rollDeathSave'));

describe('adjustHp base path', () => {
  it('damage is absorbed by temp HP FIRST, then current (never below 0)', () => {
    expect(adjustHp).toContain('const fromTemp = Math.min(temp, dmg)');
    expect(adjustHp).toContain('temp -= fromTemp');
    expect(adjustHp).toContain('cur = Math.max(0, cur - (dmg - fromTemp))');
  });

  it('healing caps at the ledger-EFFECTIVE max (a +HP item raises the cap)', () => {
    expect(adjustHp).toContain('cur = Math.min(effMaxHp(c), cur + delta)');
  });

  it('a separateHp form takes the hit through the tested pool router instead', () => {
    expect(adjustHp).toContain('carryOver?.separateHp');
    expect(adjustHp).toContain('routeFormDamage(');
  });
});
