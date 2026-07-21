// __tests__/dnd/rules-gate.test.ts — the doors that don't go through a picker (S5).
//
// S3 and S4 enforced eligibility in the pickers. That is necessary and not sufficient: the AI's
// `add_spell` op and the library grant route write the SAME edit vocabulary without passing
// through any picker. Enforcing only in the UI means going around the UI goes around the rules —
// so "ask the AI for Wish" would have remained a working exploit on a level-4 vanilla Wizard.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gateEdits, refusalSummary, type RulesGateContext } from '@/lib/dnd/rules-gate';
import { buildGrantEdits, isGrantError, type GrantRules } from '@/lib/dnd/library-grant';
import type { SheetEdit } from '@/lib/dnd/sheet-edits';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const spell = (name: string, level: number): SheetEdit =>
  ({ op: 'add_spell', name, level, description: 'x' } as SheetEdit);

// The character from the bug report.
const wizard4: RulesGateContext = {
  system: 'dnd5e-2024', enforce: true, className: 'Wizard', level: 4, knownSpells: [],
};

describe('the AI cannot hand a vanilla character what its class and level do not grant', () => {
  it('refuses Wish to a level-4 Wizard', () => {
    const r = gateEdits([spell('Wish', 9)], wizard4);
    expect(r.edits).toHaveLength(0);
    expect(r.refused).toHaveLength(1);
    expect(r.refused[0].name).toBe('Wish');
    expect(r.refused[0].reason).toBeTruthy();
  });

  it('refuses an off-list spell from another class', () => {
    expect(gateEdits([spell('Sacred Flame', 0)], wizard4).refused).toHaveLength(1);
  });

  it('still lets through what the character CAN take', () => {
    const r = gateEdits([spell('Magic Missile', 1)], wizard4);
    expect(r.edits).toHaveLength(1);
    expect(r.refused).toHaveLength(0);
  });

  it('refuses per-edit, keeping the legal ones in a mixed batch', () => {
    // All-or-nothing would be the wrong call: a batch of five sensible edits shouldn't be lost
    // because one was off-rules.
    const r = gateEdits([spell('Magic Missile', 1), spell('Wish', 9), spell('Fire Bolt', 0)], wizard4);
    expect(r.edits).toHaveLength(2);
    expect(r.refused.map((x) => x.name)).toEqual(['Wish']);
  });

  it('judges against the CATALOG, not the level the caller claims', () => {
    // The critical one. The AI supplies its own `level` field; if the gate trusted it, a model
    // could declare Wish to be a level-1 Wizard spell and walk straight through.
    const lying = { op: 'add_spell', name: 'Wish', level: 1, description: 'totally a cantrip' } as SheetEdit;
    expect(gateEdits([lying], wizard4).refused).toHaveLength(1);
  });

  it('leaves non-spell edits completely alone', () => {
    const others: SheetEdit[] = [
      { op: 'set_name', name: 'Bob' } as SheetEdit,
      { op: 'add_condition', name: 'Poisoned' } as SheetEdit,
    ];
    expect(gateEdits(others, wizard4).edits).toHaveLength(2);
  });

  it('passes homebrew through rather than refusing what it cannot look up', () => {
    // A spell that isn't in the catalog makes no claim to be official content, and refusing it
    // would block authoring something new — a real use, and not the exploit being closed.
    const r = gateEdits([spell('Blorpwave Cascade', 3)], wizard4);
    expect(r.edits).toHaveLength(1);
    expect(r.refused).toHaveLength(0);
  });
});

describe('the exemptions are honoured, and marked', () => {
  it('a DM grant is allowed and labelled as a grant', () => {
    const r = gateEdits([spell('Wish', 9)], { ...wizard4, enforce: false, unboundReason: 'dm-grant' });
    expect(r.refused).toHaveLength(0);
    expect((r.edits[0] as { offRules?: string }).offRules).toContain('granted by the DM');
  });

  it('a custom character is allowed and marked with the plain reason', () => {
    const r = gateEdits([spell('Wish', 9)], { ...wizard4, enforce: false, unboundReason: 'custom-character' });
    expect(r.refused).toHaveLength(0);
    const marker = (r.edits[0] as { offRules?: string }).offRules;
    expect(marker).toBeTruthy();
    expect(marker).not.toContain('granted by the DM');
  });

  it('a legal spell is never marked, even when unbound', () => {
    const r = gateEdits([spell('Magic Missile', 1)], { ...wizard4, enforce: false, unboundReason: 'dm-grant' });
    expect((r.edits[0] as { offRules?: string }).offRules).toBeUndefined();
  });

  it('never rewrites an edit into something legal', () => {
    // Silently downgrading "add Wish" to something castable would be worse than allowing OR
    // refusing it — the player would be told they got something they did not get.
    const r = gateEdits([spell('Wish', 9)], { ...wizard4, enforce: false, unboundReason: 'dm-grant' });
    expect((r.edits[0] as { name: string }).name).toBe('Wish');
  });
});

describe('a refusal is reported, never silent', () => {
  it('summarises what was refused and why', () => {
    const s = refusalSummary([{ name: 'Wish', reason: 'level-9 spell' }]);
    expect(s).toContain('Wish');
    expect(s).toContain('level-9 spell');
    expect(s).toContain('custom');
  });

  it('says nothing when nothing was refused', () => {
    expect(refusalSummary([])).toBeNull();
  });
});

describe('the library grant route enforces the same rules', () => {
  const bound = (over: Partial<GrantRules> = {}): GrantRules => ({
    enforce: true,
    character: { className: 'Wizard', level: 4, knownSpells: [] },
    ...over,
  });

  it('refuses to grant Wish to a level-4 vanilla Wizard', () => {
    const r = buildGrantEdits({ kind: 'spell', name: 'Wish', system: 'dnd5e-2024' }, bound());
    expect(isGrantError(r)).toBe(true);
  });

  it('grants what the character can legitimately take', () => {
    const r = buildGrantEdits({ kind: 'spell', name: 'Magic Missile', system: 'dnd5e-2024' }, bound());
    expect(isGrantError(r)).toBe(false);
  });

  it('a DM grant of the same spell succeeds, and lands marked', () => {
    const r = buildGrantEdits({ kind: 'spell', name: 'Wish', system: 'dnd5e-2024' },
      { enforce: false, unboundReason: 'dm-grant', character: { className: 'Wizard', level: 4, knownSpells: [] } });
    if (isGrantError(r)) throw new Error(r.error);
    expect((r.edits[0] as { offRules?: string }).offRules).toContain('granted by the DM');
    expect(r.summary).toContain('off-rules');
  });

  it('a spell the character already knows is not re-refused', () => {
    // Whatever put it there (a subclass list, an earlier DM gift) was legitimate; the sheet must
    // not start rejecting its own contents on the next look.
    const r = buildGrantEdits({ kind: 'spell', name: 'Sacred Flame', system: 'dnd5e-2024' },
      bound({ character: { className: 'Wizard', level: 4, knownSpells: ['Sacred Flame'] } }));
    expect(isGrantError(r)).toBe(false);
  });
});

describe('the routes actually call the gate, with server-derived facts', () => {
  it('ai-edit gates its edits', () => {
    const src = read('app/api/dnd/characters/[id]/ai-edit/route.ts');
    expect(src).toContain('gateEdits(');
    expect(src).toContain('refusalSummary(gated.refused)');
    // The decision must not come from the request body, or a caller declares itself custom.
    expect(src).toContain('readActiveSlotMeta((row as');
    expect(src).toContain('enforce: !isDM && gateVariant ===');
    expect(src).not.toMatch(/enforce:\s*body\./);
  });

  it('grant-content gates its grant', () => {
    const src = read('app/api/dnd/characters/[id]/grant-content/route.ts');
    expect(src).toContain('readActiveSlotMeta(row.system_variants)');
    expect(src).toContain('enforce: !isDMGrant && kindOfBuild ===');
    expect(src).not.toMatch(/enforce:\s*body\./);
  });

  it('the gate cannot be skipped by simply omitting it', () => {
    // buildGrantEdits takes rules as a REQUIRED second argument with an explicit opt-out arm.
    // An optional field gets forgotten and fails OPEN — the exact hole this slice closes.
    const src = read('lib/dnd/library-grant.ts');
    expect(src).toMatch(/buildGrantEdits\(req: GrantRequest, rules: GrantRules\)/);
  });

  it('offRules is not exposed in the AI tool schema', () => {
    // Server-set only. If the model could write it, "this is not off-rules" would become a claim
    // the model makes rather than a fact the server checks.
    const src = read('lib/dnd/sheet-edits.ts');
    expect(src).not.toMatch(/offRules:\s*\{\s*type:\s*'string'/);
  });
});
