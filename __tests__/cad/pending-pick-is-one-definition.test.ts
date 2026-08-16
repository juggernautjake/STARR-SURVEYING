// C14b — "is this tool mid-pick?" has exactly one answer.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// C14 shipped the universal Escape and C15 gave all 51 tools a prompt, and both asked the same
// question in the same wrong way: `drawingPoints.length`. That is correct for every tool that
// accumulates clicks into `drawingPoints`, and it is silently wrong for the nine that park a first
// pick in a field of their own.
//
// The two symptoms looked unrelated, which is why neither was found by the audits that preceded
// this one:
//
//   * The PROMPT froze on stage 1. Pick a line with FILLET and the command line goes on saying
//     "Click the FIRST line" — the worst kind of prompt, because it reads as though the click did
//     not register and invites the surveyor to click the same line again.
//   * ESCAPE took the tool away instead of the pick. MATCH_PROPERTIES' own code comment promises
//     it "stays in apply mode until the surveyor hits Esc"; pressing Esc dropped straight to
//     SELECT, so the documented way to finish with a source did something else entirely.
//
// Nine tools: MOVE, COPY, SCALE (basePoint), ROTATE (rotateCenter), FILLET, CHAMFER
// (…PickedLineId), MATCH_PROPERTIES, PERPENDICULAR (perpStartPoint), ARRAY (arrayPolarCenter).
//
// ── WHY THE TEST IS SHAPED THIS WAY ─────────────────────────────────────────────────────────────
//
// Asserting "Escape works for FILLET" one tool at a time would pass today and say nothing about
// the tool added next month, which is exactly how the gap opened. So the property under test is
// the one that actually holds the two callers together: for every field that means a pick is
// pending, `hasPendingPick` sees it, `pickStage` advances past 0, and `clearPendingPick` puts it
// back — while leaving the tool and the surveyor's option-bar settings alone.

import { describe, it, expect, beforeEach } from 'vitest';
import { useToolStore, hasPendingPick, pickStage } from '@/lib/cad/store/tool-store';
import type { ToolState } from '@/lib/cad/types';

/** One representative value per pending field, and the tool that parks it. Deliberately written
 *  out rather than imported from the store: a fixture generated from the list under test would
 *  agree with it by construction, including when both are wrong. */
const PENDING: ReadonlyArray<{ tool: string; field: keyof ToolState; value: unknown }> = [
  { tool: 'MOVE',             field: 'basePoint',               value: { x: 10, y: 20 } },
  { tool: 'ROTATE',           field: 'rotateCenter',            value: { x: 1, y: 2 } },
  { tool: 'OFFSET',           field: 'offsetSourceId',          value: 'feature-1' },
  { tool: 'FILLET',           field: 'filletPickedLineId',      value: 'feature-2' },
  { tool: 'CHAMFER',          field: 'chamferPickedLineId',     value: 'feature-3' },
  { tool: 'MATCH_PROPERTIES', field: 'matchPropertiesSourceId', value: 'feature-4' },
  { tool: 'PERPENDICULAR',    field: 'perpStartPoint',          value: { x: 5, y: 5 } },
  { tool: 'ARRAY',            field: 'arrayPolarCenter',        value: { x: 0, y: 0 } },
];

const reset = () => useToolStore.getState().setTool('SELECT');

describe('every pending pick is visible', () => {
  beforeEach(reset);

  it.each(PENDING)('$tool — $field counts as mid-pick', ({ field, value }) => {
    expect(hasPendingPick(useToolStore.getState().state)).toBe(false);
    useToolStore.setState((s) => ({ state: { ...s.state, [field]: value } }));
    expect(hasPendingPick(useToolStore.getState().state)).toBe(true);
  });

  it.each(PENDING)('$tool — the prompt advances off stage 1 for $field', ({ field, value }) => {
    expect(pickStage(useToolStore.getState().state)).toBe(0);
    useToolStore.setState((s) => ({ state: { ...s.state, [field]: value } }));
    // The prompts are written as `stage === 0 ? askForFirst : askForSecond`, so any non-zero is
    // what makes them show the second sentence. Asserting exactly 1 would over-specify: a tool
    // that later parks a pick AND accumulates points should report the point count.
    expect(pickStage(useToolStore.getState().state)).toBeGreaterThan(0);
  });

  it.each(PENDING)('$tool — Escape abandons $field and keeps the tool', ({ tool, field, value }) => {
    useToolStore.getState().setTool(tool as ToolState['activeTool']);
    useToolStore.setState((s) => ({ state: { ...s.state, [field]: value } }));

    useToolStore.getState().clearPendingPick();

    const after = useToolStore.getState().state;
    expect(after[field], 'the pick is gone').toBeNull();
    expect(hasPendingPick(after)).toBe(false);
    // The whole point of step 1 being separate from step 2: the surveyor is still holding the tool.
    expect(after.activeTool, 'the tool survives the cancel').toBe(tool);
  });
});

describe('drawingPoints is still the common case', () => {
  beforeEach(reset);

  it('a half-drawn polyline is mid-pick, and its point count is the stage', () => {
    useToolStore.getState().setTool('DRAW_POLYLINE');
    useToolStore.getState().addDrawingPoint({ x: 0, y: 0 });
    useToolStore.getState().addDrawingPoint({ x: 10, y: 0 });
    expect(hasPendingPick(useToolStore.getState().state)).toBe(true);
    // The variable-length prompts print this number ("2 pts — Enter to finish"), so it must be the
    // real count and not a flattened 1.
    expect(pickStage(useToolStore.getState().state)).toBe(2);

    useToolStore.getState().clearPendingPick();
    expect(useToolStore.getState().state.drawingPoints).toHaveLength(0);
    expect(useToolStore.getState().state.activeTool).toBe('DRAW_POLYLINE');
  });
});

describe('cancelling a pick is not cancelling the surveyor’s settings', () => {
  beforeEach(reset);

  it('keeps the option-bar values and the drawing modes', () => {
    useToolStore.getState().setTool('FILLET');
    useToolStore.getState().setFilletRadius(25);
    useToolStore.getState().setOrthoEnabled(true);
    useToolStore.getState().setOffsetDistance(12.5);
    useToolStore.getState().setDivideCount(8);
    useToolStore.getState().setFilletPickedLine('feature-9', { x: 1, y: 1 });

    useToolStore.getState().clearPendingPick();

    const after = useToolStore.getState().state;
    expect(after.filletPickedLineId, 'the pick goes').toBeNull();
    // These are configuration, not an operation in progress. Clearing them would make Escape
    // punish the surveyor for changing their mind about one click.
    expect(after.filletRadius, 'the radius stays').toBe(25);
    expect(after.orthoEnabled, 'ortho stays').toBe(true);
    expect(after.offsetDistance, 'the offset distance stays').toBe(12.5);
    expect(after.divideCount, 'the divide count stays').toBe(8);
  });

  it('clears the companion fields a pick owns, not just the field that names it', () => {
    // A dangling click point or base direction with no pick to belong to is worse than either —
    // the next pick would inherit the previous one's geometry.
    useToolStore.getState().setTool('FILLET');
    useToolStore.getState().setFilletPickedLine('feature-9', { x: 7, y: 7 });
    useToolStore.getState().clearPendingPick();
    expect(useToolStore.getState().state.filletPickedClickPoint).toBeNull();

    useToolStore.getState().setTool('PERPENDICULAR');
    useToolStore.getState().setPerpAnchor('line-1', { x: 1, y: 1 }, { x: 1, y: 0 });
    useToolStore.getState().clearPendingPick();
    const after = useToolStore.getState().state;
    expect(after.perpStartPoint).toBeNull();
    expect(after.perpBaseLineId).toBeNull();
    expect(after.perpBaseDir).toBeNull();
  });
});
