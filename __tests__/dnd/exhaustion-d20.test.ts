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
const INITP = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/InitiativePrompt.tsx'), 'utf8');

describe('2024 exhaustion applies −2/level to d20 tests at roll time', () => {
  it('rollCheck subtracts 2×level from every d20 modifier', () => {
    expect(STORE).toContain('rollD20(mod - 2 * exh');
    // and reads the character's exhaustion, capped so the penalty can't exceed 6 levels.
    expect(STORE).toMatch(/exh = char\.combat\.exhaustion \|\| 0/);
  });

  it('death saves take the same −2/level penalty (they are D20 Tests too), on the ledger-folded bonus', () => {
    expect(STORE).toContain("ledger.value('death_save', char.combat.deathSaveBonus) - 2 * exh");
  });

  it('the submitted initiative (encounter turn order) takes the same −2/level penalty', () => {
    // Initiative is a D20 Test too, so the InitiativePrompt's turn-order value must fold exhaustion —
    // otherwise an exhausted character would be placed too high in the order.
    expect(INITP).toMatch(/ledger\.value\('initiative'[\s\S]*- 2 \* \(char\.combat\.exhaustion/);
  });

  it('the penalty is surfaced in the roll tag so the player sees why the roll dropped', () => {
    expect(STORE).toMatch(/EXH −\$\{2 \* exh\}/);
  });

  it('exhaustion is capped at 6 (death) wherever it is set', () => {
    // both the auto-increment path and the manual setter clamp to 0..6.
    expect((STORE.match(/Math\.min\(6, /g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('the −2/level model is 2024-only, and its edition-blindness is a TRACKED gap (not silent)', () => {
  // This is the exhaustion analogue of effect-target-render-gaps: the flat −2/level applied above is the
  // 2024 rule. 2014 exhaustion is a qualitatively different TIERED table, which the AI grounding already
  // describes — so a 2014 character on this sheet is mechanically modelled with the WRONG exhaustion.
  // Implementing the 2014 table is a player-facing behavior change (owner-gated, BLOCKERS §A). Until then
  // this pins that the sheet applies the flat model UNCONDITIONALLY (no edition branch around it), so a
  // future edition-gating fix is a deliberate, test-visible change rather than an accidental drift.
  const SYSTEM_RULES = fs.readFileSync(path.join(process.cwd(), 'lib/dnd/system-rules.ts'), 'utf8');

  it('the roll-time exhaustion penalty is NOT gated on the character edition today', () => {
    // The `mod - 2 * exh` fold has no `system ===`/edition guard beside it — it is applied to every
    // character. (If someone adds 2014-tiered handling, this assertion should be updated in the same change.)
    const idx = STORE.indexOf('rollD20(mod - 2 * exh');
    expect(idx).toBeGreaterThan(0);
    const window = STORE.slice(Math.max(0, idx - 400), idx);
    expect(/system\s*===|edition\s*===|is2014|dnd5e-2014/.test(window)).toBe(false);
  });

  it('yet the AI grounding DOES distinguish the editions — the sheet is the side that lags', () => {
    // Proves the gap is a real inconsistency, not a codebase that is uniformly 2024-only: the rules block
    // tells the AI 2014 exhaustion is a tiered table while the sheet applies the flat 2024 penalty.
    expect(SYSTEM_RULES).toMatch(/TIERED/i);
  });
});
