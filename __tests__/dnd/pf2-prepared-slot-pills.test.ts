// __tests__/dnd/pf2-prepared-slot-pills.test.ts — the slot pills say how many slots are FILLED.
//
// S7c's display half. The pills read "Rank 1: 3" — the entitlement and nothing else — so a prepared caster
// could not see whether today's slots were full. The number was computed, rendered, and left unanswerable,
// which is the same shape as 5e's `preparedCap`: rendered on the sheet since the panel was written while
// the only thing that ever SET it was a demo character.
//
// Enforcement is NOT here. A prepared cap belongs on the server's `update_spell`, since a client-only cap
// is decoration — this session found that three times over. The display is the honest, zero-risk half, and
// S7b's finding is why it is worth shipping on its own: a limit stated up front reads as a rule, while the
// same limit discovered by refusal reads as a bug.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/dnd/_ui/pf2/usePf2Panels.tsx'), 'utf8');

/** The pill block, so these assertions cannot pass on some other part of a 1000-line file. */
const PILLS = SRC.slice(SRC.indexOf('pf2.spellcasting.slots.map'), SRC.indexOf('Focus Points pool'));

describe('the fill count is shown, and only where it means something', () => {
  it('counts spells prepared at that rank', () => {
    expect(PILLS).toContain('s.prepared && s.rank === r');
  });

  it('only for PREPARED casters — a repertoire is not a per-day assignment', () => {
    // "2/3 prepared" is meaningless for a spontaneous caster, so they keep the bare entitlement.
    expect(PILLS).toContain("pf2.spellcasting.kind === 'prepared'");
  });

  it('and never for cantrips, which are not slot-cast', () => {
    expect(PILLS).toMatch(/kind === 'prepared' && r > 0/);
  });

  it('renders `prepared/slots` when it applies and the bare number when it does not', () => {
    expect(PILLS).toContain('prepared == null ? n : `${prepared}/${n}`');
  });
});

describe('focus spells are excluded, or the count would be wrong', () => {
  it('filters them out', () => {
    // Focus spells are cast from the focus pool, not from slots — the same exclusion the Focus Points
    // block relies on. Counting them would show a caster over their slots while nothing was wrong.
    expect(PILLS).toContain('!s.focus');
  });
});

describe('being over the number is shown, not hidden', () => {
  it('flags the overage rather than clamping the display', () => {
    // Clamping would hide a real state — an older character, a DM grant, an edit made before this
    // existed. The codebase's standing rule is grandfather and mark, never silently correct.
    expect(PILLS).toContain('prepared > n');
    expect(PILLS).toContain('--hx-danger-2');
  });

  it('and explains both states on hover', () => {
    expect(PILLS).toContain('more than this rank grants');
    expect(PILLS).toContain('prepared today');
  });

  it('uses the LIGHT danger token, per the contrast work', () => {
    // `--hx-danger` is tuned as a border/fill accent and fails AA as small text on these panels (slice 34).
    expect(PILLS).not.toMatch(/color: over \? 'var\(--hx-danger\)'/);
  });
});
