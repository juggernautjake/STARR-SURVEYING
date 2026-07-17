import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

// Area D — exhaustion's −5 ft/level Speed penalty (the d20 −2/level is applied at roll time; this is
// the stored/derived Speed half, wired through the ledger so the ★ explains it).
function withExhaustion(level: number, speed = 30) {
  const c = blankCharacter('Weary');
  c.combat.speed = speed;
  c.combat.exhaustion = level;
  return c;
}

describe('exhaustion reduces Speed through the ledger', () => {
  it('a fresh (exhaustion 0) sheet is unmodified — no false marker', () => {
    const led = buildLedger(withExhaustion(0));
    expect(led.isModified('speed_walk')).toBe(false);
    expect(led.value('speed_walk', 30)).toBe(30);
  });

  it('each level drops walking speed by 5 ft', () => {
    expect(buildLedger(withExhaustion(1)).value('speed_walk', 30)).toBe(25);
    expect(buildLedger(withExhaustion(3)).value('speed_walk', 30)).toBe(15);
    expect(buildLedger(withExhaustion(5)).value('speed_walk', 30)).toBe(5);
  });

  it('stars the speed and explains it as the exhaustion source', () => {
    const led = buildLedger(withExhaustion(2));
    expect(led.isModified('speed_walk')).toBe(true);
    const contribs = led.explain('speed_walk');
    const exh = contribs.find((c) => c.source.startsWith('Exhaustion'));
    expect(exh).toBeTruthy();
    expect(exh!.source).toBe('Exhaustion 2');
    expect(exh!.delta).toBe(-10);
  });

  it('stacks with an equipped speed item (both explained)', () => {
    const c = withExhaustion(1, 30);
    c.inventory = [{ id: 'boots', name: 'Boots of Speed', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'speed_walk', operation: 'add', value: 10 }] } as never];
    const led = buildLedger(c);
    // 30 base + 10 boots − 5 exhaustion = 35
    expect(led.value('speed_walk', 30)).toBe(35);
    expect(led.explain('speed_walk').length).toBe(2);
  });
});

// The −2/level d20 penalty is applied at ROLL time in the store (not the ledger). Source-anchored,
// since the roll callbacks are store hooks. Death saves were the one d20 test that skipped it.
describe('exhaustion applies to every d20 roll, including death saves', () => {
  const STORE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');
  it('rollCheck reduces the d20 by 2 per exhaustion level', () => {
    expect(STORE).toContain('rollD20(mod - 2 * exh');
  });
  it('death saves take the SAME −2/level penalty (were the outlier)', () => {
    expect(STORE).toContain('char.combat.deathSaveBonus - 2 * exh');
  });
});
