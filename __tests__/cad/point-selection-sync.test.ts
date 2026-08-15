// C10 — the point table and the canvas share one selection.
//
// ── WHAT THIS SLICE FOUND FIRST, AND WHY IT MATTERS TO C9 ───────────────────────────────────────
//
// `PointTablePanel` is imported by NOTHING. Not by CADLayout, not by any panel, not by any route —
// only by its own file and by tests. It is a superseded orphan: `PointDataViewer` is the mounted
// points table, and it is strictly better (it covers every drawing POINT rather than only imported
// survey points, its coordinate edits actually MOVE the point, and its name edits route through the
// guarded rename flow).
//
// C9 added in-place editing to the orphan. That work is real but unreachable, and this file records
// it rather than leaving it to be rediscovered. The lesson is narrow and worth stating: C6 and C7
// checked "does this capability already exist"; C9 checked what the component did without checking
// whether anyone could open it. "Is it mounted" is a different question from "is it good".
//
// So C10 was built against the LIVE component, and the orphan guard below is here so the two do not
// silently diverge further.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const viewer = readFileSync(join(process.cwd(), 'app/admin/cad/components/PointDataViewer.tsx'), 'utf8');
const code = viewer.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('table → canvas', () => {
  it('picked rows can be shown on the canvas without asking the AI', () => {
    // Previously the ONLY path from picks to the canvas was `bulkAskAI`. Every other bulk action —
    // send to layer, recolour, DELETE — acted on points the canvas never showed.
    expect(code).toMatch(/pushSelectionToCanvas/);
    expect(viewer).toMatch(/Show on canvas/);
  });

  it('pushes through the shared selection store, not a private copy', () => {
    expect(code).toMatch(/useSelectionStore\.getState\(\)\.selectMultiple/);
  });
});

describe('canvas → table', () => {
  it('reflects a selection made anywhere else', () => {
    expect(code).toMatch(/const selectedIds = useSelectionStore\(/);
    expect(code).toMatch(/setPicked\(new Set\(\[\.\.\.selectedIds\]/);
  });

  it('narrows to the rows the table is showing', () => {
    // A canvas selection of lines and arcs must not pick nothing and look broken; it picks the
    // points within it.
    expect(code).toMatch(/visibleRowIds\.has\(id\)/);
  });

  it('guards against the echo of its own push', () => {
    // Two stores writing to each other on every change is a loop. The flag marks writes this
    // component caused so the effect only reacts to selections from elsewhere.
    expect(code).toMatch(/canvasSyncRef/);
    expect(code).toMatch(/if \(canvasSyncRef\.current\) return;/);
  });

  it('clears the flag on a later tick, not immediately', () => {
    // The store notifies subscribers synchronously — clearing inline would unset the flag before
    // the effect it exists to suppress ever ran.
    expect(code).toMatch(/queueMicrotask/);
  });
});

describe('select by point number and range', () => {
  it('reuses the existing range parser rather than a second grammar', () => {
    // LayerTransferDialog already depends on it. Two parsers for "5-12" drift, and the surveyor
    // would have to learn which box understands what.
    expect(code).toMatch(/parsePointRangeString/);
    expect(code).toMatch(/buildPointNoIndex/);
  });

  it('reports numbers it could not resolve instead of quietly selecting fewer', () => {
    // A range that resolves to nine of the twelve you asked for is how the wrong nine get deleted.
    expect(code).toMatch(/missingNumbers/);
    expect(code).toMatch(/ambiguousNumbers/);
    expect(code).toMatch(/invalidTokens/);
    expect(code).toMatch(/setRangeNote/);
  });

  it('is a separate box from search, because they are different verbs', () => {
    // Search FILTERS the list; this SELECTS and pushes to the canvas. One box with two meanings
    // depending on an invisible mode is worse than two boxes.
    expect(viewer).toMatch(/Select 5-12/);
  });
});

describe('the orphaned point table', () => {
  it('PointTablePanel is still imported by no component', () => {
    // Recorded, not fixed. Deleting it is a call for whoever owns the points UI: it is 250 lines of
    // working code for imported SurveyPoints specifically, which PointDataViewer does not model.
    // What must not happen is a THIRD points table appearing because nobody realised there were
    // already two.
    const dir = join(process.cwd(), 'app/admin/cad/components');
    const importers = readdirSync(dir)
      .filter((f) => f.endsWith('.tsx') && f !== 'PointTablePanel.tsx')
      .filter((f) => /from ['"]\.\/PointTablePanel['"]/.test(readFileSync(join(dir, f), 'utf8')));
    expect(
      importers,
      'PointTablePanel gained an importer — if it is live again, C9/C10 must be reconciled across both tables',
    ).toEqual([]);
  });
});
