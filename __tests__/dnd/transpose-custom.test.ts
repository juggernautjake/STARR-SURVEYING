// __tests__/dnd/transpose-custom.test.ts — Area TR3. The transpose route honors the custom-content consent:
// vanilla-first always; only with allowCustom may the AI create BALANCED custom content, told to read the
// target system first. Source-anchors the route wiring (the AI call isn't run in unit tests).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/system/route.ts'), 'utf8');

describe('transpose route honors allowCustom (TR3)', () => {
  it('parses allowCustom from the body, defaulting to false (never silently invents)', () => {
    expect(route).toContain('const allowCustom = body?.allowCustom === true');
  });

  it('selects the prompt by consent: vanilla-only vs balanced-custom', () => {
    expect(route).toContain('transposeSystemPrompt(allowCustom)');
    expect(route).toMatch(/never invent new classes/i);        // vanilla-only prompt
    expect(route).toMatch(/BALANCED custom element/);          // allow-custom prompt
    expect(route).toMatch(/balanced against comparable vanilla content/i);
  });

  it('tells the AI to READ the target system first and prefer vanilla', () => {
    expect(route).toMatch(/READ and understand the TARGET system’s rules/);
    expect(route).toMatch(/PREFER the target system’s VANILLA options/);
  });

  it('custom pieces are listed for DM review, and the response reports allowedCustom', () => {
    expect(route).toMatch(/with "CUSTOM:"/);            // still flagged in the summary
    expect(route).toContain('record EVERY invented element in the `custom` array'); // + a structured manifest
    expect(route).toContain('allowedCustom: allowCustom');
  });
});

describe('custom content is balanced to a concrete level (transpose)', () => {
  it('defaults the balancing level to the source character’s level so the instruction always fires', () => {
    // Previously partyLevel came only from the request body (which the UI never sent), so the "balance to
    // level N" line never appeared; now it falls back to the character's own level.
    expect(route).toContain("(source.meta.level || undefined)");
    expect(route).toMatch(/Balance any custom content to level \$\{partyLevel\}/);
  });
});

describe('the transpose result surfaces rule violations (were computed but hidden)', () => {
  const switcher = readFileSync(join(process.cwd(), 'app/dnd/_ui/SystemSwitcher.tsx'), 'utf8');
  it('the route returns violations and the switcher shows them in the done banner', () => {
    expect(route).toContain('violations = validateCharacterForSystem(transposed, target)');
    expect(route).toContain('violations,'); // returned in the response
    expect(switcher).toContain('violations: j.violations ?? []'); // captured from the response
    expect(switcher).toContain('transpose.violations && transpose.violations.length > 0'); // rendered
    expect(switcher).toMatch(/rules .*to review/);
  });
});

describe('transpose PRESERVES the character’s stats — no reset to blank 10s / 1 HP (bug fix 2026-07-18)', () => {
  it('carries the 6 ability scores forward from the source into the seed (5e/PF2/IG share them)', () => {
    // The reported bug: a transposed character came out with every ability at 10, because the blank seed's
    // scores were never overwritten when the AI only rebuilt features/attacks. The seed now inherits the source
    // abilities so a vanilla transpose keeps the real stats; the AI's set_ability edits still win on top.
    expect(route).toContain('seed.abilities = { ...seed.abilities, ...source.abilities }');
  });

  it('has an ability safety net: restore the source scores if the applied edits left the block all-10', () => {
    expect(route).toContain('const allTen = ABILS.every');
    expect(route).toContain('sourceHadReal');
    expect(route).toContain('transposed.abilities = { ...transposed.abilities, ...source.abilities }');
  });

  it('still repairs HP from level + hit die and fills to full (never left at the seed’s 1/1)', () => {
    expect(route).toContain('transposed.combat.maxHp = fallbackMaxHp(');
    expect(route).toContain('transposed.combat.currentHp = transposed.combat.maxHp');
  });
});
