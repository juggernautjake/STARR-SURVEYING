// __tests__/dnd/add-feat-op.test.ts — the keyed feat op that makes feats gateable (S7).
//
// S5 found the gap and left it open on purpose: feats reached a sheet as `add_feature`, which is
// free-form prose. "The Grappler feat" and "a homebrew feature called Grappler" are
// indistinguishable once written, so the gate could not tell which it was looking at, and
// name-matching would have refused legitimate homebrew. `add_feat` names catalog content, which
// is what makes it checkable.
import { describe, it, expect } from 'vitest';
import { applySheetEdits, resolveFeat, SHEET_EDIT_TOOL, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { gateEdits, type RulesGateContext } from '@/lib/dnd/rules-gate';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { FEATS_2024 } from '@/lib/dnd/feats/dnd5e-2024';

const origin = FEATS_2024.find((f) => f.category === 'origin')!;
const general = FEATS_2024.find((f) => f.category === 'general')!;

const feat = (ref: string, slot?: 'origin' | 'fighting-style' | 'asi'): SheetEdit =>
  ({ op: 'add_feat', feat: ref, ...(slot ? { slot } : {}) } as SheetEdit);

// The catalog these feats come from. `resolveFeat` takes it explicitly since 2026-07-21 (CX-17
// B1): it used to search FEATS_2024 for every system, so a Pathfinder or Intuitive Games character
// asking for a feat that exists in both games got the 5e one. See system-bleed.test.ts §6 for the
// cross-system half; this file is about the op itself, so it stays on 2024 throughout.
const SYSTEM = 'dnd5e-2024';

describe('the op resolves against the catalog', () => {
  it('accepts a feat key', () => {
    expect(resolveFeat(origin.key, SYSTEM)?.name).toBe(origin.name);
  });

  it('accepts a display name, case-insensitively', () => {
    // The AI reliably produces the NAME and only sometimes the key; accepting only keys would
    // silently drop half its calls.
    expect(resolveFeat(origin.name.toUpperCase(), SYSTEM)?.key).toBe(origin.key);
  });

  it('resolves nothing for an unknown feat', () => {
    expect(resolveFeat('Blorpwave Mastery', SYSTEM)).toBeUndefined();
    expect(resolveFeat('', SYSTEM)).toBeUndefined();
  });
});

describe('applying it writes a real feat, not a husk', () => {
  it('lands as a feature with the CATALOG benefit text', () => {
    const c = applySheetEdits(blankCharacter('T'), [feat(origin.key)]);
    const f = c.features?.find((x) => x.name === origin.name);
    expect(f).toBeTruthy();
    expect(f!.body[0]).toBe(origin.benefit);
    expect(f!.source).toContain('feat');
  });

  it('takes its benefit from the catalog even when the caller is wrong about it', () => {
    // The body is not caller-supplied, so a feat can never be granted with invented benefits.
    const c = applySheetEdits(blankCharacter('T'), [
      { op: 'add_feat', feat: origin.key, body: ['You gain +10 to everything.'] } as unknown as SheetEdit,
    ]);
    expect(c.features?.find((x) => x.name === origin.name)!.body[0]).toBe(origin.benefit);
  });

  it('drops an unresolvable feat rather than writing an empty husk', () => {
    // Ground Rule 2 — never invented. A feature that looks real and does nothing is worse than
    // no feature.
    const before = blankCharacter('T');
    const c = applySheetEdits(before, [feat('Definitely Not A Feat')]);
    expect(c.features?.length ?? 0).toBe(before.features?.length ?? 0);
  });

  it('does not duplicate on re-add', () => {
    const c = applySheetEdits(applySheetEdits(blankCharacter('T'), [feat(origin.key)]), [feat(origin.key)]);
    expect(c.features?.filter((x) => x.name === origin.name)).toHaveLength(1);
  });

  it('carries an offRules marker when one is set', () => {
    const c = applySheetEdits(blankCharacter('T'), [
      { op: 'add_feat', feat: general.key, offRules: 'granted by the DM — wrong slot' } as SheetEdit,
    ]);
    expect(c.features?.find((x) => x.name === general.name)?.offRules).toContain('granted by the DM');
  });
});

describe('and now the gate can actually see it', () => {
  const ctx: RulesGateContext = {
    system: 'dnd5e-2024', enforce: true, className: 'Fighter', level: 4, knownSpells: [],
  };

  it('refuses a general feat taken through an Origin slot', () => {
    const r = gateEdits([feat(general.key, 'origin')], ctx);
    expect(r.edits).toHaveLength(0);
    expect(r.refused[0].name).toBe(general.name);
  });

  it('allows an origin feat in an Origin slot', () => {
    expect(gateEdits([feat(origin.key, 'origin')], ctx).edits).toHaveLength(1);
  });

  it('refuses an Epic Boon far below level 19', () => {
    const boon = FEATS_2024.find((f) => f.category === 'epic-boon');
    if (!boon) return;
    expect(gateEdits([feat(boon.key, 'asi')], ctx).refused).toHaveLength(1);
  });

  it('blocks retaking a non-repeatable feat already on the sheet', () => {
    const nonRepeat = FEATS_2024.find((f) => f.category === 'general' && !f.repeatable)!;
    const r = gateEdits([feat(nonRepeat.key, 'asi')], { ...ctx, featureNames: [nonRepeat.name] });
    expect(r.refused).toHaveLength(1);
  });

  it('a DM grant of an illegal feat is allowed and marked', () => {
    const r = gateEdits([feat(general.key, 'origin')], { ...ctx, enforce: false, unboundReason: 'dm-grant' });
    expect(r.refused).toHaveLength(0);
    expect((r.edits[0] as { offRules?: string }).offRules).toContain('granted by the DM');
  });

  it('add_feature is still NOT gated', () => {
    // Deliberate: refusing free-form prose by name-matching would block real homebrew. This
    // asserts the boundary is where the design says it is, not that the gap was forgotten.
    const homebrew: SheetEdit = { op: 'add_feature', name: general.name, body: ['my own thing'] } as SheetEdit;
    const r = gateEdits([homebrew], ctx);
    expect(r.edits).toHaveLength(1);
    expect(r.refused).toHaveLength(0);
  });
});

describe('the AI is told to use it', () => {
  const schema = JSON.stringify(SHEET_EDIT_TOOL.input_schema);

  it('add_feat is an offered op', () => {
    expect(schema).toContain('add_feat');
  });

  it('the description steers official feats away from add_feature', () => {
    // Without this the model keeps using add_feature out of habit and the gate never sees a feat.
    expect(schema).toContain('PREFER add_feat over add_feature');
  });

  it('offRules is still not something the model can set', () => {
    expect(schema).not.toContain('offRules');
  });
});
