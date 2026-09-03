// __tests__/research/create-modal-fields.test.ts — every field on the New Research Project form.
//
// ── THIS FILE USED TO GUARD THE OPPOSITE RULE ───────────────────────────────────────────────────
//
// It was `create-modal-progressive-disclosure.test.ts`, and it enforced that City, ZIP, owner,
// project name and notes stayed BEHIND an "Optional details" accordion. The reasoning was that the
// required path is short and the rest is optional detail.
//
// The owner reversed that on 2026-09-02: "I want you to fully rebuild and stylize and format the
// popup that takes the information that we put into it so that all of the fields are displayed
// clearly." Optional and hidden turned out to be different claims, and the second was wrong here —
// City and ZIP change which parcel the search finds, the owner name is what the county clerk index
// is searched on, and the notes are the only thing that tells the AI what the operator already
// knows. Folding them away made a nearly-empty form look finished.
//
// The disclosure assertions are gone and replaced by their inverse. Everything else in this file
// was worth keeping and is unchanged in substance: those assertions are about fields REACHING THE
// SERVER, which is a different question from where they sit on screen, and it is still the failure
// that would be invisible.
//
// ── WHAT MUST NOT REGRESS ───────────────────────────────────────────────────────────────────────
//
// The form posts `{...newProject}` — a spread. Every field reaches the API for exactly one reason:
// it is bound to that one state object. If somebody later "tidies" the spread into an explicit
// field list, fields silently stop being saved and the modal looks completely correct while doing
// it.

import { describe, it, expect } from 'vitest';
import { readSource } from '../helpers/read-source';

const FORM = 'app/admin/research/_tabs/ProjectsTab.tsx';

const src = readSource(FORM)
  .split('\r\n').join('\n')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');   // JSX comments — this form explains itself at length

/** Every field on the form's state object, read from the initializer rather than hardcoded, so this
 *  file cannot go stale the next time one is added. */
function stateFields(): string[] {
  const at = src.indexOf('const [newProject, setNewProject] = useState({');
  expect(at, 'could not find the state initializer').toBeGreaterThan(-1);
  const initializer = src.slice(at, src.indexOf('  });', at));
  return [...initializer.matchAll(/^\s{4}([a-z_]+):/gm)].map((m) => m[1]);
}

describe('every field is on screen', () => {
  it('the "Optional details" disclosure is gone', () => {
    // The owner asked for all fields displayed clearly. A disclosure is the opposite of that.
    expect(src, 'the accordion is back').not.toContain('<Accordion');
    expect(src, 'the accordion summary is back').not.toContain('"none set"');
  });

  it('the fields the owner named all have a labelled input', () => {
    // Named one by one because this is the actual request: "a place for the number with street
    // name, the city, the state, the zip, the county, the owner, the project, the instrument
    // number, and a notes section and a place to upload files".
    for (const id of [
      'np-street-number', 'np-street-name', 'np-city', 'np-state', 'np-zip',
      'np-county', 'np-owner', 'np-parcel', 'np-instrument', 'np-name', 'np-notes', 'np-files',
    ]) {
      expect(src, `no input with id="${id}"`).toContain(`id="${id}"`);
      expect(src, `no label pointing at ${id}`).toContain(`htmlFor="${id}"`);
    }
  });

  it('groups them, because twelve ungrouped inputs is a wall', () => {
    // fieldset/legend rather than divs: a screen reader announces the legend with each field
    // inside it, so "Number" is heard as "Where is it? Number" rather than as a bare word.
    expect(src).toContain('<fieldset className="research-modal__section">');
    expect(src).toContain('<legend className="research-modal__section-title">');
    const legends = [...src.matchAll(/research-modal__section-title">([^<]+)</g)].map(m => m[1].trim());
    expect(legends.length, 'expected several sections').toBeGreaterThanOrEqual(4);
  });
});

describe('a field on screen is only useful if it is SAVED', () => {
  it('the POST body is still a spread of the whole form state', () => {
    // The single line that keeps every field working. Replacing it with an explicit field list
    // would drop them, silently, with the UI looking perfect.
    expect(
      src,
      'fields reach the API only because the whole state object is spread',
    ).toMatch(/JSON\.stringify\(\{\s*\.\.\.newProject/);
  });

  it('every field writes into that same state object, not a local', () => {
    for (const field of ['city', 'zip', 'owner_name', 'description', 'street_number', 'street_name', 'instrument_number']) {
      expect(src, `${field} must write into newProject`)
        .toMatch(new RegExp(`setNewProject\\(p => \\(\\{ \\.\\.\\.p, ${field}:`));
    }
  });

  it('the reset after a create names EVERY field, so the next project starts clean', () => {
    // A field omitted from the reset keeps the previous project's value — worse than losing it,
    // because it looks deliberate.
    //
    // Re-pointed 2026-09-02: this anchored on the literal `setNewProject({ name:` and checked four
    // hardcoded names, so wrapping that call across lines broke the anchor, `slice(-1)` handed the
    // assertion a newline, and it reported a missing `city` that was present. It derives the field
    // list from the initializer now and covers all of them.
    const fields = stateFields();
    // CONTROL: an empty list would make the loop below vacuously true.
    expect(fields.length, 'could not read the state initializer').toBeGreaterThan(8);

    const resetAt = src.indexOf('setNewProject({', src.indexOf('const data = await res.json()'));
    expect(resetAt, 'no post-create reset found').toBeGreaterThan(-1);
    const reset = src.slice(resetAt, resetAt + 600);

    for (const field of fields) {
      expect(reset, `${field} is missing from the post-create reset`).toContain(`${field}:`);
    }
  });

  it('and the server stores every one of them', () => {
    // The other half. A field bound, spread and posted still does nothing if the route drops it —
    // which is exactly what happened to city and zip before seed 624.
    const route = readSource('app/api/admin/research/route.ts');
    for (const col of [
      'street_number', 'street_name', 'unit', 'city', 'zip',
      'county', 'state', 'parcel_id', 'instrument_number', 'intake_notes',
    ]) {
      expect(route, `${col} is never inserted by the create route`).toContain(`${col}:`);
    }
  });
});

describe('the money control is not hidden', () => {
  it('the paid-documents toggle is still on the form', () => {
    // Folding away the one control that can spend money would be the worst possible choice of
    // thing to hide — which is why the old disclosure guard checked this, and why it survives.
    expect(src).toContain('data-testid="allow-paid-documents"');
    expect(src).toMatch(/setNewProject\(p => \(\{ \.\.\.p, allow_paid_documents:/);
  });

  it('and it still explains both states, not just the one it is in', () => {
    expect(src).toMatch(/\$1–3 each/);
    expect(src).toMatch(/Free county sources only/);
  });
});
