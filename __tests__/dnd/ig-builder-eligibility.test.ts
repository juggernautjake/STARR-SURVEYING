// __tests__/dnd/ig-builder-eligibility.test.ts — the IG builder greys what you can't take (S0).
//
// The server refused illegal builds correctly, but the builder still offered every power in the
// game, so a player composed an illegal build and only found out at save. Correctness was never
// the gap; feedback timing was.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isRulesEnforcedKind } from '@/lib/dnd/system-variants';

const src = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/IGCharacterBuilder.tsx'), 'utf8');

describe('the builder consults the same eligibility core as the server', () => {
  it('calls igPowerEligibility rather than re-deriving the rules', () => {
    expect(src).toContain("from '@/lib/dnd/systems/intuitive-games/eligibility'");
    expect(src).toContain('igPowerEligibility(name');
  });

  it('greys and disables ineligible chips instead of hiding them', () => {
    // "Why can't I take this?" is a question the builder should answer; hiding the row makes the
    // list look arbitrary.
    expect(src).toContain('disabled={blocked}');
    expect(src).toContain("textDecoration: blocked ? 'line-through'");
    expect(src).toContain('title={blocked ?');
  });

  it('enforces whenever the rules BIND, matching the server', () => {
    // This test used to pin the literal `variantKind !== 'vanilla'`, which is how the bug survived: when
    // S8a added the third `altered-vanilla` kind, that expression became true for it, so the picker greyed
    // nothing while `ig-build` went on refusing the same picks with a 400 — and the test kept passing,
    // because it was asserting the implementation rather than the rule.
    //
    // Pinned as the RULE now: the question is "do the rules bind?", which is what the server asks.
    expect(src).toContain('if (!isRulesEnforcedKind(variantKind)) return undefined;');
    expect(src).toContain("variantKind = 'vanilla'"); // safe default
  });

  it('and an ALTERED-VANILLA character is greyed exactly like a vanilla one', () => {
    // The behavioural half of the above: the two rules-bound kinds must be indistinguishable here, since
    // the server holds both to the same gate via `isRulesEnforcedKind`.
    expect(isRulesEnforcedKind('vanilla')).toBe(true);
    expect(isRulesEnforcedKind('altered-vanilla')).toBe(true);
    expect(isRulesEnforcedKind('custom')).toBe(false);
  });

  it('never blocks an already-selected chip', () => {
    // Otherwise a pick made before the class was chosen — or one a DM granted — is stranded and
    // cannot be removed. S5 added a second reason to block (the level-schedule budget), so this asserts
    // the RULE — every branch of the reason chain exempts an active chip — rather than one literal line.
    expect(src).toContain('const reason = active ? undefined');
    expect(src).toContain('budget != null && !active && sel.length >= budget');
  });

  it('gates powers only — not stances or feats', () => {
    // Same boundary as the eligibility core: a trait may be taken as "a new stance", and IG feat
    // prerequisites are unstructured prose.
    expect(src).toContain('reasonFor={powerReason}');
    expect(src).not.toContain('reasonFor={stanceReason}');
    expect(src).not.toContain('reasonFor={featReason}');
  });

  it('the character page passes the real variant', () => {
    const page = fs.readFileSync(path.join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');
    expect(page).toContain('variantKind={readActiveSlotMeta(');
  });
});
