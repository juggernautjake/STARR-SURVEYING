// __tests__/dnd/bespoke-edit-history.test.ts — the bespoke sheets can SHOW what the audit recorded.
//
// The last link in the chain. The bespoke-edit audit slice made IG/PF2 edits land in `dnd_sheet_edits`;
// two follow-ups made those rows behave (no dead Revert button) and read (their sentence, not their
// opcode). This one gives them a surface: **neither `IGSheet` nor `PF2Sheet` rendered any edit history at
// all**, because `EditReviewPanel` is bound to the shared 5e store (`useChar`, for the ✎ approve-all pass
// over `char.attacks`/`inventory`/`features`/`spells`) and those sheets do not use it.
//
// So the platform's promise — "every change is visible to the DM, and reversible by them" — was false on
// half the systems in both halves: nothing was recorded, and there was nowhere to look.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const PANEL = read('app/dnd/_ui/SheetEditHistory.tsx');
const PAGE = read('app/dnd/characters/[id]/page.tsx');
const IG = read('app/dnd/_ui/IGSheet.tsx');
const PF2 = read('app/dnd/_ui/PF2Sheet.tsx');

describe('it is mounted where every FORMAT gets it', () => {
  // The first draft of this slice put the panel inside IGSheet and PF2Sheet. Both of those return EARLY
  // for the codex / dashboard / play formats, so it rendered on the Classic layout and nowhere else —
  // the "authored but not wired" defect, reintroduced by the fix for a different one. The page chrome is
  // where `VariantToggleView` already solves exactly this, for exactly this reason.
  it('the character page renders it for a bespoke sheet', () => {
    expect(PAGE).toContain("from '@/app/dnd/_ui/SheetEditHistory'");
    expect(PAGE).toMatch(/bespokeSheet && canWrite && <SheetEditHistory characterId=\{character\.id\} canWrite=\{canWrite\} \/>/);
  });

  it('and NOT inside either sheet, where three formats would miss it', () => {
    expect(IG).not.toContain('SheetEditHistory');
    expect(PF2).not.toContain('SheetEditHistory');
  });

  it('sits with the variant toggle, which is mounted for the same reason', () => {
    // If one moves into a layout-specific branch later, the other is the precedent that says why not.
    expect(PAGE).toContain('<VariantToggleView');
    expect(PAGE.indexOf('<SheetEditHistory')).toBeGreaterThan(PAGE.indexOf('<VariantToggleView'));
  });
});

describe('it is gated like the shared panel', () => {
  it('a viewer who cannot write sees nothing', () => {
    // Same rule as EditReviewPanel: a plain viewer has no business in a sheet's edit history. Enforced
    // twice — the fetch is skipped AND the render bails — so a canWrite that flips after load cannot leak.
    expect(PANEL).toContain('if (!characterId || !canWrite) return null');
    expect(PANEL).toMatch(/if \(!characterId \|\| !canWrite\) \{ setLoaded\(true\); return; \}/);
  });

  it('reads the same endpoint the shared panel does', () => {
    expect(PANEL).toContain('/edits?limit=40');
  });

  it('hides the revert-audit rows, matching the shared panel', () => {
    expect(PANEL).toContain("!(r.field_path ?? '').startsWith('revert:')");
  });
});

describe('it shares the formatter rather than growing a second one', () => {
  it('uses describeEdit', () => {
    // The formatter is exactly where two vocabularies drifted once already; a copy here would be a third.
    expect(PANEL).toContain("import { describeEdit } from '@/lib/dnd/edit-describe'");
    expect(PANEL).toContain('describeEdit(row)');
  });

  it('passes `summary` through, so bespoke rows read as sentences', () => {
    // These rows carry no before/after — the summary is the ONLY thing that describes them. Dropping it
    // from the row type would silently print `ig:add_power` again.
    expect(PANEL).toMatch(/summary\?: string \| null/);
  });
});

describe('it is read-only, deliberately', () => {
  it('offers no Revert', () => {
    // A bespoke row carries no `new_value`, so the revert route refuses it by design. A button here could
    // only ever fail — the exact dead control fixed on the shared panel, and re-adding it would be a
    // regression rather than a feature.
    //
    // Asserted on the CONTROL, not the word: the file explains at length why there is no Revert here, so a
    // `not.toContain('Revert')` fails on its own documentation. (It did — this test caught that first.)
    expect(PANEL).not.toContain('<button');
    expect(PANEL).not.toContain('edits/revert');
    expect(PANEL).not.toContain('onClick');
  });

  it('says so, instead of leaving the absence unexplained', () => {
    expect(PANEL).toContain('record what happened, not how to put it back');
  });
});

describe('the empty and loading states are distinguishable', () => {
  it('does not render "no edits" while still loading', () => {
    // The two states look the same to a reader if the loading one is skipped, and "this sheet is as it was
    // built" is a much stronger claim than "not loaded yet".
    expect(PANEL).toContain('Loading edit history…');
    expect(PANEL).toContain('No edits recorded yet');
    expect(PANEL).toMatch(/!loaded \? \([\s\S]{0,200}Loading edit history/);
  });
});
