// __tests__/dnd/pf2-content-picker.test.ts — PF2 gets a real content picker (S13).
//
// PF2 had the catalog AND the gated add_feat/add_spell ops, but nothing in the UI could reach
// them — so the only way to get content onto a PF2 sheet was to ask the AI. This is the PF2
// counterpart of the 5e SpellPicker/FeatPicker, and it deliberately behaves the same way so three
// systems don't teach three different interaction models.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const picker = read('app/dnd/_ui/PF2ContentPicker.tsx');
const sheet = read('app/dnd/_ui/PF2Sheet.tsx');

describe('it consults the real eligibility core', () => {
  it('uses the same functions the server gate uses', () => {
    // If the picker re-derived the rules, it and the server would drift and a player would be
    // shown one answer and given another.
    expect(picker).toContain('pf2FeatEligibility');
    expect(picker).toContain('pf2SpellEligibility');
    expect(picker).toContain('pf2ContextFor');
  });

  it('reads the catalog rather than a hand-written list', () => {
    expect(picker).toContain('PF2_ALL_FEATS');
    expect(picker).toContain('PF2_ALL_SPELLS');
  });
});

describe('it enforces the same three-way rule as 5e and IG', () => {
  it('hard-blocks a vanilla character', () => {
    expect(picker).toContain('const blocked = isVanilla && !r.elig.ok && !isDM');
    expect(picker).toContain('disabled={blocked}');
  });

  it('offers "＋ Anyway" to a custom character', () => {
    expect(picker).toContain("'＋ Anyway'");
    expect(picker).toContain("'✕ Blocked'");
  });

  it('never blocks the DM', () => {
    expect(picker).toContain('&& !isDM');
  });

  it('re-checks in the click handler, not just on the button', () => {
    // `disabled` is an affordance, not an enforcement point.
    expect(picker).toContain('if (!blocked) onAdd(r.edit)');
  });

  it('defaults to vanilla, the safe direction', () => {
    expect(picker).toContain("variantKind = 'vanilla'");
    expect(sheet).toContain("variantKind = 'vanilla'");
  });
});

describe('it shows ineligible entries rather than hiding them', () => {
  it('renders the reason', () => {
    // "Why can't I take this?" is a question the sheet should answer; hiding the row makes the
    // list look arbitrary.
    expect(picker).toContain('r.elig.reason');
  });

  it('sorts eligible entries first', () => {
    expect(picker).toContain('Number(b.elig.ok) - Number(a.elig.ok)');
  });

  it('admits the catalog is partial', () => {
    // Otherwise a missing spell reads as "Pathfinder has no such spell".
    expect(picker).toContain('!status.complete');
    expect(picker).toContain('not the full list yet');
  });
});

describe('the sheet wires it up sensibly', () => {
  it('offers the spell picker only to casters', () => {
    // A Fighter has no use for one, and showing it would suggest they could cast.
    expect(sheet).toContain("pf2.spellcasting.kind !== 'none'");
  });

  it('routes adds through the gated pf2-edit route', () => {
    // The picker's greying is feedback timing; the server gate is the enforcement.
    expect(sheet).toContain('void postEdit(edit)');
    expect(sheet).toContain('pf2-edit');
  });

  it('the character page passes the real variant and DM flag', () => {
    const page = read('app/dnd/characters/[id]/page.tsx');
    expect(page).toMatch(/<PF2Sheet[\s\S]*?variantKind=\{readActiveSlotMeta\(/);
    expect(page).toMatch(/<PF2Sheet[\s\S]*?isDM=\{isDM\}/);
  });
});
