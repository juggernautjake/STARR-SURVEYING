import { describe, it, expect } from 'vitest';
import { assessRunReadiness, describeRunReadiness } from '@/lib/research/run-readiness';
import { readCode as code } from '../helpers/read-source';

// ── WHAT THE GATE USED TO BE ────────────────────────────────────────────────────────────────────
//
//     const hasInputs = Boolean(project.property_address || project.parcel_id) || documents.length > 0;
//
// Any non-empty string enabled the button. The API checked the county and nothing else. So a run
// could start on a road name with no number, spend twenty-five minutes and real money, and come back
// with either nothing or — the outcome that actually matters — a confident report about a different
// parcel on the same road.
//
// This codebase already refuses to guess a county from a city for that exact reason: "a wrong county
// routes to the wrong clerk and produces a confident report about somebody else's land". A road name
// with no number is the same hazard one level down.

const BELL = { county: 'Bell', state: 'TX' };

describe('county is required, and nothing substitutes for it', () => {
  it('refuses without one even when everything else is present', () => {
    const r = assessRunReadiness({
      state: 'TX', parcelId: '42156', streetNumber: '3779', streetName: 'W FM 436',
      city: 'Belton', zip: '76513', ownerName: 'GOODNIGHT, W GENE ETUX',
    });
    expect(r.canRun).toBe(false);
    expect(r.headline).toMatch(/county is required/i);
  });

  it('explains WHY, including why it is not guessed from the city', () => {
    const r = assessRunReadiness({ streetNumber: '123', streetName: 'MAIN ST', city: 'Belton' });
    expect(r.whatWouldWork.join(' ')).toMatch(/not guessed from the city/i);
    expect(r.whatWouldWork.join(' ')).toMatch(/wrong place|wrong county/i);
  });
});

describe('what IS enough', () => {
  it('a Property ID is exact', () => {
    const r = assessRunReadiness({ ...BELL, parcelId: '42156' });
    expect(r.canRun).toBe(true);
    expect(r.confidence).toBe('exact');
    expect(r.whatWouldWork).toEqual([]);
  });

  it('an instrument number is strong — it names a specific document', () => {
    const r = assessRunReadiness({ ...BELL, instrumentNumber: '2022074210' });
    expect(r.canRun).toBe(true);
    expect(r.confidence).toBe('strong');
    // But it says out loud that everything rests on that one document being right.
    expect(r.caution).toMatch(/right one|cross-check/i);
  });

  it('street number + street name is enough, and a city makes it strong', () => {
    const bare = assessRunReadiness({ ...BELL, streetNumber: '3779', streetName: 'W FM 436' });
    expect(bare.canRun).toBe(true);
    expect(bare.confidence).toBe('workable');
    expect(bare.caution).toMatch(/more than one town/i);

    const withCity = assessRunReadiness({ ...BELL, streetNumber: '3779', streetName: 'W FM 436', city: 'Belton' });
    expect(withCity.confidence).toBe('strong');
    expect(withCity.caution).toBeNull();
  });

  it('a street name plus a city, or plus an owner, is workable', () => {
    expect(assessRunReadiness({ ...BELL, streetName: 'CEDAR CREEK', city: 'Belton' }).canRun).toBe(true);
    expect(assessRunReadiness({ ...BELL, streetName: 'CEDAR CREEK', ownerName: 'LEIGH FAMILY FARMS LLC' }).canRun).toBe(true);
  });

  it('uploaded documents alone can start a run, and say what they are relied on for', () => {
    const r = assessRunReadiness({ ...BELL, documentCount: 3 });
    expect(r.canRun).toBe(true);
    expect(r.caution).toMatch(/legal description/i);
  });
});

describe('what is NOT enough — the cases the old gate let straight through', () => {
  it('a street name with no number', () => {
    // `property_address = "CEDAR CREEK"` passed the old check and started a run.
    const r = assessRunReadiness({ ...BELL, streetName: 'CEDAR CREEK' });
    expect(r.canRun).toBe(false);
    expect(r.headline).toMatch(/single parcel/i);
    expect(r.whatWouldWork[0]).toMatch(/street number/i);
    expect(r.whatWouldWork.join(' ')).toMatch(/miles/);
  });

  it('an owner name with no address', () => {
    const r = assessRunReadiness({ ...BELL, ownerName: 'SMITH, JOHN' });
    expect(r.canRun).toBe(false);
    expect(r.whatWouldWork.join(' ')).toMatch(/every parcel/i);
  });

  it('a city and a ZIP, which identify a town and not a parcel', () => {
    expect(assessRunReadiness({ ...BELL, city: 'Belton', zip: '76513' }).canRun).toBe(false);
  });

  it('a street number with no street name', () => {
    const r = assessRunReadiness({ ...BELL, streetNumber: '3779' });
    expect(r.canRun).toBe(false);
    expect(r.whatWouldWork[0]).toMatch(/street name/i);
  });

  it('a county on its own', () => {
    expect(assessRunReadiness(BELL).canRun).toBe(false);
  });

  it('whitespace is not an identifier', () => {
    // The old check was truthiness on a string, so "   " passed it.
    expect(assessRunReadiness({ ...BELL, streetName: '   ', parcelId: '  ' }).canRun).toBe(false);
  });
});

describe('the message names what you gave, not just what you lack', () => {
  it('lists the actual values back, so a value in the wrong box is visible', () => {
    const r = assessRunReadiness({ ...BELL, streetName: 'CEDAR CREEK', city: 'Belton' });
    expect(r.have.join(' ')).toContain('Bell');
    expect(r.have.join(' ')).toContain('CEDAR CREEK');
  });

  it('says "nothing yet" rather than an empty list', () => {
    expect(assessRunReadiness({}).have).toEqual(['nothing yet']);
  });

  it('distinguishes a street name with no number from a street address', () => {
    expect(assessRunReadiness({ ...BELL, streetName: 'CEDAR CREEK' }).have.join(' '))
      .toMatch(/with no number/);
    expect(assessRunReadiness({ ...BELL, streetNumber: '3779', streetName: 'W FM 436' }).have.join(' '))
      .toMatch(/street address/);
  });

  it('describeRunReadiness renders the whole verdict as readable text', () => {
    const text = describeRunReadiness(assessRunReadiness({ ...BELL, streetName: 'CEDAR CREEK' }));
    expect(text).toMatch(/You have supplied/);
    expect(text).toMatch(/To start a run, do any one of these/);
    expect(text).toMatch(/•/);
  });
});

// ── THE CALLERS ─────────────────────────────────────────────────────────────────────────────────

describe('one rule, enforced in every place that can start a run', () => {
  it('the API refuses, which is the guard that actually matters', () => {
    const route = code('app/api/admin/research/[projectId]/pipeline/route.ts');
    expect(route).toContain('assessRunReadiness({');
    expect(route).toContain('if (!readiness.canRun)');
    // The refusal body carries the full explanation, not a bare sentence — an API caller outside
    // the UI reads this too.
    expect(route).toContain('describeRunReadiness(readiness)');
    expect(route).toContain('whatWouldWork');
  });

  it('and the old county-only gate is gone', () => {
    const route = code('app/api/admin/research/[projectId]/pipeline/route.ts');
    expect(route, 'the county-only check is back').not.toContain('if (!payload.county) {');
  });

  it('the run button uses the same function, so it cannot offer a refused run', () => {
    const page = code('app/admin/research/[projectId]/page.tsx');
    expect(page).toContain('assessRunReadiness({');
    expect(page).toContain('const hasInputs = readiness.canRun');
    expect(page, 'the any-truthy-string gate is back')
      .not.toContain('Boolean(project.property_address || project.parcel_id)');
  });

  it('the button explains itself rather than repeating one fixed sentence', () => {
    const page = code('app/admin/research/[projectId]/page.tsx');
    expect(page).toContain('describeRunReadiness(readiness)');
    expect(page).toContain('readiness.whatWouldWork.map');
    expect(page, 'the old catch-all copy is back')
      .not.toContain('Add a property address (or parcel id), or upload a document');
  });

  it('the create modal shows it too, WITHOUT blocking creation', () => {
    const tab = code('app/admin/research/_tabs/ProjectsTab.tsx');
    expect(tab).toContain('assessRunReadiness({');
    // Creating a record for a property that cannot be researched yet is legitimate — you may be
    // about to go and find the Property ID. The create button must still gate on `hasIdentifier`.
    expect(tab).toContain('disabled={!hasIdentifier || creating}');
  });
});
