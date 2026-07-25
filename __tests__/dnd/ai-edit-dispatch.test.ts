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
    // No name-check for edit_sheet — its `edits` are applied by the mechanics path after the
    // other branches. They now reach that path THROUGH the rules gate (Area MV), so a vanilla
    // character can't be handed content its class and level don't grant by asking the AI for it.
    expect(route).toContain('gateEdits(editsRaw as SheetEdit[]');
    expect(route).toContain('const edits = gated.edits');
    expect(route).toContain('applySheetEdits(current, edits');
  });
  it('the offered toolset is exactly these tools (so a NEW tool forces a matching dispatch here)', () => {
    // If someone adds another tool to the route, this list must change — prompting them to add its handler too.
    // Declared once as `promptTools` and shared by all three phases (legacy apply, preview, confirm), so
    // the preview can never offer a tool the apply path doesn't handle.
    expect(route).toContain('const promptTools = [SHEET_EDIT_TOOL, LAYOUT_EDIT_TOOL, UNDO_TOOL, LEVEL_UP_TOOL, ...(isIG ? [IG_EDIT_TOOL] : []), ...(isPF2 ? [PF2_EDIT_TOOL] : [])]');
  });

  // Two-phase mode (Workstream B): a proposal is described, shown, and only applied on confirm. Each tool
  // that can be PROPOSED must therefore also be describable, or the player is asked to approve blank text.
  it('every dispatched tool has a proposal description', () => {
    const proposal = readFileSync(join(process.cwd(), 'lib/dnd/proposal.ts'), 'utf8');
    for (const name of [SHEET_EDIT_TOOL.name, ...namedDispatch]) {
      expect(proposal, `${name} has no describeProposal branch`).toContain(`tool === '${name}'`);
    }
  });

  it('confirm re-enters the SAME apply path rather than trusting the client', () => {
    // The proposal round-trips through the browser, so the gates must run again on confirm. They do
    // because confirm just rebuilds `result` and falls into the identical dispatch below.
    expect(route).toContain("if (mode === 'confirm')");
    expect(route).toContain('result = { name: proposal!.tool as string');
    // And the gate is not conditional on the phase.
    expect(route).not.toContain("mode !== 'confirm' && gateEdits");
  });
});
