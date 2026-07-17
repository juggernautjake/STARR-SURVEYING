// __tests__/dnd/exhaustion-d20.test.ts — the OTHER half of 2024 exhaustion.
//
// exhaustion-speed.test.ts covers the −5 ft/level Speed penalty (a pure ledger effect) and notes the
// "−2/level to every d20 test is applied at roll time" — but nothing guards that roll-time penalty. It
// lives in the store's rollCheck/rollDeathSave callbacks (not pure, so source-anchored like other
// client-only behavior). This locks it: every d20 test — checks, saves, attacks, AND death saves —
// takes −2 per exhaustion level, the level is capped at 6, and the penalty is surfaced in the roll tag.
// A regression that drops the roll-time penalty (leaving only the speed hit) now fails here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const STORE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');

describe('2024 exhaustion applies −2/level to d20 tests at roll time', () => {
  it('rollCheck subtracts 2×level from every d20 modifier', () => {
    expect(STORE).toContain('rollD20(mod - 2 * exh');
    // and reads the character's exhaustion, capped so the penalty can't exceed 6 levels.
    expect(STORE).toMatch(/exh = char\.combat\.exhaustion \|\| 0/);
  });

  it('death saves take the same −2/level penalty (they are D20 Tests too)', () => {
    expect(STORE).toContain('char.combat.deathSaveBonus - 2 * exh');
  });

  it('the penalty is surfaced in the roll tag so the player sees why the roll dropped', () => {
    expect(STORE).toMatch(/EXH −\$\{2 \* exh\}/);
  });

  it('exhaustion is capped at 6 (death) wherever it is set', () => {
    // both the auto-increment path and the manual setter clamp to 0..6.
    expect((STORE.match(/Math\.min\(6, /g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
