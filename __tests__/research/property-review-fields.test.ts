// __tests__/research/property-review-fields.test.ts — B1a.
//
// Which property facts the Review tab shows, and which source wins when two disagree.
//
// Every field has a fallback, and the precedence is the only thing in that block a surveyor would
// notice being wrong: a stale intake address beating a freshly-researched one, or an owner name the
// run found being hidden behind an empty column.
//
// The block this came from carried its own note that three of the columns it cast to do not exist
// on `research_projects` — each had a working fallback, so the display was right and the first
// operand of every `||` was dead. The identical cast three lines up the same file WAS doing damage:
// an always-`undefined` `owner_name` meant the worker's owner-based clerk search never ran. Dead
// code that looks like working code is the reason this is a tested function now.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  propertyReviewFields, type ProjectLike,
} from '../../app/admin/research/[projectId]/_sections/property-review-fields';

const proj = (over: Partial<ProjectLike> = {}, result: Record<string, unknown> | null = null): ProjectLike => ({
  ...over,
  analysis_metadata: result === null ? null : { result },
});

const labels = (f: ReturnType<typeof propertyReviewFields>) => f.map((x) => x.label);
const valueOf = (f: ReturnType<typeof propertyReviewFields>, label: string) =>
  f.find((x) => x.label === label)?.value ?? null;

describe('which source wins', () => {
  it('prefers the intake address, falling back to the run\'s situs address', () => {
    expect(valueOf(propertyReviewFields(proj({ property_address: '12 Oak' }, { situsAddress: '99 Elm' }), null),
      'Property Address')).toBe('12 Oak');
    expect(valueOf(propertyReviewFields(proj({}, { situsAddress: '99 Elm' }), null),
      'Property Address')).toBe('99 Elm');
  });

  it('prefers the RUN\'s legal description over the intake summary', () => {
    // The opposite precedence to the address, deliberately: the run's is researched, the project
    // column is whatever was typed at intake.
    expect(valueOf(
      propertyReviewFields(proj({ legal_description_summary: 'typed' }, { legalDescription: 'researched' }), null),
      'Legal Description',
    )).toBe('researched');
    expect(valueOf(propertyReviewFields(proj({ legal_description_summary: 'typed' }, {}), null),
      'Legal Description')).toBe('typed');
  });

  it('takes the owner name it is given, falling back to the run', () => {
    // `projectOwnerName()` already knows the several places an owner name has been written. Doing
    // that lookup again here is how two copies of one rule start disagreeing.
    expect(valueOf(propertyReviewFields(proj({}, { ownerName: 'from run' }), 'from lookup'), 'Owner Name'))
      .toBe('from lookup');
    expect(valueOf(propertyReviewFields(proj({}, { ownerName: 'from run' }), null), 'Owner Name'))
      .toBe('from run');
    expect(valueOf(propertyReviewFields(proj({}, { ownerName: 'from run' }), undefined), 'Owner Name'))
      .toBe('from run');
  });

  it('prefers the intake parcel id, falling back to the run\'s property id', () => {
    expect(valueOf(propertyReviewFields(proj({ parcel_id: 'R123' }, { propertyId: 'R999' }), null),
      'Parcel / Property ID')).toBe('R123');
    expect(valueOf(propertyReviewFields(proj({}, { propertyId: 'R999' }), null),
      'Parcel / Property ID')).toBe('R999');
  });
});

describe('what is shown and what is hidden', () => {
  it('hides a field with nothing behind it', () => {
    expect(propertyReviewFields(proj(), null)).toEqual([]);
  });

  it('treats an empty string and whitespace as nothing', () => {
    // `''` and `'   '` reached the grid as blank rows with a label and no value.
    expect(propertyReviewFields(proj({ county: '', state: '   ' }), null)).toEqual([]);
  });

  it('shows every field when every field is present', () => {
    const fields = propertyReviewFields(
      proj({ property_address: 'a', county: 'b', state: 'c', parcel_id: 'd', legal_description_summary: 'e' },
        { lotNumber: '5', blockNumber: '2', subdivisionName: 'Oakwood', acreage: 1.25 }),
      'Owner',
    );
    expect(labels(fields)).toEqual([
      'Property Address', 'County', 'State', 'Owner Name', 'Parcel / Property ID',
      'Lot', 'Block', 'Subdivision', 'Legal Description', 'Acreage',
    ]);
  });

  it('renders a numeric lot or block, which a string check would have dropped', () => {
    // A plat's lot number arrives as a number often enough, and `str()` has to cope.
    const fields = propertyReviewFields(proj({}, { lotNumber: 5, blockNumber: 0 }), null);
    expect(valueOf(fields, 'Lot')).toBe('5');
    expect(valueOf(fields, 'Block'), 'block 0 is a real block').toBe('0');
  });

  it('formats acreage with its unit', () => {
    expect(valueOf(propertyReviewFields(proj({}, { acreage: 2.5 }), null), 'Acreage')).toBe('2.5 ac');
  });

  it('hides acreage only when it is absent, not when it is zero', () => {
    // `result.acreage ? …` dropped a genuine 0. Zero acres is not a real parcel — but the identical
    // shortcut hid a zero DOCUMENT count two components away, and that one mattered a great deal.
    expect(valueOf(propertyReviewFields(proj({}, { acreage: 0 }), null), 'Acreage')).toBe('0 ac');
    expect(valueOf(propertyReviewFields(proj({}, {}), null), 'Acreage')).toBeNull();
  });

  it('survives a project with no analysis metadata at all', () => {
    expect(() => propertyReviewFields({ county: 'Bell' }, null)).not.toThrow();
    expect(labels(propertyReviewFields({ county: 'Bell' }, null))).toEqual(['County']);
  });

  it('survives analysis metadata that is not the shape expected', () => {
    expect(() => propertyReviewFields({ analysis_metadata: 'a string' } as ProjectLike, null)).not.toThrow();
    expect(() => propertyReviewFields({ analysis_metadata: { result: 42 } } as ProjectLike, null)).not.toThrow();
  });
});

describe('the page uses it', () => {
  const PAGE = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/research/[projectId]/page.tsx'), 'utf8',
  );

  it('imports and calls it', () => {
    expect(PAGE).toContain("from './_sections/property-review-fields'");
    expect(PAGE).toContain('propertyReviewFields(');
  });

  it('no longer builds the field list inline', () => {
    expect(PAGE, 'the inline field array is back').not.toContain("{ label: 'Parcel / Property ID'");
  });

  it('and the empty state is no longer an unmeasurable inline colour', () => {
    // `color: '#94a3b8'` is 2.56:1 on white, and no stylesheet contains it — so the F2 sweep, which
    // reads stylesheets, could not see it. It is a class now, and the class IS measured.
    expect(PAGE).toContain('review-property-empty');
    expect(PAGE, 'the inline grey is back').not.toContain("color: '#94a3b8', fontStyle: 'italic'");
  });
});
