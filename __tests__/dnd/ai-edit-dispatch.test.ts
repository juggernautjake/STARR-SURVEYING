// __tests__/dnd/ai-edit-dispatch.test.ts — a regression guard: every AI edit tool the ai-edit route can OFFER
// must also be DISPATCHED (handled) in that route. Guards against the "offered but not handled" bug shape,
// where the AI calls a tool the route ignores (it reports success while the sheet is unchanged).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHEET_EDIT_TOOL } from '@/lib/dnd/sheet-edits';
import { LAYOUT_EDIT_TOOL } from '@/lib/dnd/layout-edits';
import { IG_EDIT_TOOL } from '@/lib/dnd/systems/intuitive-games/ai';
import { PF2_EDIT_TOOL } from '@/lib/dnd/systems/pathfinder2e/ai';

const route = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/ai-edit/route.ts'), 'utf8');

describe('every AI edit tool offered by ai-edit is dispatched', () => {
  // Tools that get an explicit `result?.name === '<name>'` branch (the bespoke-sidecar + meta tools).
  const namedDispatch = [LAYOUT_EDIT_TOOL.name, IG_EDIT_TOOL.name, PF2_EDIT_TOOL.name, 'undo_last_change', 'level_up_character'];
  for (const name of namedDispatch) {
    it(`${name} has an explicit dispatch branch`, () => {
      expect(route).toContain(`result?.name === '${name}'`);
    });
  }
  it('edit_sheet is handled by the default mechanics path (its edits fall through)', () => {
    expect(SHEET_EDIT_TOOL.name).toBe('edit_sheet');
    // No name-check for edit_sheet — its `edits` are applied by the mechanics path after the other branches.
    expect(route).toContain('const edits = editsRaw as SheetEdit[]');
    expect(route).toContain('applySheetEdits(current, edits');
  });
  it('the offered toolset is exactly these tools (so a NEW tool forces a matching dispatch here)', () => {
    // If someone adds another tool to the route, this list must change — prompting them to add its handler too.
    expect(route).toContain('tools: [SHEET_EDIT_TOOL, LAYOUT_EDIT_TOOL, UNDO_TOOL, LEVEL_UP_TOOL, ...(isIG ? [IG_EDIT_TOOL] : []), ...(isPF2 ? [PF2_EDIT_TOOL] : [])]');
  });
});
