// __tests__/dnd/edit-review.test.ts — the DM review queue surface (Slice 26).
//
// The revert LOGIC (revertSheetEdit) and the audit data (old_value) are tested elsewhere; this pins
// the surface that ties them together: a DM-gated Revert endpoint that reverses one edit through the
// tested engine, and a panel that lists the history and calls it. Source-anchored (the endpoint
// talks to Supabase; the panel is a client component) plus a live check of the revert round-trip the
// endpoint relies on.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, editOldValue, revertSheetEdit, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const ENDPOINT = read('app/api/dnd/characters/[id]/edits/revert/route.ts');
const PANEL = read('app/dnd/_sheet/components/EditReviewPanel.tsx');
const APP = read('app/dnd/_sheet/App.tsx');

describe('the Revert endpoint reverses one edit through the tested engine, gated', () => {
  it('is write-gated, scoped to the character, and calls revertSheetEdit', () => {
    expect(ENDPOINT).toContain('getCharacterAccess');
    expect(ENDPOINT).toContain('res.access.canWrite');           // DM or owner only
    expect(ENDPOINT).toContain(".eq('character_id', params.id)"); // can't revert another sheet's edit
    expect(ENDPOINT).toContain('revertSheetEdit(');
  });
  it('audits the revert itself (undoing is as visible as editing)', () => {
    expect(ENDPOINT).toContain("field_path: `revert:");
  });
});

describe('the review panel lists history and reverts, DM-only', () => {
  it('is gated on canWrite and calls the revert endpoint', () => {
    expect(PANEL).toContain('if (!canWrite) return null');
    expect(PANEL).toContain('/edits/revert');
    expect(PANEL).toContain('reloadFromDb()'); // pulls the reverted sheet back in
    // it hides the revert-audit rows so you don't "revert a revert" from the list.
    expect(PANEL).toContain("startsWith('revert:')");
  });
  it('is mounted on the sheet', () => {
    expect(APP).toContain('<EditReviewPanel />');
  });
  it('groups AI changes by request with per-batch Undo + Restore-to-here (history/undo D2)', () => {
    expect(PANEL).toContain('recentBatches');
    expect(PANEL).toContain("'revert-batch'"); // undo a whole batch
    expect(PANEL).toContain("'restore'");       // roll back to an earlier point
    expect(PANEL).toContain('Restore to here');
  });
});

describe('the round-trip the endpoint depends on holds end to end', () => {
  it('edit → audit old_value → revert restores the sheet', () => {
    const before = blankCharacter('Hero');
    before.combat = { ...before.combat, ac: 15 };
    const edit: SheetEdit = { op: 'set_combat', field: 'ac', value: 19 };
    const old = editOldValue(before, edit);      // 15, as the endpoint stores
    const applied = applySheetEdits(before, [edit]);
    expect(applied.combat.ac).toBe(19);
    const reverted = revertSheetEdit(applied, edit, old); // as the endpoint runs
    expect(reverted.combat.ac).toBe(15);
  });
});

describe('Approve clears the ✎ marks — the DM\'s "yay" (Slice 20/26)', () => {
  const read = (p: string) => require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8');
  it('the panel offers Approve-all which clears customized on every element', () => {
    const panel = read('app/dnd/_sheet/components/EditReviewPanel.tsx');
    expect(panel).toContain('customizedCount');
    expect(panel).toContain('✓ Approve all');
    expect(panel).toContain('customized: false');
    // gated on there being something to approve, and it's a setChar (persists via autosave).
    expect(panel).toContain('customizedCount > 0');
  });
});
