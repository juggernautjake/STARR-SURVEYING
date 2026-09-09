// __tests__/research/create-modal-fields.test.ts — every field on the intake form is on screen AND saved.
//
// The form shows a field, the state holds it, the POST spreads the state, the route inserts the
// column. Break any link and the modal looks completely correct while silently dropping a value —
// which is what happened to city and zip before seed 624. This file walks the chain.
//
// Rewritten 2026-09-09 for the owner's redesigned modal (NewResearchProjectModal): six sections,
// the owner name and instrument number now arrive as typed "additional information" lines rather
// than fixed fields, and the run settings (spend switch, readiness) moved to the research page.

import { describe, it, expect } from 'vitest';
import { readSource } from '../helpers/read-source';

const FORM = 'app/admin/research/components/NewResearchProjectModal.tsx';

const src = readSource(FORM)
  .split('\r\n').join('\n')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');   // JSX comments — this form explains itself at length

/** Every field on the form's state, read from the interface rather than hardcoded, so this file
 *  cannot go stale the next time one is added. */
function stateFields(): string[] {
  const at = src.indexOf('interface FormState {');
  expect(at, 'could not find the form state interface').toBeGreaterThan(-1);
  const block = src.slice(at, src.indexOf('}', at));
  return [...block.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]);
}

describe('every field is on screen', () => {
  it('the fields of the drawing all have a labelled input', () => {
    for (const id of ['np-name', 'np-street-number', 'np-street-name', 'np-unit', 'np-city', 'np-state', 'np-zip', 'np-county', 'np-parcel', 'np-owner', 'np-notes']) {
      expect(src, `no input with id="${id}"`).toContain(`id="${id}"`);
    }
    // The street number and name share ONE label (the drawing's "Street Number & Name") — the
    // number input is labelled through aria-label so both stay reachable.
    for (const id of ['np-name', 'np-street-number', 'np-unit', 'np-city', 'np-state', 'np-zip', 'np-county', 'np-parcel', 'np-owner', 'np-notes']) {
      expect(src, `no label pointing at ${id}`).toContain(`htmlFor="${id}"`);
    }
    expect(src).toContain('aria-label="Street name"');
  });

  it('groups them into the six sections of the drawing', () => {
    const titles = [...src.matchAll(/<Section\s+step=\{(\d)\}\s+title="([^"]+)"/g)].map((m) => m[2]);
    expect(titles).toEqual(['Project name', 'Where is it?', 'Additional Information', 'File Upload', 'Link to a project', 'Additional Notes']);
  });

  it('no field hides behind a disclosure', () => {
    expect(src, 'the accordion is back').not.toContain('<Accordion');
  });
});

describe('a field on screen is only useful if it is SAVED', () => {
  it('the POST body is a spread of the whole form state', () => {
    // The single line that keeps every field working. Replacing it with an explicit field list
    // would drop them, silently, with the UI looking perfect.
    expect(src).toMatch(/JSON\.stringify\(\{\s*\.\.\.form/);
  });

  it('every field writes into that same state object, not a local', () => {
    for (const field of ['name', 'street_number', 'street_name', 'unit', 'city', 'state', 'zip', 'county', 'parcel_id', 'owner_name', 'intake_notes', 'job_ids']) {
      expect(src, `${field} must write into the form state`).toMatch(new RegExp(`set\\('${field}',`));
    }
    expect(src, 'project_id is set with its jobs').toContain('project_id: p.id, job_ids: []');
  });

  it('the form starts clean every time it opens, with EVERY field named', () => {
    // A field omitted from the initial state keeps nothing, but a field omitted from the reset
    // keeps the previous project's value — worse than losing it, because it looks deliberate. The
    // modal resets to one literal (EMPTY_FORM) on open, so the literal must name them all.
    const fields = stateFields();
    expect(fields.length, 'could not read the form state').toBeGreaterThan(8);
    const at = src.indexOf('const EMPTY_FORM: FormState = {');
    expect(at).toBeGreaterThan(-1);
    const literal = src.slice(at, src.indexOf('};', at));
    for (const field of fields) expect(literal, `${field} is missing from EMPTY_FORM`).toContain(`${field}:`);
    expect(src).toContain('setForm(EMPTY_FORM);');
  });

  it('and the server stores every one of them', () => {
    const route = readSource('app/api/admin/research/route.ts');
    for (const col of ['street_number', 'street_name', 'unit', 'city', 'zip', 'county', 'state', 'parcel_id', 'intake_notes', 'project_id']) {
      expect(route, `${col} is never inserted by the create route`).toContain(`${col}:`);
    }
    expect(route).toContain(".from('research_project_jobs')");
  });
});

describe('what moved off the form, on purpose', () => {
  it('the instrument number is a typed information line; the current owner stays a fixed field under the Property ID', () => {
    // Owner, 2026-09-09 follow-up: "place the current owner name field beneath the property id field."
    // Presence first, then order — an ordering probe alone passes when the parcel field is GONE.
    const parcelAt = src.search(/id="np-parcel"/);
    const ownerAt = src.search(/id="np-owner"/);
    expect(parcelAt).toBeGreaterThan(-1);
    expect(ownerAt).toBeGreaterThan(-1);
    expect(ownerAt).toBeGreaterThan(parcelAt);
    expect(src).not.toContain('id="np-instrument"');
    expect(src).toContain("from '@/lib/research/intake-info'");
    expect(src).toContain('linesToSupplemental(lines)');
  });

  it('the money control is NOT on the intake form — it lives with the run settings', () => {
    // Owner, 2026-09-09: the modal takes information in; the research page sets the run up.
    expect(src).not.toContain('allow_paid_documents');
    expect(src).not.toContain('assessRunReadiness');
  });
});
