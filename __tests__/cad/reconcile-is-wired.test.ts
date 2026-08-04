// CAD_AUDIT Slice S14b — the reconciliation is reachable, and draws through the corrected path.
//
// S14a shipped as a pure core, which is this repo's most frequent defect when it stops there. These
// assertions are about the composition: that the Survey menu reaches it, that the confirmation
// happens BEFORE anything lands, and — most importantly — that it does not grow a second way to
// turn calls into features.
//
// Asserted against raw source in CALL shape, for the reason recorded in receipt-bulk-is-wired: two
// different comment-strippers broke here in opposite directions and both accused working code.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const code = fs.readFileSync(path.join(process.cwd(), 'app/admin/cad/components/MenuBar.tsx'), 'utf8');
const fn = code.slice(code.indexOf('async function openReconcileSurveys'));
const body = fn.slice(0, fn.indexOf('async function openDxf'));

describe('it is reachable', () => {
  it('appears in the Survey menu', () => {
    expect(code).toContain('Reconcile several records into a drawing');
    expect(code).toContain('void openReconcileSurveys()');
  });

  it('calls the S14a core rather than reimplementing it', () => {
    expect(code).toContain("from '@/lib/cad/compare/survey-reconcile'");
    expect(body).toContain('reconcileSurveys(');
    expect(body).toContain('pointsFromReconciled(');
  });
});

describe('it refuses what cannot be reconciled', () => {
  it('requires at least two records', () => {
    // One record cannot be reconciled — there is nothing to agree with, and calling a lone deed
    // "reconciled" is the overstatement S14a's fullyAgreed rule exists to prevent.
    expect(body).toMatch(/files\.length < 2/);
  });

  it('names non-traversable files instead of dropping them', () => {
    // A file that vanishes silently reads as one the surveyor forgot to pick, so they never re-add it.
    expect(body).toContain('unusable');
  });
});

describe('the confirmation is the feature', () => {
  it('shows disputes BEFORE anything is added to the drawing', () => {
    // A reconciled boundary looks equally authoritative whether four records agreed or two
    // contradicted each other and the median picked one. Putting that list after the fact — or in
    // the console — means the one person who needs it is the one least likely to see it.
    expect(body).toContain('DISPUTED');
    // The two indices are asserted PRESENT before being compared. `indexOf` returns -1 for a string
    // that is absent, and -1 is less than every real index — so a bare `toBeLessThan` passes hardest
    // at the exact moment the confirmation is deleted. That is not hypothetical: this assertion was
    // written that way, the call was removed to watch it fail, and it stayed green.
    const confirmAt = body.indexOf('await confirmAction(');
    const addAt = body.indexOf('addFeatures(');
    expect(confirmAt, 'the confirmation must exist').toBeGreaterThan(-1);
    expect(addAt, 'features must be added').toBeGreaterThan(-1);
    expect(confirmAt).toBeLessThan(addAt);
  });

  it('surfaces uncorroborated courses too, not just contradictions', () => {
    expect(body).toContain('UNCORROBORATED');
  });
});

describe('it draws through the corrected import path, not a second one', () => {
  it('reuses the S8a adapter', () => {
    // A second way to turn calls into features is how the two come to disagree — and this one would
    // miss the layer creation, the OPEN-when-incomplete rule and the fit-to-page that S8c/S8d fixed.
    expect(body).toContain('featuresFromSurveyReading(');
    expect(body).toContain('researchLayersToCreate(');
  });

  it('creates layers before adding features', () => {
    // The S8c ordering. Features added first are invisible until an unrelated re-render.
    const layerAt = body.indexOf('addLayer(');
    const featAt = body.indexOf('addFeatures(');
    expect(layerAt, 'layers must be created').toBeGreaterThan(-1);
    expect(featAt, 'features must be added').toBeGreaterThan(-1);
    expect(layerAt).toBeLessThan(featAt);
  });

  it('marks the boundary unusable when the walk stopped early', () => {
    // An early stop IS an unusable call, so the figure must come in OPEN. Drawing a closed polygon
    // over a figure that stopped at course 2 is exactly the failure S8a exists to prevent.
    expect(body).toMatch(/unusable:\s*walked\.stoppedReason/);
  });

  it('frames the result like every other import', () => {
    expect(body).toContain('cad:fitDrawingToPage');
    expect(body).toContain('wasEmpty');
  });
});
