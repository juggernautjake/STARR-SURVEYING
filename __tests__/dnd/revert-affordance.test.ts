// __tests__/dnd/revert-affordance.test.ts — Revert is offered only where it can work.
//
// THE DEFECT: the DM's review queue rendered a "⟲ Revert" button on EVERY row, while the revert route
// refuses any row carrying no `new_value` with *"This edit carries no reversible change."* So a DM
// clicking Revert on a bespoke-sheet row (`ig:*` / `pf2:*`) got an error, every time, with nothing to do
// about it. A dead control — one of the defect classes the final-QA walkthrough exists to hunt.
//
// It was pre-existing (the AI path has written those rows for a long time) but the bespoke-edit audit
// slice made them COMMON, since every IG/PF2 build edit now files one. Fixing the affordance is the
// follow-through on that slice rather than a separate concern.
//
// The rule now lives in one place — `isRevertableEditRow` — because the UI and the two revert routes were
// each answering it separately, and the UI answered it wrong.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRevertableEditRow } from '@/lib/dnd/sheet-edits';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const PANEL = read('app/dnd/_sheet/components/EditReviewPanel.tsx');
const REVERT = read('app/api/dnd/characters/[id]/edits/revert/route.ts');
const REVERT_BATCH = read('app/api/dnd/characters/[id]/edits/revert-batch/route.ts');

describe('the predicate itself', () => {
  it('a row carrying the edit is reversible', () => {
    expect(isRevertableEditRow({ new_value: { op: 'set_level', level: 4 } })).toBe(true);
  });

  it('a bespoke-sheet row is not — it records what happened, not how to undo it', () => {
    // `ig:add_power` / `pf2:add_feat` describe a change to a SIDECAR the 5e `Character` shape cannot
    // express, so `revertSheetEdit` has nothing to replay backwards.
    expect(isRevertableEditRow({ new_value: null })).toBe(false);
  });

  it('and neither is a missing row or a missing field', () => {
    expect(isRevertableEditRow(null)).toBe(false);
    expect(isRevertableEditRow(undefined)).toBe(false);
    expect(isRevertableEditRow({})).toBe(false);
  });
});

describe('the review panel offers Revert only where it works', () => {
  it('gates the button on the predicate', () => {
    expect(PANEL).toContain('isRevertableEditRow(row) ? (');
  });

  it('still SHOWS the row, rather than hiding history to avoid an awkward button', () => {
    // The wrong fix would be filtering these rows out — that hides a real change from the DM, which is
    // strictly worse than a row without an undo button. The visible-row filter must still only drop the
    // revert-audit rows.
    expect(PANEL).toContain("!(r.field_path ?? '').startsWith('revert:')");
    expect(PANEL).not.toMatch(/visible\s*=\s*rows\.filter\([^)]*new_value/);
  });

  it('says what the row IS instead of leaving a blank space', () => {
    expect(PANEL).toContain('record only');
  });
});

describe('one rule, asked in one place', () => {
  it('the single-edit revert route uses the predicate', () => {
    expect(REVERT).toContain('isRevertableEditRow(edit)');
    // And still returns the same refusal it always did, for a caller that POSTs directly.
    expect(REVERT).toContain('This edit carries no reversible change.');
  });

  it('the batch revert route uses it too', () => {
    // This one was already correct (`!!r.new_value` inline) — routed through the shared predicate so a
    // future change to the rule cannot reach two of the three callers and miss the third.
    expect(REVERT_BATCH).toContain('isRevertableEditRow(r)');
  });

  it('none of the three re-derives it inline any more', () => {
    expect(PANEL).not.toContain('row.new_value ?');
    expect(REVERT).not.toContain('!edit.new_value');
    expect(REVERT_BATCH).not.toContain('!!r.new_value');
  });

  it('the server still refuses a direct POST, so the UI gate is not the only defence', () => {
    // The button being hidden is a courtesy; the 400 is the guarantee.
    expect(REVERT).toMatch(/isRevertableEditRow\(edit\)\) return NextResponse\.json\([\s\S]{0,120}status: 400/);
  });
});
