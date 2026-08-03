// CAD_AUDIT Slice S6a — classic COGO is reachable from the Survey menu.
//
// The owner asked for "bearing/distance calculations, distance/distance calculations,
// bearing/bearing calculations" as though they needed building. S1a's menu catalogue found they were
// ALREADY BUILT: `CalcPointDialog` implements DIST_DIST, BRG_DIST, TWO_BEARINGS, FOURTH_CORNER and
// PARALLEL over `lib/cad/geometry/cogo.ts`.
//
// They were filed under the **AI** menu — because the dialogue happens to deliver its answer as a
// reviewable ghost proposal. That is a detail of how the result is presented, and it had become the
// reason nobody could find the feature. Classic COGO is not an AI feature; it is the oldest
// arithmetic in surveying, and a surveyor looking for it opens Survey.
//
// This is the "built but unreachable" defect in its subtlest form. Nothing was missing, nothing was
// broken, and the capability was still effectively absent.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(
  path.join(process.cwd(), 'app/admin/cad/components/MenuBar.tsx'), 'utf8');

/** The Survey menu's item list, isolated so "it appears somewhere in the file" cannot pass for
 *  "it appears in the Survey menu" — the AI menu contains the same labels by design. */
function surveyMenuBlock(): string {
  const start = src.indexOf("label: 'Survey'");
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf("label: 'Draw'", start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('the COGO solver is reachable from Survey', () => {
  it('Calc Point is listed in the Survey menu', () => {
    expect(surveyMenuBlock()).toContain('Calc Point (dist–dist, bearing–dist, bearing–bearing, 4th corner)…');
  });

  it('it opens the same dialogue the AI menu opens, not a second implementation', () => {
    // A duplicate dialogue would drift from the original within a release.
    expect(surveyMenuBlock()).toContain("new CustomEvent('cad:openCalcPointDialog')");
  });

  it('Bowditch closure is listed there too', () => {
    // Also a survey computation rather than an AI one, and it was filed the same way.
    const block = surveyMenuBlock();
    expect(block).toContain('Close Drawing (Bowditch adjust)…');
    expect(block).toContain("new CustomEvent('cad:openCloseDrawingDialog')");
  });
});

describe('the AI menu keeps its entries', () => {
  it('still lists Calc Point', () => {
    // Listed in BOTH menus deliberately. The AI path is documented, and silently relocating it
    // would break anyone who already knows where it lives — a "cleanup" that costs a user their
    // muscle memory is not a cleanup.
    const aiStart = src.indexOf("label: 'AI'");
    expect(aiStart).toBeGreaterThan(-1);
    expect(src.slice(aiStart)).toContain('Calc Point (dist–dist, bearing–dist, bearing–bearing, 4th corner)…');
  });
});

describe('the maths behind the menu item really exists', () => {
  // Guards against the opposite error: pointing a menu at a dialogue that cannot compute anything.
  const dialog = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/cad/components/CalcPointDialog.tsx'), 'utf8');

  it('the dialogue offers every method the label advertises', () => {
    for (const method of ['DIST_DIST', 'BRG_DIST', 'TWO_BEARINGS', 'FOURTH_CORNER']) {
      expect(dialog).toContain(method);
    }
  });

  it('it computes with the real COGO module', () => {
    expect(dialog).toContain("from '@/lib/cad/geometry/cogo'");
  });
});
